import {
  Program,
  Statement,
  Expression,
  TypeAnnotation,
} from "../parser/ast.js";
import { Diagnostic, errorDiag, warnDiag } from "../errors/diagnostic.js";
import { TypeEnvironment } from "./environment.js";
import {
  NkType,
  NK_INT,
  NK_FLOAT,
  NK_STRING,
  NK_BOOL,
  NK_VOID,
  NK_NULL,
  NK_ANY,
  NkFunction,
  NkStruct,
  NkClass,
  NkResult,
  isAssignable,
  typeToString,
  NkTypeVar,
  NkModule,
} from "./types.js";

export class TypeChecker {
  readonly diagnostics: Diagnostic[] = [];
  readonly typeMap: Map<number, NkType> = new Map();
  readonly symbolMap: Map<string, { type: NkType; offset: number }[]> =
    new Map();
  private env = new TypeEnvironment();
  private file: string;
  private currentReturnType: NkType | undefined;
  private externalTypes: Map<string, Map<string, NkType>> | undefined;
  private moduleRegistry: Map<string, NkModule> = new Map();

  constructor(
    file = "<stdin>",
    externalTypes?: Map<string, Map<string, NkType>>,
  ) {
    this.file = file;
    this.externalTypes = externalTypes;
    this.registerStdlib();
  }

  check(program: Program): void {
    for (const stmt of program.body) {
      this.checkStatement(stmt);
    }
  }

  /** Returns the types of all top-level definitions after checking. */
  getExportedTypes(): Map<string, NkType> {
    const exports = new Map<string, NkType>();
    for (const [name, type] of this.env.getTopLevelScope()) {
      exports.set(name, type);
    }
    return exports;
  }

  private registerStdlib(): void {
    // print(...)
    this.env.define("print", {
      tag: "function",
      params: [NK_ANY],
      returnType: NK_VOID,
    });
    // http module
    this.env.define("http", NK_ANY);
    // json module
    this.env.define("json", NK_ANY);
    // math module
    this.env.define("math", NK_ANY);
    // fs module (async file I/O)
    this.env.define("fs", NK_ANY);
    // stream module (sync I/O)
    this.env.define("stream", NK_ANY);
    // assert(condition, message?)
    this.env.define("assert", {
      tag: "function",
      params: [NK_BOOL, NK_STRING],
      returnType: NK_VOID,
    });
  }

  private error(
    message: string,
    node: { span: { line: number; column: number; offset: number } },
    hint?: string,
  ): void {
    this.diagnostics.push(
      errorDiag(
        message,
        {
          file: this.file,
          line: node.span.line,
          column: node.span.column,
          offset: node.span.offset,
        },
        hint,
      ),
    );
  }

  private warn(
    message: string,
    node: { span: { line: number; column: number; offset: number } },
    hint?: string,
  ): void {
    this.diagnostics.push(
      warnDiag(
        message,
        {
          file: this.file,
          line: node.span.line,
          column: node.span.column,
          offset: node.span.offset,
        },
        hint,
      ),
    );
  }

  /** Find the closest matching name for a "did you mean?" suggestion. */
  private suggestName(name: string): string | undefined {
    const candidates = this.env.allNames();
    return findClosest(name, candidates);
  }

  /** Find the closest matching type name. */
  private suggestType(name: string): string | undefined {
    const builtins = ["int", "float", "string", "bool", "void"];
    const registered = this.env.allTypeNames();
    return findClosest(name, [...builtins, ...registered]);
  }

  private recordType(expr: Expression, type: NkType): NkType {
    this.typeMap.set(expr.span.offset, type);
    return type;
  }

  private recordSymbol(name: string, type: NkType, offset: number): void {
    let entries = this.symbolMap.get(name);
    if (!entries) {
      entries = [];
      this.symbolMap.set(name, entries);
    }
    entries.push({ type, offset });
  }

  // --- Resolve type annotations ---

  resolveType(ann: TypeAnnotation): NkType {
    switch (ann.kind) {
      case "NamedType":
        return this.resolveNamedType(ann.name);
      case "ArrayType":
        return { tag: "array", elementType: this.resolveType(ann.elementType) };
      case "NullableType":
        return { tag: "nullable", innerType: this.resolveType(ann.innerType) };
      case "GenericType":
        if (ann.name === "Result" && ann.typeArgs.length === 2) {
          return {
            tag: "result",
            okType: this.resolveType(ann.typeArgs[0]),
            errType: this.resolveType(ann.typeArgs[1]),
          };
        }
        if (ann.name === "map" && ann.typeArgs.length === 2) {
          return {
            tag: "map",
            keyType: this.resolveType(ann.typeArgs[0]),
            valueType: this.resolveType(ann.typeArgs[1]),
          };
        }
        return NK_ANY;
      case "FunctionType": {
        const params = ann.params.map((p) => this.resolveType(p));
        const returnType = this.resolveType(ann.returnType);
        return { tag: "function", params, returnType };
      }
      case "TupleType": {
        const elements = ann.elements.map((e) => this.resolveType(e));
        return { tag: "tuple", elements };
      }
      case "UnionType": {
        return {
          tag: "union",
          types: ann.types.map((t) => this.resolveType(t)),
        };
      }
    }
  }

  private resolveNamedType(name: string): NkType {
    switch (name) {
      case "int":
        return NK_INT;
      case "float":
        return NK_FLOAT;
      case "string":
        return NK_STRING;
      case "bool":
        return NK_BOOL;
      case "void":
        return NK_VOID;
      default: {
        const registered = this.env.lookupType(name);
        if (registered) return registered;
        return NK_ANY;
      }
    }
  }

  // --- Statements ---

  private checkStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration": {
        const initType = this.checkExpression(stmt.initializer);
        const isConst = stmt.mutable === false;
        // Feature 3: Variable shadowing detection
        if (this.env.isDefinedInOuterScope(stmt.name)) {
          this.warn(`Variable '${stmt.name}' shadows an outer variable`, stmt);
        }
        if (stmt.type) {
          const declaredType = this.resolveType(stmt.type);
          if (!isAssignable(declaredType, initType)) {
            const hint = typeMismatchHint(declaredType, initType);
            this.error(
              `Type '${typeToString(initType)}' is not assignable to type '${typeToString(declaredType)}'`,
              stmt,
              hint,
            );
          }
          this.env.define(stmt.name, declaredType, isConst);
          this.recordSymbol(stmt.name, declaredType, stmt.span.offset);
        } else {
          // var/const inference
          this.env.define(stmt.name, initType, isConst);
          this.recordSymbol(stmt.name, initType, stmt.span.offset);
        }
        break;
      }

      case "FunctionDeclaration": {
        // Register generic type params as typevars in scope
        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp.name, {
            tag: "typevar",
            name: tp.name,
          } as NkTypeVar);
        }
        const paramTypes = stmt.params.map((p) =>
          p.type ? this.resolveType(p.type) : NK_ANY,
        );
        const returnType = stmt.returnType
          ? this.resolveType(stmt.returnType)
          : NK_VOID;
        const fnType: NkFunction = {
          tag: "function",
          params: paramTypes,
          returnType,
          typeParams:
            stmt.typeParams.length > 0
              ? stmt.typeParams.map((tp) => tp.name)
              : undefined,
        };
        this.env.exitScope();
        this.env.define(stmt.name, fnType);
        this.recordSymbol(stmt.name, fnType, stmt.span.offset);

        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp.name, {
            tag: "typevar",
            name: tp.name,
          } as NkTypeVar);
        }
        for (let i = 0; i < stmt.params.length; i++) {
          this.env.define(stmt.params[i].name, paramTypes[i]);
        }
        const prevReturn = this.currentReturnType;
        this.currentReturnType = returnType;
        this.checkStatement(stmt.body);
        this.currentReturnType = prevReturn;
        // Feature 3: Unused variable warnings
        for (const unused of this.env.getUnusedInCurrentScope()) {
          this.warn(
            `Variable '${unused}' is declared but never used`,
            stmt,
            `Prefix with '_' to suppress this warning`,
          );
        }
        this.env.exitScope();
        break;
      }

      case "ReturnStatement": {
        if (stmt.value) {
          const valType = this.checkExpression(stmt.value);
          if (
            this.currentReturnType &&
            !isAssignable(this.currentReturnType, valType)
          ) {
            const hint = typeMismatchHint(this.currentReturnType, valType);
            this.error(
              `Return type '${typeToString(valType)}' is not assignable to '${typeToString(this.currentReturnType)}'`,
              stmt,
              hint,
            );
          }
        }
        break;
      }

      case "IfStatement": {
        this.checkExpression(stmt.condition);
        const narrowing = this.narrowFromCondition(stmt.condition);
        // Check consequent with narrowed types
        if (narrowing.consequent.size > 0) {
          this.env.pushOverrides(narrowing.consequent);
        }
        this.checkStatement(stmt.consequent);
        if (narrowing.consequent.size > 0) {
          this.env.popOverrides();
        }
        // Check alternate with alternate narrowing
        if (stmt.alternate) {
          if (narrowing.alternate.size > 0) {
            this.env.pushOverrides(narrowing.alternate);
          }
          this.checkStatement(stmt.alternate);
          if (narrowing.alternate.size > 0) {
            this.env.popOverrides();
          }
        }
        break;
      }

      case "WhileStatement":
        this.checkExpression(stmt.condition);
        this.checkStatement(stmt.body);
        break;

      case "ForStatement":
        this.env.enterScope();
        if (stmt.init) this.checkStatement(stmt.init);
        if (stmt.condition) this.checkExpression(stmt.condition);
        if (stmt.update) this.checkExpression(stmt.update);
        this.checkStatement(stmt.body);
        this.env.exitScope();
        break;

      case "ForInStatement": {
        this.env.enterScope();
        const iterableType = this.checkExpression(stmt.iterable);
        // Infer loop variable type from iterable's element type
        let elemType: NkType = NK_ANY;
        if (iterableType.tag === "array") {
          elemType = iterableType.elementType;
        }
        this.env.define(stmt.variable, elemType);
        this.checkStatement(stmt.body);
        this.env.exitScope();
        break;
      }

      case "BlockStatement":
        this.env.enterScope();
        for (let i = 0; i < stmt.body.length; i++) {
          this.checkStatement(stmt.body[i]);
          // Feature 3: Unreachable code detection
          if (
            i < stmt.body.length - 1 &&
            (stmt.body[i].kind === "ReturnStatement" ||
              stmt.body[i].kind === "BreakStatement" ||
              stmt.body[i].kind === "ContinueStatement")
          ) {
            this.warn(
              `Unreachable code after ${stmt.body[i].kind === "ReturnStatement" ? "return" : stmt.body[i].kind === "BreakStatement" ? "break" : "continue"}`,
              stmt.body[i + 1],
            );
            break;
          }
        }
        // Feature 3: Unused variable warnings in block scopes
        for (const unused of this.env.getUnusedInCurrentScope()) {
          this.warn(
            `Variable '${unused}' is declared but never used`,
            stmt,
            `Prefix with '_' to suppress this warning`,
          );
        }
        this.env.exitScope();
        break;

      case "ExpressionStatement":
        this.checkExpression(stmt.expression);
        break;

      case "StructDeclaration": {
        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp.name, NK_ANY);
        }
        const fields = new Map<string, NkType>();
        for (const f of stmt.fields) {
          fields.set(f.name, this.resolveType(f.type));
        }
        const methods = new Map<string, NkFunction>();
        for (const m of stmt.methods) {
          const paramTypes = m.params.map((p) =>
            p.type ? this.resolveType(p.type) : NK_ANY,
          );
          const retType = m.returnType
            ? this.resolveType(m.returnType)
            : NK_VOID;
          methods.set(m.name, {
            tag: "function",
            params: paramTypes,
            returnType: retType,
          });
        }
        const structType: NkStruct = {
          tag: "struct",
          name: stmt.name,
          fields,
          methods,
        };
        this.env.exitScope(); // exit type params scope

        this.env.define(stmt.name, structType);
        this.env.registerType(stmt.name, structType);
        this.recordSymbol(stmt.name, structType, stmt.span.offset);

        // Check method bodies
        for (const m of stmt.methods) {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp.name, NK_ANY);
          }
          this.env.define("this", structType);
          for (const p of m.params) {
            this.env.define(p.name, p.type ? this.resolveType(p.type) : NK_ANY);
          }
          const prevReturn = this.currentReturnType;
          this.currentReturnType = m.returnType
            ? this.resolveType(m.returnType)
            : NK_VOID;
          this.checkStatement(m.body);
          this.currentReturnType = prevReturn;
          this.env.exitScope();
        }
        break;
      }

      case "ClassDeclaration": {
        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp.name, NK_ANY);
        }
        const fields = new Map<string, NkType>();
        for (const f of stmt.fields) {
          fields.set(f.name, this.resolveType(f.type));
        }
        const methods = new Map<string, NkFunction>();
        for (const m of stmt.methods) {
          const paramTypes = m.params.map((p) =>
            p.type ? this.resolveType(p.type) : NK_ANY,
          );
          const retType = m.returnType
            ? this.resolveType(m.returnType)
            : NK_VOID;
          methods.set(m.name, {
            tag: "function",
            params: paramTypes,
            returnType: retType,
          });
        }
        const classType: NkClass = {
          tag: "class",
          name: stmt.name,
          superClass: stmt.superClass,
          fields,
          methods,
        };
        this.env.exitScope(); // exit type params scope

        this.env.define(stmt.name, classType);
        this.env.registerType(stmt.name, classType);
        this.recordSymbol(stmt.name, classType, stmt.span.offset);

        // Feature 2: Interface enforcement
        // Also check superClass — parser treats single name after ':' as superClass,
        // but it may actually be an interface
        const interfaceNames = [...stmt.interfaces];
        if (stmt.superClass) {
          const superType = this.env.lookupType(stmt.superClass);
          if (superType && superType.tag === "interface") {
            interfaceNames.push(stmt.superClass);
          }
        }
        for (const ifaceName of interfaceNames) {
          const ifaceType = this.env.lookupType(ifaceName);
          if (!ifaceType) {
            this.error(`Unknown interface '${ifaceName}'`, stmt);
            continue;
          }
          if (ifaceType.tag === "interface") {
            for (const [methodName, methodType] of ifaceType.methods) {
              const classMethod = classType.methods.get(methodName);
              if (!classMethod) {
                this.error(
                  `Class '${stmt.name}' does not implement method '${methodName}' from interface '${ifaceName}'`,
                  stmt,
                );
              } else {
                // Check param count
                if (classMethod.params.length !== methodType.params.length) {
                  this.error(
                    `Method '${methodName}' in class '${stmt.name}' has wrong number of parameters for interface '${ifaceName}'`,
                    stmt,
                  );
                }
                // Check return type
                if (
                  !isAssignable(methodType.returnType, classMethod.returnType)
                ) {
                  this.error(
                    `Method '${methodName}' in class '${stmt.name}' has incompatible return type for interface '${ifaceName}'`,
                    stmt,
                  );
                }
              }
            }
            for (const [fieldName] of ifaceType.fields) {
              if (!classType.fields.has(fieldName)) {
                this.error(
                  `Class '${stmt.name}' does not implement field '${fieldName}' from interface '${ifaceName}'`,
                  stmt,
                );
              }
            }
          }
        }

        for (const m of stmt.methods) {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp.name, NK_ANY);
          }
          this.env.define("this", classType);
          for (const p of m.params) {
            this.env.define(p.name, p.type ? this.resolveType(p.type) : NK_ANY);
          }
          const prevReturn = this.currentReturnType;
          this.currentReturnType = m.returnType
            ? this.resolveType(m.returnType)
            : NK_VOID;
          this.checkStatement(m.body);
          this.currentReturnType = prevReturn;
          this.env.exitScope();
        }
        break;
      }

      case "InterfaceDeclaration": {
        const methods = new Map<string, NkFunction>();
        for (const m of stmt.methods) {
          const paramTypes = m.params.map((p) =>
            p.type ? this.resolveType(p.type) : NK_ANY,
          );
          const retType = m.returnType
            ? this.resolveType(m.returnType)
            : NK_VOID;
          methods.set(m.name, {
            tag: "function",
            params: paramTypes,
            returnType: retType,
          });
        }
        const ifaceFields = new Map<string, NkType>();
        for (const f of stmt.fields) {
          ifaceFields.set(f.name, this.resolveType(f.type));
        }
        const ifaceType = {
          tag: "interface" as const,
          name: stmt.name,
          methods,
          fields: ifaceFields,
        };
        this.env.define(stmt.name, ifaceType);
        this.env.registerType(stmt.name, ifaceType);
        this.recordSymbol(stmt.name, ifaceType, stmt.span.offset);
        break;
      }

      case "EnumDeclaration": {
        const variantFields = new Map<string, NkType[]>();
        for (const v of stmt.variants) {
          if (v.fields && v.fields.length > 0) {
            variantFields.set(
              v.name,
              v.fields.map((f) => this.resolveType(f.type)),
            );
          }
        }
        const enumType = {
          tag: "enum" as const,
          name: stmt.name,
          variants: stmt.variants.map((v) => v.name),
          variantFields,
        };
        this.env.define(stmt.name, enumType);
        this.env.registerType(stmt.name, enumType);
        this.recordSymbol(stmt.name, enumType, stmt.span.offset);
        break;
      }

      case "TypeAlias": {
        const aliasedType = this.resolveType(stmt.type);
        this.env.registerType(stmt.name, aliasedType);
        break;
      }

      case "TakeStatement": {
        const takeModule = this.moduleRegistry.get(stmt.path);
        for (const name of stmt.names) {
          let type: NkType = NK_ANY;
          if (takeModule) {
            const memberType = takeModule.members.get(name);
            if (memberType) {
              type = memberType;
            } else {
              this.error(
                `Module '${stmt.path}' has no exported member '${name}'`,
                stmt,
              );
            }
          } else if (this.externalTypes) {
            for (const [, types] of this.externalTypes) {
              if (types.has(name)) {
                type = types.get(name)!;
                break;
              }
            }
          }
          this.env.define(name, type);
        }
        break;
      }

      case "LoadStatement": {
        const loadModule = this.moduleRegistry.get(stmt.path);
        if (loadModule) {
          this.env.define(stmt.name, loadModule);
        } else {
          this.env.define(stmt.name, NK_ANY);
        }
        break;
      }

      case "DeclareModuleStatement": {
        const members = new Map<string, NkType>();
        for (const decl of stmt.declarations) {
          if (decl.kind === "DeclareFunctionSignature") {
            const params = decl.params.map((p) =>
              p.type ? this.resolveType(p.type) : NK_ANY,
            );
            const returnType = this.resolveType(decl.returnType);
            members.set(decl.name, {
              tag: "function",
              params,
              returnType,
            });
          } else {
            members.set(decl.name, this.resolveType(decl.type));
          }
        }
        this.moduleRegistry.set(stmt.moduleName, {
          tag: "module",
          name: stmt.moduleName,
          members,
        });
        break;
      }

      case "TryCatchStatement":
        this.checkStatement(stmt.tryBlock);
        this.env.enterScope();
        if (stmt.catchBinding) {
          this.env.define(stmt.catchBinding, NK_ANY);
        }
        this.checkStatement(stmt.catchBlock);
        this.env.exitScope();
        break;

      case "MatchStatement": {
        const matchSubjType = this.checkExpression(stmt.subject);
        for (const arm of stmt.arms) {
          this.env.enterScope();
          this.bindMatchPattern(arm.pattern);
          if (arm.body.kind === "BlockStatement") {
            this.checkStatement(arm.body);
          } else {
            this.checkExpression(arm.body);
          }
          this.env.exitScope();
        }
        this.checkMatchExhaustiveness(matchSubjType, stmt.arms, stmt);
        break;
      }

      case "DestructureDeclaration": {
        const initType = this.checkExpression(stmt.initializer);
        if (stmt.pattern === "tuple" && initType.tag === "tuple") {
          if (stmt.names.length !== initType.elements.length) {
            this.error(
              `Tuple destructuring expects ${initType.elements.length} elements, got ${stmt.names.length}`,
              stmt,
            );
          }
          for (let i = 0; i < stmt.names.length; i++) {
            this.env.define(
              stmt.names[i],
              i < initType.elements.length ? initType.elements[i] : NK_ANY,
            );
          }
        } else {
          for (const name of stmt.names) {
            if (stmt.pattern === "array" && initType.tag === "array") {
              this.env.define(name, initType.elementType);
            } else if (
              stmt.pattern === "object" &&
              (initType.tag === "struct" || initType.tag === "class")
            ) {
              const fieldType = initType.fields.get(name);
              this.env.define(name, fieldType ?? NK_ANY);
            } else {
              this.env.define(name, NK_ANY);
            }
          }
        }
        break;
      }

      case "BreakStatement":
      case "ContinueStatement":
        break;
    }
  }

  private bindMatchPattern(pattern: {
    kind: string;
    binding?: string;
    name?: string;
    bindings?: string[];
  }): void {
    if ("binding" in pattern && pattern.binding) {
      this.env.define(pattern.binding, NK_ANY);
    }
    if (
      pattern.kind === "IdentifierPattern" &&
      "name" in pattern &&
      pattern.name
    ) {
      this.env.define(pattern.name as string, NK_ANY);
    }
    if (
      pattern.kind === "EnumVariantPattern" &&
      "bindings" in pattern &&
      pattern.bindings
    ) {
      for (const b of pattern.bindings) {
        this.env.define(b, NK_ANY);
      }
    }
  }

  // --- Expressions ---

  private checkExpression(expr: Expression): NkType {
    const type = this.checkExpressionInner(expr);
    return this.recordType(expr, type);
  }

  private checkExpressionInner(expr: Expression): NkType {
    switch (expr.kind) {
      case "IntLiteral":
        return NK_INT;
      case "FloatLiteral":
        return NK_FLOAT;
      case "StringLiteral":
        return NK_STRING;
      case "BoolLiteral":
        return NK_BOOL;
      case "NullLiteral":
        return NK_NULL;

      case "Identifier": {
        const t = this.env.lookup(expr.name);
        if (!t) {
          const suggestion = this.suggestName(expr.name);
          this.error(
            `Undefined variable '${expr.name}'`,
            expr,
            suggestion ? `Did you mean '${suggestion}'?` : undefined,
          );
          return NK_ANY;
        }
        return t;
      }

      case "BinaryExpr": {
        const left = this.checkExpression(expr.left);
        const right = this.checkExpression(expr.right);

        if (
          expr.operator === "+" ||
          expr.operator === "-" ||
          expr.operator === "*" ||
          expr.operator === "/" ||
          expr.operator === "%"
        ) {
          if (left.tag === "string" && expr.operator === "+") return NK_STRING;
          if (isNumeric(left) && isNumeric(right)) {
            return left.tag === "float" || right.tag === "float"
              ? NK_FLOAT
              : NK_INT;
          }
          if (left.tag !== "any" && right.tag !== "any") {
            let hint: string | undefined;
            if (
              expr.operator === "+" &&
              (left.tag === "string" || right.tag === "string")
            ) {
              hint =
                'Use string interpolation: "${value}" to concatenate mixed types';
            }
            this.error(
              `Operator '${expr.operator}' cannot be applied to '${typeToString(left)}' and '${typeToString(right)}'`,
              expr,
              hint,
            );
          }
          return NK_ANY;
        }

        if (
          expr.operator === "==" ||
          expr.operator === "!=" ||
          expr.operator === "<" ||
          expr.operator === "<=" ||
          expr.operator === ">" ||
          expr.operator === ">="
        ) {
          return NK_BOOL;
        }

        if (expr.operator === "&&" || expr.operator === "||") {
          return NK_BOOL;
        }

        return NK_ANY;
      }

      case "UnaryExpr": {
        const operand = this.checkExpression(expr.operand);
        if (expr.operator === "!") return NK_BOOL;
        if (expr.operator === "-") {
          if (isNumeric(operand)) return operand;
          return NK_ANY;
        }
        return NK_ANY;
      }

      case "CallExpr": {
        const calleeType = this.checkExpression(expr.callee);
        const argTypes: NkType[] = [];
        for (const arg of expr.args) {
          argTypes.push(this.checkExpression(arg));
        }

        // Feature 4: Improved method return types for array methods
        if (
          expr.callee.kind === "MemberExpr" &&
          calleeType.tag === "function"
        ) {
          const objType = this.typeMap.get(expr.callee.object.span.offset);
          if (objType && objType.tag === "array") {
            const elem = objType.elementType;
            const method = expr.callee.property;
            if (method === "map" && argTypes.length > 0) {
              const cbType = argTypes[0];
              if (cbType.tag === "function") {
                return { tag: "array", elementType: cbType.returnType };
              }
            }
            if (method === "filter") {
              return { tag: "array", elementType: elem };
            }
            if (method === "find") {
              return { tag: "nullable", innerType: elem };
            }
            if (method === "reduce" && argTypes.length >= 2) {
              return argTypes[1]; // type of initial value
            }
          }
        }

        if (calleeType.tag === "function") {
          if (expr.args.length !== calleeType.params.length) {
            // print and assert are variadic-ish
            const isVariadic =
              expr.callee.kind === "Identifier" &&
              (expr.callee.name === "print" || expr.callee.name === "assert");
            if (!isVariadic) {
              const fnName =
                expr.callee.kind === "Identifier"
                  ? expr.callee.name
                  : "function";
              const paramStr = calleeType.params
                .map((p) => typeToString(p))
                .join(", ");
              this.error(
                `Expected ${calleeType.params.length} arguments, got ${expr.args.length}`,
                expr,
                `'${fnName}' expects (${paramStr})`,
              );
            }
          }
          // Generic type inference
          if (calleeType.typeParams && calleeType.typeParams.length > 0) {
            const substitution = this.inferTypeArgs(calleeType, argTypes);
            return this.applySubstitution(calleeType.returnType, substitution);
          }
          return calleeType.returnType;
        }
        return NK_ANY;
      }

      case "MemberExpr": {
        const objType = this.checkExpression(expr.object);
        if (objType.tag === "struct" || objType.tag === "class") {
          const fieldType = objType.fields.get(expr.property);
          if (fieldType) return fieldType;
          const methodType = objType.methods.get(expr.property);
          if (methodType) return methodType;
        }
        // Array built-in properties/methods
        if (objType.tag === "array") {
          const elem = objType.elementType;
          switch (expr.property) {
            case "length":
              return NK_INT;
            case "push":
            case "pop":
            case "shift":
            case "unshift":
              return { tag: "function", params: [elem], returnType: NK_INT };
            case "map":
            case "filter":
            case "forEach":
            case "find":
              return {
                tag: "function",
                params: [NK_ANY],
                returnType: { tag: "array", elementType: NK_ANY },
              };
            case "reduce":
              return {
                tag: "function",
                params: [NK_ANY, NK_ANY],
                returnType: NK_ANY,
              };
            case "includes":
              return { tag: "function", params: [elem], returnType: NK_BOOL };
            case "indexOf":
              return { tag: "function", params: [elem], returnType: NK_INT };
            case "slice":
            case "concat":
              return { tag: "function", params: [NK_INT], returnType: objType };
            case "join":
              return {
                tag: "function",
                params: [NK_STRING],
                returnType: NK_STRING,
              };
          }
        }
        // String built-in properties/methods
        if (objType.tag === "string") {
          switch (expr.property) {
            case "length":
              return NK_INT;
            case "includes":
            case "startsWith":
            case "endsWith":
              return {
                tag: "function",
                params: [NK_STRING],
                returnType: NK_BOOL,
              };
            case "indexOf":
            case "lastIndexOf":
              return {
                tag: "function",
                params: [NK_STRING],
                returnType: NK_INT,
              };
            case "toLowerCase":
            case "toUpperCase":
            case "trim":
            case "trimStart":
            case "trimEnd":
              return {
                tag: "function",
                params: [],
                returnType: NK_STRING,
              };
            case "slice":
            case "substring":
            case "replace":
            case "replaceAll":
              return {
                tag: "function",
                params: [NK_STRING],
                returnType: NK_STRING,
              };
            case "split":
              return {
                tag: "function",
                params: [NK_STRING],
                returnType: { tag: "array", elementType: NK_STRING },
              };
            case "charAt":
              return {
                tag: "function",
                params: [NK_INT],
                returnType: NK_STRING,
              };
          }
        }
        // Enum member access
        if (objType.tag === "enum") {
          if (objType.variants.includes(expr.property)) {
            const fields = objType.variantFields.get(expr.property);
            if (fields && fields.length > 0) {
              // Variant with associated data acts as a factory function
              return {
                tag: "function",
                params: fields,
                returnType: objType,
              };
            }
            return objType;
          }
        }
        // Map built-in properties/methods
        if (objType.tag === "map") {
          const val = objType.valueType;
          switch (expr.property) {
            case "size":
              return NK_INT;
            case "has":
              return {
                tag: "function",
                params: [objType.keyType],
                returnType: NK_BOOL,
              };
            case "get":
              return {
                tag: "function",
                params: [objType.keyType],
                returnType: val,
              };
            case "set":
              return {
                tag: "function",
                params: [objType.keyType, val],
                returnType: NK_VOID,
              };
            case "delete":
              return {
                tag: "function",
                params: [objType.keyType],
                returnType: NK_BOOL,
              };
            case "keys":
              return {
                tag: "function",
                params: [],
                returnType: { tag: "array", elementType: objType.keyType },
              };
            case "values":
              return {
                tag: "function",
                params: [],
                returnType: { tag: "array", elementType: val },
              };
            case "clear":
              return { tag: "function", params: [], returnType: NK_VOID };
          }
        }
        // Module member access
        if (objType.tag === "module") {
          const memberType = objType.members.get(expr.property);
          if (memberType) return memberType;
        }
        return NK_ANY;
      }

      case "IndexExpr": {
        const objType2 = this.checkExpression(expr.object);
        this.checkExpression(expr.index);
        if (objType2.tag === "array") return objType2.elementType;
        if (objType2.tag === "string") return NK_STRING;
        if (objType2.tag === "map") return objType2.valueType;
        return NK_ANY;
      }

      case "AssignExpr": {
        if (
          expr.target.kind === "Identifier" &&
          this.env.isConst(expr.target.name)
        ) {
          this.error(
            `Cannot assign to '${expr.target.name}' because it is a constant`,
            expr,
          );
        }
        const targetType = this.checkExpression(expr.target);
        const valueType = this.checkExpression(expr.value);
        if (targetType.tag !== "any" && !isAssignable(targetType, valueType)) {
          const hint = typeMismatchHint(targetType, valueType);
          this.error(
            `Type '${typeToString(valueType)}' is not assignable to type '${typeToString(targetType)}'`,
            expr,
            hint,
          );
        }
        return targetType;
      }

      case "ArrowFunction": {
        const paramTypes = expr.params.map((p) =>
          p.type ? this.resolveType(p.type) : NK_ANY,
        );
        this.env.enterScope();
        for (let i = 0; i < expr.params.length; i++) {
          this.env.define(expr.params[i].name, paramTypes[i]);
        }
        let retType: NkType;
        if (expr.body.kind === "BlockStatement") {
          this.checkStatement(expr.body);
          retType = NK_VOID;
        } else {
          retType = this.checkExpression(expr.body);
        }
        this.env.exitScope();
        return { tag: "function", params: paramTypes, returnType: retType };
      }

      case "NewExpr": {
        const calleeType = this.checkExpression(expr.callee);
        for (const arg of expr.args) {
          this.checkExpression(arg);
        }
        if (calleeType.tag === "struct" || calleeType.tag === "class") {
          return calleeType;
        }
        return NK_ANY;
      }

      case "ThisExpr": {
        const thisType = this.env.lookup("this");
        if (!thisType) {
          this.error(
            "'this' used outside of a class or struct",
            expr,
            "'this' is only available inside struct or class methods",
          );
          return NK_ANY;
        }
        return thisType;
      }

      case "ArrayLiteral": {
        if (expr.elements.length === 0)
          return { tag: "array", elementType: NK_ANY };
        const elemType = this.checkExpression(expr.elements[0]);
        for (let i = 1; i < expr.elements.length; i++) {
          this.checkExpression(expr.elements[i]);
        }
        return { tag: "array", elementType: elemType };
      }

      case "MapLiteral": {
        if (expr.entries.length === 0)
          return { tag: "map", keyType: NK_ANY, valueType: NK_ANY };
        const keyType = this.checkExpression(expr.entries[0].key);
        const valueType = this.checkExpression(expr.entries[0].value);
        for (let i = 1; i < expr.entries.length; i++) {
          this.checkExpression(expr.entries[i].key);
          this.checkExpression(expr.entries[i].value);
        }
        return { tag: "map", keyType, valueType };
      }

      case "OkExpr": {
        const valType = this.checkExpression(expr.value);
        return { tag: "result", okType: valType, errType: NK_ANY } as NkResult;
      }

      case "ErrExpr": {
        const valType = this.checkExpression(expr.value);
        return { tag: "result", okType: NK_ANY, errType: valType } as NkResult;
      }

      case "MatchExpr": {
        const matchExprSubjType = this.checkExpression(expr.subject);
        let resultType: NkType = NK_ANY;
        for (const arm of expr.arms) {
          this.env.enterScope();
          this.bindMatchPattern(arm.pattern);
          if (arm.body.kind === "BlockStatement") {
            this.checkStatement(arm.body);
          } else {
            resultType = this.checkExpression(arm.body);
          }
          this.env.exitScope();
        }
        this.checkMatchExhaustiveness(matchExprSubjType, expr.arms, expr);
        return resultType;
      }

      case "StringInterpolation": {
        for (const part of expr.parts) {
          if (typeof part !== "string") {
            this.checkExpression(part);
          }
        }
        return NK_STRING;
      }

      case "CompoundAssignExpr": {
        if (
          expr.target.kind === "Identifier" &&
          this.env.isConst(expr.target.name)
        ) {
          this.error(
            `Cannot assign to '${expr.target.name}' because it is a constant`,
            expr,
          );
        }
        const targetType = this.checkExpression(expr.target);
        this.checkExpression(expr.value);
        return targetType;
      }

      case "UpdateExpr": {
        if (
          expr.argument.kind === "Identifier" &&
          this.env.isConst(expr.argument.name)
        ) {
          this.error(
            `Cannot assign to '${expr.argument.name}' because it is a constant`,
            expr,
          );
        }
        return this.checkExpression(expr.argument);
      }

      case "TernaryExpr": {
        this.checkExpression(expr.condition);
        const consType = this.checkExpression(expr.consequent);
        this.checkExpression(expr.alternate);
        return consType;
      }

      case "SpreadExpr":
        return this.checkExpression(expr.argument);

      case "PipeExpr": {
        this.checkExpression(expr.left);
        const pipeRight = this.checkExpression(expr.right);
        if (pipeRight.tag === "function") {
          return pipeRight.returnType;
        }
        return NK_ANY;
      }

      case "RangeExpr": {
        this.checkExpression(expr.start);
        this.checkExpression(expr.end);
        return { tag: "array", elementType: NK_INT };
      }

      case "TupleLiteral": {
        const elements = expr.elements.map((e) => this.checkExpression(e));
        return { tag: "tuple", elements };
      }

      case "NullCoalesceExpr": {
        const leftType = this.checkExpression(expr.left);
        const rightType = this.checkExpression(expr.right);
        if (leftType.tag === "nullable") {
          return leftType.innerType;
        }
        if (leftType.tag === "null") {
          return rightType;
        }
        if (leftType.tag !== "any") {
          this.warn(
            `Left side of '??' is not nullable (type '${typeToString(leftType)}')`,
            expr,
          );
        }
        return leftType;
      }

      case "ArrayComprehension": {
        const iterableType = this.checkExpression(expr.iterable);
        this.env.enterScope();
        let elemType: NkType = NK_ANY;
        if (iterableType.tag === "array") {
          elemType = iterableType.elementType;
        }
        this.env.define(expr.variable, elemType);
        const bodyType = this.checkExpression(expr.body);
        if (expr.condition) {
          this.checkExpression(expr.condition);
        }
        this.env.exitScope();
        return { tag: "array", elementType: bodyType };
      }

      case "TypeGuardExpr": {
        this.checkExpression(expr.expression);
        return NK_BOOL;
      }

      case "AwaitExpr": {
        return this.checkExpression(expr.argument);
      }

      case "ResultUnwrapExpr": {
        const exprType = this.checkExpression(expr.expression);
        if (exprType.tag === "result") return exprType.okType;
        if (exprType.tag !== "any") {
          this.error(
            "The '?' operator requires a Result type, got '" +
              typeToString(exprType) +
              "'",
            expr,
          );
        }
        return NK_ANY;
      }
    }
  }

  // --- Type narrowing ---

  private narrowFromCondition(condition: Expression): {
    consequent: Map<string, NkType>;
    alternate: Map<string, NkType>;
  } {
    const consequent = new Map<string, NkType>();
    const alternate = new Map<string, NkType>();

    if (condition.kind === "BinaryExpr") {
      const { operator, left, right } = condition;
      // x != null or x !== null → consequent: unwrap nullable
      if (
        (operator === "!=" || operator === "!==") &&
        ((left.kind === "Identifier" && right.kind === "NullLiteral") ||
          (left.kind === "NullLiteral" && right.kind === "Identifier"))
      ) {
        const ident =
          left.kind === "Identifier"
            ? left.name
            : (right as { kind: "Identifier"; name: string }).name;
        const varType = this.env.lookup(ident);
        if (varType && varType.tag === "nullable") {
          consequent.set(ident, varType.innerType);
        }
      }
      // x == null or x === null → alternate: unwrap nullable
      if (
        (operator === "==" || operator === "===") &&
        ((left.kind === "Identifier" && right.kind === "NullLiteral") ||
          (left.kind === "NullLiteral" && right.kind === "Identifier"))
      ) {
        const ident =
          left.kind === "Identifier"
            ? left.name
            : (right as { kind: "Identifier"; name: string }).name;
        const varType = this.env.lookup(ident);
        if (varType && varType.tag === "nullable") {
          alternate.set(ident, varType.innerType);
        }
      }
    }

    // Type guard: x is Type
    if (
      condition.kind === "TypeGuardExpr" &&
      condition.expression.kind === "Identifier"
    ) {
      const guardedType = this.resolveType(condition.guardType);
      consequent.set(condition.expression.name, guardedType);
    }

    return { consequent, alternate };
  }

  // --- Match exhaustiveness ---

  private checkMatchExhaustiveness(
    subjectType: NkType,
    arms: import("../parser/ast.js").MatchArm[],
    node: { span: { line: number; column: number; offset: number } },
  ): void {
    // Skip if wildcard or identifier pattern present (catches everything)
    for (const arm of arms) {
      if (
        arm.pattern.kind === "WildcardPattern" ||
        arm.pattern.kind === "IdentifierPattern"
      ) {
        return;
      }
    }

    if (subjectType.tag === "enum") {
      const covered = new Set<string>();
      for (const arm of arms) {
        if (arm.pattern.kind === "EnumVariantPattern") {
          covered.add(arm.pattern.variant);
        }
      }
      const missing = subjectType.variants.filter((v) => !covered.has(v));
      if (missing.length > 0) {
        this.warn(
          `Non-exhaustive match: missing variant(s) ${missing.map((v) => `'${subjectType.name}.${v}'`).join(", ")}`,
          node,
          "Add a wildcard '_' pattern or handle all variants",
        );
      }
    }

    if (subjectType.tag === "result") {
      let hasOk = false;
      let hasErr = false;
      for (const arm of arms) {
        if (arm.pattern.kind === "OkPattern") hasOk = true;
        if (arm.pattern.kind === "ErrPattern") hasErr = true;
      }
      if (!hasOk || !hasErr) {
        const missing = [];
        if (!hasOk) missing.push("'Ok'");
        if (!hasErr) missing.push("'Err'");
        this.warn(
          `Non-exhaustive match: missing pattern(s) ${missing.join(", ")}`,
          node,
          "Add a wildcard '_' pattern or handle both Ok and Err",
        );
      }
    }
  }

  // --- Generic type inference ---

  private inferTypeArgs(
    fnType: NkFunction,
    argTypes: NkType[],
  ): Map<string, NkType> {
    const substitution = new Map<string, NkType>();
    if (!fnType.typeParams) return substitution;
    for (let i = 0; i < fnType.params.length && i < argTypes.length; i++) {
      this.unify(fnType.params[i], argTypes[i], substitution);
    }
    return substitution;
  }

  private unify(
    paramType: NkType,
    argType: NkType,
    substitution: Map<string, NkType>,
  ): void {
    if (paramType.tag === "typevar") {
      if (!substitution.has(paramType.name)) {
        substitution.set(paramType.name, argType);
      }
      return;
    }
    if (paramType.tag === "array" && argType.tag === "array") {
      this.unify(paramType.elementType, argType.elementType, substitution);
    }
    if (paramType.tag === "nullable" && argType.tag === "nullable") {
      this.unify(paramType.innerType, argType.innerType, substitution);
    }
    if (paramType.tag === "result" && argType.tag === "result") {
      this.unify(paramType.okType, argType.okType, substitution);
      this.unify(paramType.errType, argType.errType, substitution);
    }
    if (paramType.tag === "tuple" && argType.tag === "tuple") {
      for (
        let i = 0;
        i < paramType.elements.length && i < argType.elements.length;
        i++
      ) {
        this.unify(paramType.elements[i], argType.elements[i], substitution);
      }
    }
    if (paramType.tag === "map" && argType.tag === "map") {
      this.unify(paramType.keyType, argType.keyType, substitution);
      this.unify(paramType.valueType, argType.valueType, substitution);
    }
    if (paramType.tag === "function" && argType.tag === "function") {
      this.unify(paramType.returnType, argType.returnType, substitution);
      for (
        let i = 0;
        i < paramType.params.length && i < argType.params.length;
        i++
      ) {
        this.unify(paramType.params[i], argType.params[i], substitution);
      }
    }
    if (paramType.tag === "union" && argType.tag === "union") {
      for (
        let i = 0;
        i < paramType.types.length && i < argType.types.length;
        i++
      ) {
        this.unify(paramType.types[i], argType.types[i], substitution);
      }
    }
  }

  private applySubstitution(
    type: NkType,
    substitution: Map<string, NkType>,
  ): NkType {
    if (type.tag === "typevar") {
      return substitution.get(type.name) ?? NK_ANY;
    }
    if (type.tag === "array") {
      return {
        tag: "array",
        elementType: this.applySubstitution(type.elementType, substitution),
      };
    }
    if (type.tag === "nullable") {
      return {
        tag: "nullable",
        innerType: this.applySubstitution(type.innerType, substitution),
      };
    }
    if (type.tag === "result") {
      return {
        tag: "result",
        okType: this.applySubstitution(type.okType, substitution),
        errType: this.applySubstitution(type.errType, substitution),
      };
    }
    if (type.tag === "tuple") {
      return {
        tag: "tuple",
        elements: type.elements.map((e) =>
          this.applySubstitution(e, substitution),
        ),
      };
    }
    if (type.tag === "union") {
      return {
        tag: "union",
        types: type.types.map((t) => this.applySubstitution(t, substitution)),
      };
    }
    return type;
  }
}

function isNumeric(t: NkType): boolean {
  return t.tag === "int" || t.tag === "float";
}

/** Simple edit distance for "did you mean?" suggestions. */
function editDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () =>
    Array(lb + 1).fill(0),
  );
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[la][lb];
}

/** Find the closest match within edit distance 3. */
function findClosest(name: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 4; // threshold
  for (const c of candidates) {
    if (c === name) continue;
    const d = editDistance(name.toLowerCase(), c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/** Generate a helpful hint for type mismatch errors. */
function typeMismatchHint(
  expected: NkType,
  actual: NkType,
): string | undefined {
  // int vs float
  if (expected.tag === "int" && actual.tag === "float") {
    return "Implicit float-to-int conversion is not allowed; use an explicit cast";
  }
  // string vs number
  if (
    expected.tag === "string" &&
    (actual.tag === "int" || actual.tag === "float")
  ) {
    return 'Use string interpolation: "${value}" to convert numbers to strings';
  }
  if (
    (expected.tag === "int" || expected.tag === "float") &&
    actual.tag === "string"
  ) {
    return "Strings cannot be implicitly converted to numbers";
  }
  // nullable vs non-nullable
  if (expected.tag !== "nullable" && actual.tag === "nullable") {
    return `Use a null check before assigning a nullable value to '${typeToString(expected)}'`;
  }
  // bool vs other
  if (expected.tag === "bool" && actual.tag !== "bool") {
    return "Use a comparison operator (==, !=, <, >) to produce a bool value";
  }
  return undefined;
}
