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
} from "./types.js";

export class TypeChecker {
  readonly diagnostics: Diagnostic[] = [];
  readonly typeMap: Map<number, NkType> = new Map();
  readonly symbolMap: Map<string, { type: NkType; offset: number }[]> =
    new Map();
  private env = new TypeEnvironment();
  private file: string;
  private currentReturnType: NkType | undefined;

  constructor(file = "<stdin>") {
    this.file = file;
    this.registerStdlib();
  }

  check(program: Program): void {
    for (const stmt of program.body) {
      this.checkStatement(stmt);
    }
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
          this.env.define(stmt.name, declaredType);
          this.recordSymbol(stmt.name, declaredType, stmt.span.offset);
        } else {
          // var inference
          this.env.define(stmt.name, initType);
          this.recordSymbol(stmt.name, initType, stmt.span.offset);
        }
        break;
      }

      case "FunctionDeclaration": {
        // Register generic type params as NK_ANY in scope
        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp, NK_ANY);
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
        };
        this.env.exitScope();
        this.env.define(stmt.name, fnType);
        this.recordSymbol(stmt.name, fnType, stmt.span.offset);

        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp, NK_ANY);
        }
        for (let i = 0; i < stmt.params.length; i++) {
          this.env.define(stmt.params[i].name, paramTypes[i]);
        }
        const prevReturn = this.currentReturnType;
        this.currentReturnType = returnType;
        this.checkStatement(stmt.body);
        this.currentReturnType = prevReturn;
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

      case "IfStatement":
        this.checkExpression(stmt.condition);
        this.checkStatement(stmt.consequent);
        if (stmt.alternate) this.checkStatement(stmt.alternate);
        break;

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
        for (const s of stmt.body) this.checkStatement(s);
        this.env.exitScope();
        break;

      case "ExpressionStatement":
        this.checkExpression(stmt.expression);
        break;

      case "StructDeclaration": {
        this.env.enterScope();
        for (const tp of stmt.typeParams) {
          this.env.registerType(tp, NK_ANY);
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
            this.env.registerType(tp, NK_ANY);
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
          this.env.registerType(tp, NK_ANY);
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

        for (const m of stmt.methods) {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp, NK_ANY);
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

      case "TakeStatement":
        // Imported names get any type (external modules)
        for (const name of stmt.names) {
          this.env.define(name, NK_ANY);
        }
        break;

      case "LoadStatement":
        this.env.define(stmt.name, NK_ANY);
        break;

      case "TryCatchStatement":
        this.checkStatement(stmt.tryBlock);
        this.env.enterScope();
        if (stmt.catchBinding) {
          this.env.define(stmt.catchBinding, NK_ANY);
        }
        this.checkStatement(stmt.catchBlock);
        this.env.exitScope();
        break;

      case "MatchStatement":
        this.checkExpression(stmt.subject);
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
        break;

      case "DestructureDeclaration": {
        const initType = this.checkExpression(stmt.initializer);
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
        for (const arg of expr.args) {
          this.checkExpression(arg);
        }

        if (calleeType.tag === "function") {
          if (expr.args.length !== calleeType.params.length) {
            // print is variadic
            if (
              !(
                expr.callee.kind === "Identifier" &&
                expr.callee.name === "print"
              )
            ) {
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
              return {
                tag: "function",
                params: [NK_ANY],
                returnType: { tag: "array", elementType: NK_ANY },
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
        this.checkExpression(expr.subject);
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
        const targetType = this.checkExpression(expr.target);
        this.checkExpression(expr.value);
        return targetType;
      }

      case "UpdateExpr":
        return this.checkExpression(expr.argument);

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
    }
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
