import {
  Program,
  Statement,
  Expression,
  BlockStatement,
  MatchArm,
  Parameter,
} from "../parser/ast.js";
import {
  NK_RUNTIME,
  NK_HTTP_RUNTIME,
  NK_JSON_RUNTIME,
  NK_RANGE_RUNTIME,
  NK_FS_RUNTIME,
  NK_STREAM_RUNTIME,
  NK_ASSERT_RUNTIME,
  NK_UNWRAP_RUNTIME,
} from "./js-runtime.js";
import { SourceMapGenerator } from "./source-map.js";

export class CodeGenerator {
  private output: string[] = [];
  private indent = 0;
  private usesResult = false;
  private usesHttp = false;
  private usesJson = false;
  private usesRange = false;
  private usesFs = false;
  private usesStream = false;
  private usesAssert = false;
  private usesResultUnwrap = false;
  private asyncFunctions = new Set<string>();
  private projectMode = false;
  private trackSourceMap = false;
  private sourceMapGen: SourceMapGenerator = new SourceMapGenerator();

  generate(program: Program, options?: { projectMode?: boolean }): string {
    this.projectMode = options?.projectMode ?? false;

    // First pass: detect features used
    this.detectFeatures(program);

    // Emit runtime preamble
    const preamble: string[] = [];
    if (this.usesResult) preamble.push(NK_RUNTIME);
    if (this.usesHttp) preamble.push(NK_HTTP_RUNTIME);
    if (this.usesJson) preamble.push(NK_JSON_RUNTIME);
    if (this.usesRange) preamble.push(NK_RANGE_RUNTIME);
    if (this.usesFs) preamble.push(NK_FS_RUNTIME);
    if (this.usesStream) preamble.push(NK_STREAM_RUNTIME);
    if (this.usesAssert) preamble.push(NK_ASSERT_RUNTIME);
    if (this.usesResultUnwrap) preamble.push(NK_UNWRAP_RUNTIME);

    // Second pass: generate code
    for (const stmt of program.body) {
      this.emitStatement(stmt);
    }

    const code = this.output.join("\n");
    if (preamble.length > 0) {
      return preamble.join("\n\n") + "\n\n" + code;
    }
    return code;
  }

  generateWithMap(
    program: Program,
    source: string,
    sourceFile: string,
  ): { code: string; sourceMap: string } {
    // Reset state
    this.output = [];
    this.indent = 0;
    this.usesResult = false;
    this.usesHttp = false;
    this.usesJson = false;
    this.usesRange = false;
    this.usesFs = false;
    this.usesStream = false;
    this.usesAssert = false;
    this.usesResultUnwrap = false;
    this.asyncFunctions = new Set<string>();
    this.sourceMapGen = new SourceMapGenerator();
    this._pendingMappings = [];
    this.trackSourceMap = true;

    // First pass: detect features used
    this.detectFeatures(program);

    // Emit runtime preamble
    const preamble: string[] = [];
    if (this.usesResult) preamble.push(NK_RUNTIME);
    if (this.usesHttp) preamble.push(NK_HTTP_RUNTIME);
    if (this.usesJson) preamble.push(NK_JSON_RUNTIME);
    if (this.usesRange) preamble.push(NK_RANGE_RUNTIME);
    if (this.usesFs) preamble.push(NK_FS_RUNTIME);
    if (this.usesStream) preamble.push(NK_STREAM_RUNTIME);
    if (this.usesAssert) preamble.push(NK_ASSERT_RUNTIME);
    if (this.usesResultUnwrap) preamble.push(NK_UNWRAP_RUNTIME);

    // Account for preamble lines in the output offset
    let preambleLineCount = 0;
    if (preamble.length > 0) {
      const preambleText = preamble.join("\n\n") + "\n\n";
      preambleLineCount = preambleText.split("\n").length - 1;
    }

    // Second pass: generate code
    for (const stmt of program.body) {
      this.emitStatement(stmt);
    }

    // Adjust all mappings to account for preamble lines
    if (preambleLineCount > 0) {
      const adjusted = new SourceMapGenerator();
      // Re-add all mappings from the current generator with adjusted line numbers.
      // We do this by generating with preamble offset applied via a wrapper.
      // Instead, we track preamble offset directly during emission.
      // Since we cannot access private mappings, we use a simpler approach:
      // rebuild with the offset baked in via a secondary generator field.
      // For now the mappings recorded during emitStatement already store
      // this.output.length which does NOT include preamble. We correct below.
      this.sourceMapGen = this.buildOffsetSourceMap(preambleLineCount);
    }

    const code = this.output.join("\n");
    const fullCode =
      preamble.length > 0 ? preamble.join("\n\n") + "\n\n" + code : code;

    const jsFile = sourceFile.replace(/\.nk$/, ".js");
    const mapFile = sourceFile.replace(/\.nk$/, ".js.map");
    const sourceMapJson = JSON.stringify(
      this.sourceMapGen.toJSON(jsFile, [sourceFile], [source]),
    );

    this.trackSourceMap = false;

    return {
      code: fullCode + `\n//# sourceMappingURL=${mapFile}`,
      sourceMap: sourceMapJson,
    };
  }

  private buildOffsetSourceMap(lineOffset: number): SourceMapGenerator {
    const adjusted = new SourceMapGenerator();
    for (const m of this._pendingMappings) {
      adjusted.addMapping({
        ...m,
        generatedLine: m.generatedLine + lineOffset,
      });
    }
    return adjusted;
  }

  private _pendingMappings: Array<{
    generatedLine: number;
    generatedColumn: number;
    sourceLine: number;
    sourceColumn: number;
    sourceIndex: number;
  }> = [];

  private detectFeatures(program: Program): void {
    const source = JSON.stringify(program);
    if (
      source.includes('"OkExpr"') ||
      source.includes('"ErrExpr"') ||
      source.includes('"MatchExpr"') ||
      source.includes('"MatchStatement"')
    ) {
      this.usesResult = true;
    }
    if (source.includes('"http"')) {
      this.usesHttp = true;
    }
    if (source.includes('"json"')) {
      this.usesJson = true;
    }
    if (source.includes('"fs"')) {
      this.usesFs = true;
    }
    if (source.includes('"stream"')) {
      this.usesStream = true;
    }
    if (source.includes('"RangeExpr"')) {
      this.usesRange = true;
    }
    if (source.includes('"assert"')) {
      this.usesAssert = true;
    }
    if (source.includes('"ResultUnwrapExpr"')) {
      this.usesResultUnwrap = true;
      this.usesResult = true;
    }
    // Detect async: functions calling http.get/post etc.
    this.detectAsync(program);
  }

  private detectAsync(program: Program): void {
    // Seed: known async stdlib calls
    const asyncCallees = new Set(["http", "fs"]);

    // Fixed-point: find functions that call async things
    let changed = true;
    while (changed) {
      changed = false;
      for (const stmt of program.body) {
        if (stmt.kind === "FunctionDeclaration") {
          if (!this.asyncFunctions.has(stmt.name)) {
            if (this.bodyCallsAsync(stmt.body, asyncCallees)) {
              this.asyncFunctions.add(stmt.name);
              asyncCallees.add(stmt.name);
              changed = true;
            }
          }
        }
      }
    }
  }

  private bodyCallsAsync(
    block: BlockStatement,
    asyncCallees: Set<string>,
  ): boolean {
    for (const stmt of block.body) {
      if (this.stmtCallsAsync(stmt, asyncCallees)) return true;
    }
    return false;
  }

  private stmtCallsAsync(stmt: Statement, asyncCallees: Set<string>): boolean {
    switch (stmt.kind) {
      case "ExpressionStatement":
        return this.exprCallsAsync(stmt.expression, asyncCallees);
      case "VariableDeclaration":
        return this.exprCallsAsync(stmt.initializer, asyncCallees);
      case "DestructureDeclaration":
        return this.exprCallsAsync(stmt.initializer, asyncCallees);
      case "ReturnStatement":
        return stmt.value
          ? this.exprCallsAsync(stmt.value, asyncCallees)
          : false;
      case "IfStatement":
        return (
          this.exprCallsAsync(stmt.condition, asyncCallees) ||
          this.bodyCallsAsync(stmt.consequent, asyncCallees) ||
          (stmt.alternate
            ? this.stmtCallsAsync(stmt.alternate, asyncCallees)
            : false)
        );
      case "WhileStatement":
        return this.bodyCallsAsync(stmt.body, asyncCallees);
      case "ForStatement":
        return this.bodyCallsAsync(stmt.body, asyncCallees);
      case "ForInStatement":
        return this.bodyCallsAsync(stmt.body, asyncCallees);
      case "BlockStatement":
        return this.bodyCallsAsync(stmt, asyncCallees);
      case "TryCatchStatement":
        return (
          this.bodyCallsAsync(stmt.tryBlock, asyncCallees) ||
          this.bodyCallsAsync(stmt.catchBlock, asyncCallees)
        );
      default:
        return false;
    }
  }

  private exprCallsAsync(expr: Expression, asyncCallees: Set<string>): boolean {
    switch (expr.kind) {
      case "CallExpr": {
        // Check callee: direct function call or member call on async module
        if (
          expr.callee.kind === "Identifier" &&
          asyncCallees.has(expr.callee.name)
        )
          return true;
        if (
          expr.callee.kind === "MemberExpr" &&
          expr.callee.object.kind === "Identifier" &&
          asyncCallees.has(expr.callee.object.name)
        )
          return true;
        // Check args too
        return (
          this.exprCallsAsync(expr.callee, asyncCallees) ||
          expr.args.some((a) => this.exprCallsAsync(a, asyncCallees))
        );
      }
      case "BinaryExpr":
        return (
          this.exprCallsAsync(expr.left, asyncCallees) ||
          this.exprCallsAsync(expr.right, asyncCallees)
        );
      case "UnaryExpr":
        return this.exprCallsAsync(expr.operand, asyncCallees);
      case "AssignExpr":
        return this.exprCallsAsync(expr.value, asyncCallees);
      case "CompoundAssignExpr":
        return this.exprCallsAsync(expr.value, asyncCallees);
      case "TernaryExpr":
        return (
          this.exprCallsAsync(expr.condition, asyncCallees) ||
          this.exprCallsAsync(expr.consequent, asyncCallees) ||
          this.exprCallsAsync(expr.alternate, asyncCallees)
        );
      case "MemberExpr":
        return this.exprCallsAsync(expr.object, asyncCallees);
      case "IndexExpr":
        return (
          this.exprCallsAsync(expr.object, asyncCallees) ||
          this.exprCallsAsync(expr.index, asyncCallees)
        );
      case "SpreadExpr":
        return this.exprCallsAsync(expr.argument, asyncCallees);
      case "PipeExpr":
        return (
          this.exprCallsAsync(expr.left, asyncCallees) ||
          this.exprCallsAsync(expr.right, asyncCallees)
        );
      case "RangeExpr":
        return (
          this.exprCallsAsync(expr.start, asyncCallees) ||
          this.exprCallsAsync(expr.end, asyncCallees)
        );
      case "TupleLiteral":
        return expr.elements.some((e) => this.exprCallsAsync(e, asyncCallees));
      case "NullCoalesceExpr":
        return (
          this.exprCallsAsync(expr.left, asyncCallees) ||
          this.exprCallsAsync(expr.right, asyncCallees)
        );
      case "ArrayComprehension":
        return (
          this.exprCallsAsync(expr.iterable, asyncCallees) ||
          this.exprCallsAsync(expr.body, asyncCallees) ||
          (expr.condition
            ? this.exprCallsAsync(expr.condition, asyncCallees)
            : false)
        );
      case "TypeGuardExpr":
        return this.exprCallsAsync(expr.expression, asyncCallees);
      case "AwaitExpr":
        return true;
      case "ResultUnwrapExpr":
        return this.exprCallsAsync(expr.expression, asyncCallees);
      default:
        return false;
    }
  }

  private genParams(params: Parameter[]): string {
    return params
      .map((p) =>
        p.defaultValue ? `${p.name} = ${this.genExpr(p.defaultValue)}` : p.name,
      )
      .join(", ");
  }

  private emit(text: string): void {
    this.output.push("  ".repeat(this.indent) + text);
  }

  // --- Statements ---

  private emitStatement(stmt: Statement): void {
    if (this.trackSourceMap && stmt.span) {
      const mapping = {
        generatedLine: this.output.length,
        generatedColumn: 0,
        sourceLine: stmt.span.line - 1,
        sourceColumn: stmt.span.column - 1,
        sourceIndex: 0,
      };
      this.sourceMapGen.addMapping(mapping);
      this._pendingMappings.push(mapping);
    }
    switch (stmt.kind) {
      case "VariableDeclaration": {
        const keyword = stmt.mutable === false ? "const" : "let";
        const exportPrefix =
          this.projectMode && this.indent === 0 ? "export " : "";
        this.emit(
          `${exportPrefix}${keyword} ${stmt.name} = ${this.genExpr(stmt.initializer)};`,
        );
        break;
      }

      case "FunctionDeclaration": {
        const isAsync = this.asyncFunctions.has(stmt.name);
        const asyncPrefix = isAsync ? "async " : "";
        const exportPrefix =
          this.projectMode && this.indent === 0 ? "export " : "";
        const params = this.genParams(stmt.params);
        const hasUnwrap =
          this.usesResultUnwrap &&
          JSON.stringify(stmt.body).includes('"ResultUnwrapExpr"');
        this.emit(
          `${exportPrefix}${asyncPrefix}function ${stmt.name}(${params}) {`,
        );
        this.indent++;
        if (hasUnwrap) {
          this.emit("try {");
          this.indent++;
          this.emitBlock(stmt.body);
          this.indent--;
          this.emit("} catch (__e) {");
          this.indent++;
          this.emit("if (__e instanceof __NkResultError) return __e.result;");
          this.emit("throw __e;");
          this.indent--;
          this.emit("}");
        } else {
          this.emitBlock(stmt.body);
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "ReturnStatement":
        if (stmt.value) {
          this.emit(`return ${this.genExpr(stmt.value)};`);
        } else {
          this.emit("return;");
        }
        break;

      case "IfStatement":
        this.emit(`if (${this.genExpr(stmt.condition)}) {`);
        this.indent++;
        this.emitBlock(stmt.consequent);
        this.indent--;
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") {
            this.emit(`} else ${this.genIfInline(stmt.alternate)}`);
          } else {
            this.emit("} else {");
            this.indent++;
            this.emitBlock(stmt.alternate);
            this.indent--;
            this.emit("}");
          }
        } else {
          this.emit("}");
        }
        break;

      case "WhileStatement":
        this.emit(`while (${this.genExpr(stmt.condition)}) {`);
        this.indent++;
        this.emitBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;

      case "ForStatement": {
        const init = stmt.init
          ? stmt.init.kind === "VariableDeclaration"
            ? `let ${stmt.init.name} = ${this.genExpr(stmt.init.initializer)}`
            : this.genExpr(stmt.init.expression)
          : "";
        const cond = stmt.condition ? this.genExpr(stmt.condition) : "";
        const update = stmt.update ? this.genExpr(stmt.update) : "";
        this.emit(`for (${init}; ${cond}; ${update}) {`);
        this.indent++;
        this.emitBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;
      }

      case "ForInStatement":
        this.emit(
          `for (const ${stmt.variable} of ${this.genExpr(stmt.iterable)}) {`,
        );
        this.indent++;
        this.emitBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;

      case "BlockStatement":
        this.emit("{");
        this.indent++;
        this.emitBlock(stmt);
        this.indent--;
        this.emit("}");
        break;

      case "ExpressionStatement":
        this.emit(`${this.genExpr(stmt.expression)};`);
        break;

      case "StructDeclaration": {
        const fieldNames = stmt.fields.map((f) => f.name);
        const structExportPrefix =
          this.projectMode && this.indent === 0 ? "export " : "";
        this.emit(`${structExportPrefix}class ${stmt.name} {`);
        this.indent++;
        this.emit(`constructor(${fieldNames.join(", ")}) {`);
        this.indent++;
        for (const f of fieldNames) {
          this.emit(`this.${f} = ${f};`);
        }
        this.indent--;
        this.emit("}");
        for (const method of stmt.methods) {
          const params = this.genParams(method.params);
          this.emit(`${method.name}(${params}) {`);
          this.indent++;
          this.emitBlock(method.body);
          this.indent--;
          this.emit("}");
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "ClassDeclaration": {
        const ext = stmt.superClass ? ` extends ${stmt.superClass}` : "";
        const classExportPrefix =
          this.projectMode && this.indent === 0 ? "export " : "";
        this.emit(`${classExportPrefix}class ${stmt.name}${ext} {`);
        this.indent++;
        // Constructor from fields
        if (stmt.fields.length > 0) {
          const fieldNames = stmt.fields.map((f) => f.name);
          this.emit(`constructor(${fieldNames.join(", ")}) {`);
          this.indent++;
          if (stmt.superClass) this.emit("super();");
          for (const f of fieldNames) {
            this.emit(`this.${f} = ${f};`);
          }
          this.indent--;
          this.emit("}");
        }
        for (const method of stmt.methods) {
          const params = this.genParams(method.params);
          this.emit(`${method.name}(${params}) {`);
          this.indent++;
          this.emitBlock(method.body);
          this.indent--;
          this.emit("}");
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "InterfaceDeclaration":
      case "TypeAlias":
      case "DeclareModuleStatement":
        // Type-only declarations are erased in JS output
        break;

      case "EnumDeclaration": {
        const enumExportPrefix =
          this.projectMode && this.indent === 0 ? "export " : "";
        const hasADT = stmt.variants.some(
          (v) => v.fields && v.fields.length > 0,
        );
        if (hasADT) {
          // ADT-style enum with __tag dispatch
          const entries = stmt.variants.map((v) => {
            if (v.fields && v.fields.length > 0) {
              const params = v.fields.map((f) => f.name).join(", ");
              const obj = v.fields
                .map((f) => f.name)
                .concat([`__tag: "${v.name}"`])
                .join(", ");
              return `${v.name}: (${params}) => ({ ${obj} })`;
            }
            return `${v.name}: Object.freeze({ __tag: "${v.name}" })`;
          });
          this.emit(
            `${enumExportPrefix}const ${stmt.name} = Object.freeze({ ${entries.join(", ")} });`,
          );
        } else {
          // Simple enum with numeric values
          const entries = stmt.variants.map((v, i) => {
            const val = v.value ? this.genExpr(v.value) : String(i);
            return `${v.name}: ${val}`;
          });
          this.emit(
            `${enumExportPrefix}const ${stmt.name} = Object.freeze({ ${entries.join(", ")} });`,
          );
        }
        break;
      }

      case "TakeStatement": {
        const names = stmt.names.join(", ");
        let path = stmt.path;
        if (path.startsWith("./") || path.startsWith("../")) {
          path = path.endsWith(".js") ? path : path + ".js";
        }
        this.emit(`import { ${names} } from "${path}";`);
        break;
      }

      case "LoadStatement":
        this.emit(`import ${stmt.name} from "${stmt.path}";`);
        break;

      case "TryCatchStatement":
        this.emit("try {");
        this.indent++;
        this.emitBlock(stmt.tryBlock);
        this.indent--;
        if (stmt.catchBinding) {
          this.emit(`} catch (${stmt.catchBinding}) {`);
        } else {
          this.emit("} catch {");
        }
        this.indent++;
        this.emitBlock(stmt.catchBlock);
        this.indent--;
        this.emit("}");
        break;

      case "MatchStatement":
        this.emitMatch(stmt.subject, stmt.arms);
        break;

      case "DestructureDeclaration": {
        const names = stmt.names.join(", ");
        const init = this.genExpr(stmt.initializer);
        if (stmt.pattern === "object") {
          this.emit(`const { ${names} } = ${init};`);
        } else {
          // Both "array" and "tuple" destructure to JS array destructuring
          this.emit(`const [${names}] = ${init};`);
        }
        break;
      }

      case "BreakStatement":
        this.emit("break;");
        break;

      case "ContinueStatement":
        this.emit("continue;");
        break;
    }
  }

  private emitBlock(block: BlockStatement): void {
    for (const stmt of block.body) {
      this.emitStatement(stmt);
    }
  }

  private genIfInline(stmt: Statement): string {
    if (stmt.kind !== "IfStatement") return "";
    let code = `if (${this.genExpr(stmt.condition)}) {\n`;
    this.indent++;
    const saved = this.output.length;
    this.emitBlock(stmt.consequent);
    const inner = this.output.splice(saved).join("\n");
    this.indent--;
    code += inner + "\n" + "  ".repeat(this.indent);
    if (stmt.alternate) {
      if (stmt.alternate.kind === "IfStatement") {
        code += `} else ${this.genIfInline(stmt.alternate)}`;
      } else {
        code += "} else {\n";
        this.indent++;
        const saved2 = this.output.length;
        this.emitBlock(stmt.alternate);
        const inner2 = this.output.splice(saved2).join("\n");
        this.indent--;
        code += inner2 + "\n" + "  ".repeat(this.indent) + "}";
      }
    } else {
      code += "}";
    }
    return code;
  }

  private emitMatch(subject: Expression, arms: MatchArm[]): void {
    const subjectCode = this.genExpr(subject);
    const tempVar = `__match_${subject.span.offset}`;
    this.emit(`const ${tempVar} = ${subjectCode};`);
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i];
      const prefix = i === 0 ? "if" : "} else if";
      const { condition, binding } = this.genMatchCondition(
        tempVar,
        arm.pattern,
      );

      if (arm.pattern.kind === "WildcardPattern") {
        if (i === 0) {
          this.emit("{");
        } else {
          this.emit("} else {");
        }
      } else {
        this.emit(`${prefix} (${condition}) {`);
      }

      this.indent++;
      if (binding) {
        this.emit(`const ${binding.name} = ${binding.value};`);
      }
      // Emit enum variant bindings
      if (
        arm.pattern.kind === "EnumVariantPattern" &&
        arm.pattern.bindings.length > 0
      ) {
        for (const b of arm.pattern.bindings) {
          this.emit(`const ${b} = ${tempVar}.${b};`);
        }
      }
      if (arm.body.kind === "BlockStatement") {
        this.emitBlock(arm.body);
      } else {
        this.emit(`${this.genExpr(arm.body)};`);
      }
      this.indent--;
    }
    if (arms.length > 0) {
      this.emit("}");
    }
  }

  private genMatchCondition(
    tempVar: string,
    pattern: MatchArm["pattern"],
  ): {
    condition: string;
    binding?: { name: string; value: string };
  } {
    switch (pattern.kind) {
      case "OkPattern":
        return {
          condition: `${tempVar}.__tag === "Ok"`,
          binding: { name: pattern.binding, value: `${tempVar}.value` },
        };
      case "ErrPattern":
        return {
          condition: `${tempVar}.__tag === "Err"`,
          binding: { name: pattern.binding, value: `${tempVar}.value` },
        };
      case "LiteralPattern":
        return { condition: `${tempVar} === ${this.genExpr(pattern.value)}` };
      case "IdentifierPattern":
        return {
          condition: `true`,
          binding: { name: pattern.name, value: tempVar },
        };
      case "EnumVariantPattern":
        return {
          condition: `${tempVar}.__tag === "${pattern.variant}"`,
        };
      case "WildcardPattern":
        return { condition: "true" };
    }
  }

  // --- Expressions ---

  private genExpr(expr: Expression): string {
    switch (expr.kind) {
      case "IntLiteral":
      case "FloatLiteral":
        return String(expr.value);

      case "StringLiteral":
        return JSON.stringify(expr.value);

      case "BoolLiteral":
        return String(expr.value);

      case "NullLiteral":
        return "null";

      case "Identifier":
        return this.mapIdentifier(expr.name);

      case "BinaryExpr":
        return `(${this.genExpr(expr.left)} ${expr.operator} ${this.genExpr(expr.right)})`;

      case "UnaryExpr":
        return `${expr.operator}${this.genExpr(expr.operand)}`;

      case "CallExpr": {
        const callee = this.genExpr(expr.callee);
        const args = expr.args.map((a) => this.genExpr(a)).join(", ");
        const needsAwait = this.isAsyncCall(expr.callee);
        const prefix = needsAwait ? "await " : "";
        return `${prefix}${callee}(${args})`;
      }

      case "MemberExpr": {
        const obj = this.genExpr(expr.object);
        const op = expr.optional ? "?." : ".";
        return `${obj}${op}${expr.property}`;
      }

      case "IndexExpr":
        return `${this.genExpr(expr.object)}[${this.genExpr(expr.index)}]`;

      case "AssignExpr":
        return `${this.genExpr(expr.target)} = ${this.genExpr(expr.value)}`;

      case "ArrowFunction": {
        const params = this.genParams(expr.params);
        if (expr.body.kind === "BlockStatement") {
          const saved = this.output.length;
          this.indent++;
          this.emitBlock(expr.body);
          const inner = this.output.splice(saved).join("\n");
          this.indent--;
          return `(${params}) => {\n${inner}\n${"  ".repeat(this.indent)}}`;
        }
        return `(${params}) => ${this.genExpr(expr.body)}`;
      }

      case "NewExpr": {
        const callee = this.genExpr(expr.callee);
        const args = expr.args.map((a) => this.genExpr(a)).join(", ");
        return `new ${callee}(${args})`;
      }

      case "ThisExpr":
        return "this";

      case "ArrayLiteral": {
        const elements = expr.elements.map((e) => this.genExpr(e)).join(", ");
        return `[${elements}]`;
      }

      case "MapLiteral": {
        if (expr.entries.length === 0) return "new Map()";
        const pairs = expr.entries
          .map((e) => `[${this.genExpr(e.key)}, ${this.genExpr(e.value)}]`)
          .join(", ");
        return `new Map([${pairs}])`;
      }

      case "OkExpr":
        return `__nk_Ok(${this.genExpr(expr.value)})`;

      case "ErrExpr":
        return `__nk_Err(${this.genExpr(expr.value)})`;

      case "MatchExpr":
        // Match as expression: use IIFE
        return this.genMatchExpr(expr);

      case "StringInterpolation": {
        // Compile to JS template literal
        let tpl = "`";
        for (const part of expr.parts) {
          if (typeof part === "string") {
            tpl += part
              .replace(/`/g, "\\`")
              .replace(/\\/g, "\\\\")
              .replace(/\n/g, "\\n")
              .replace(/\r/g, "\\r")
              .replace(/\t/g, "\\t");
          } else {
            tpl += `\${${this.genExpr(part)}}`;
          }
        }
        tpl += "`";
        return tpl;
      }

      case "CompoundAssignExpr":
        return `${this.genExpr(expr.target)} ${expr.operator} ${this.genExpr(expr.value)}`;

      case "UpdateExpr":
        return expr.prefix
          ? `${expr.operator}${this.genExpr(expr.argument)}`
          : `${this.genExpr(expr.argument)}${expr.operator}`;

      case "TernaryExpr":
        return `(${this.genExpr(expr.condition)} ? ${this.genExpr(expr.consequent)} : ${this.genExpr(expr.alternate)})`;

      case "SpreadExpr":
        return `...${this.genExpr(expr.argument)}`;

      case "PipeExpr":
        return `${this.genExpr(expr.right)}(${this.genExpr(expr.left)})`;

      case "RangeExpr":
        return `__nk_range(${this.genExpr(expr.start)}, ${this.genExpr(expr.end)}, ${expr.inclusive})`;

      case "TupleLiteral": {
        const elements = expr.elements.map((e) => this.genExpr(e)).join(", ");
        return `[${elements}]`;
      }

      case "NullCoalesceExpr":
        return `(${this.genExpr(expr.left)} ?? ${this.genExpr(expr.right)})`;

      case "ArrayComprehension": {
        const iter = this.genExpr(expr.iterable);
        const body = this.genExpr(expr.body);
        const v = expr.variable;
        if (expr.condition) {
          const cond = this.genExpr(expr.condition);
          return `${iter}.filter((${v}) => ${cond}).map((${v}) => ${body})`;
        }
        return `${iter}.map((${v}) => ${body})`;
      }

      case "TypeGuardExpr":
        return this.genTypeGuardCheck(
          this.genExpr(expr.expression),
          expr.guardType,
        );

      case "AwaitExpr":
        return `await ${this.genExpr(expr.argument)}`;

      case "ResultUnwrapExpr":
        return `__nk_unwrap(${this.genExpr(expr.expression)})`;
    }
  }

  private genTypeGuardCheck(
    exprCode: string,
    guardType: import("../parser/ast.js").TypeAnnotation,
  ): string {
    if (guardType.kind === "NamedType") {
      switch (guardType.name) {
        case "string":
          return `typeof ${exprCode} === "string"`;
        case "int":
        case "float":
          return `typeof ${exprCode} === "number"`;
        case "bool":
          return `typeof ${exprCode} === "boolean"`;
        default:
          return `${exprCode} instanceof ${guardType.name}`;
      }
    }
    return `true`;
  }

  private genMatchExpr(expr: Expression & { kind: "MatchExpr" }): string {
    const subject = this.genExpr(expr.subject);
    let code = `(() => { const __m = ${subject}; `;
    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i];
      const { condition, binding } = this.genMatchCondition("__m", arm.pattern);

      if (arm.pattern.kind === "WildcardPattern") {
        if (i > 0) code += " else { ";
        else code += "{ ";
      } else {
        code += i === 0 ? `if (${condition}) { ` : ` else if (${condition}) { `;
      }

      if (binding) {
        code += `const ${binding.name} = ${binding.value}; `;
      }
      if (
        arm.pattern.kind === "EnumVariantPattern" &&
        arm.pattern.bindings.length > 0
      ) {
        for (const b of arm.pattern.bindings) {
          code += `const ${b} = __m.${b}; `;
        }
      }
      if (arm.body.kind === "BlockStatement") {
        // For block bodies in match expressions, wrap as needed
        const saved = this.output.length;
        this.emitBlock(arm.body);
        const inner = this.output.splice(saved).join("; ");
        code += inner;
      } else {
        code += `return ${this.genExpr(arm.body)};`;
      }
      code += " }";
    }
    code += " })()";
    return code;
  }

  private mapIdentifier(name: string): string {
    switch (name) {
      case "print":
        return "console.log";
      case "http":
        return "__nk_http";
      case "json":
        return "__nk_json";
      case "fs":
        return "__nk_fs";
      case "stream":
        return "__nk_stream";
      case "math":
        return "Math";
      case "assert":
        return "__nk_assert";
      default:
        return name;
    }
  }

  private isAsyncCall(callee: Expression): boolean {
    if (callee.kind === "Identifier") {
      return this.asyncFunctions.has(callee.name);
    }
    if (callee.kind === "MemberExpr") {
      if (callee.object.kind === "Identifier") {
        const objName = callee.object.name;
        // http.*/fs.* are async
        if (objName === "http") return true;
        if (objName === "fs") return true;
        // Calls on known async functions
        return this.asyncFunctions.has(objName);
      }
    }
    return false;
  }
}
