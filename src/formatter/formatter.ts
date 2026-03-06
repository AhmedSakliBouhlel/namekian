import {
  Program,
  Statement,
  Expression,
  BlockStatement,
  Parameter,
  TypeAnnotation,
  MatchArm,
} from "../parser/ast.js";

export class Formatter {
  private output: string[] = [];
  private indent = 0;

  format(program: Program): string {
    for (let i = 0; i < program.body.length; i++) {
      this.formatStatement(program.body[i]);
      // Blank line between top-level declarations
      if (
        i < program.body.length - 1 &&
        isDeclaration(program.body[i]) &&
        isDeclaration(program.body[i + 1])
      ) {
        this.output.push("");
      }
    }
    // Ensure trailing newline
    const result = this.output.join("\n");
    return result.endsWith("\n") ? result : result + "\n";
  }

  private emit(text: string): void {
    this.output.push("  ".repeat(this.indent) + text);
  }

  private emitRaw(text: string): void {
    this.output.push(text);
  }

  // --- Type Annotations ---

  private fmtType(ann: TypeAnnotation): string {
    switch (ann.kind) {
      case "NamedType":
        return ann.name;
      case "ArrayType":
        return `${this.fmtType(ann.elementType)}[]`;
      case "NullableType":
        return `${this.fmtType(ann.innerType)}?`;
      case "GenericType": {
        const args = ann.typeArgs.map((a) => this.fmtType(a)).join(", ");
        return `${ann.name}<${args}>`;
      }
      case "FunctionType": {
        const params = ann.params.map((p) => this.fmtType(p)).join(", ");
        return `(${params}) => ${this.fmtType(ann.returnType)}`;
      }
      case "TupleType": {
        const elems = ann.elements.map((e) => this.fmtType(e)).join(", ");
        return `(${elems})`;
      }
    }
  }

  private fmtParams(params: Parameter[]): string {
    return params
      .map((p) => {
        let s = "";
        if (p.type) s += this.fmtType(p.type) + " ";
        s += p.name;
        if (p.defaultValue) s += " = " + this.fmtExpr(p.defaultValue);
        return s;
      })
      .join(", ");
  }

  // --- Statements ---

  private formatStatement(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        if (stmt.type) {
          this.emit(
            `${this.fmtType(stmt.type)} ${stmt.name} = ${this.fmtExpr(stmt.initializer)};`,
          );
        } else if (stmt.mutable === false) {
          this.emit(`const ${stmt.name} = ${this.fmtExpr(stmt.initializer)};`);
        } else {
          this.emit(`var ${stmt.name} = ${this.fmtExpr(stmt.initializer)};`);
        }
        break;

      case "FunctionDeclaration": {
        const ret = stmt.returnType ? this.fmtType(stmt.returnType) : "void";
        const typeParams =
          stmt.typeParams.length > 0 ? `<${stmt.typeParams.join(", ")}>` : "";
        const params = this.fmtParams(stmt.params);
        this.emit(`${ret} ${stmt.name}${typeParams}(${params}) {`);
        this.indent++;
        this.formatBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;
      }

      case "ReturnStatement":
        if (stmt.value) {
          this.emit(`return ${this.fmtExpr(stmt.value)};`);
        } else {
          this.emit("return;");
        }
        break;

      case "IfStatement":
        this.emit(`if (${this.fmtExpr(stmt.condition)}) {`);
        this.indent++;
        this.formatBlock(stmt.consequent);
        this.indent--;
        if (stmt.alternate) {
          if (stmt.alternate.kind === "IfStatement") {
            this.emit("} else " + this.fmtIfInline(stmt.alternate));
          } else {
            this.emit("} else {");
            this.indent++;
            this.formatBlock(stmt.alternate);
            this.indent--;
            this.emit("}");
          }
        } else {
          this.emit("}");
        }
        break;

      case "WhileStatement":
        this.emit(`while (${this.fmtExpr(stmt.condition)}) {`);
        this.indent++;
        this.formatBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;

      case "ForStatement": {
        const init = stmt.init
          ? stmt.init.kind === "VariableDeclaration"
            ? stmt.init.type
              ? `${this.fmtType(stmt.init.type)} ${stmt.init.name} = ${this.fmtExpr(stmt.init.initializer)}`
              : `var ${stmt.init.name} = ${this.fmtExpr(stmt.init.initializer)}`
            : this.fmtExpr(stmt.init.expression)
          : "";
        const cond = stmt.condition ? this.fmtExpr(stmt.condition) : "";
        const update = stmt.update ? this.fmtExpr(stmt.update) : "";
        this.emit(`for (${init}; ${cond}; ${update}) {`);
        this.indent++;
        this.formatBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;
      }

      case "ForInStatement":
        this.emit(`for (${stmt.variable} in ${this.fmtExpr(stmt.iterable)}) {`);
        this.indent++;
        this.formatBlock(stmt.body);
        this.indent--;
        this.emit("}");
        break;

      case "BlockStatement":
        this.emit("{");
        this.indent++;
        this.formatBlock(stmt);
        this.indent--;
        this.emit("}");
        break;

      case "ExpressionStatement":
        this.emit(`${this.fmtExpr(stmt.expression)};`);
        break;

      case "StructDeclaration": {
        const typeParams =
          stmt.typeParams.length > 0 ? `<${stmt.typeParams.join(", ")}>` : "";
        this.emit(`struct ${stmt.name}${typeParams} {`);
        this.indent++;
        for (const f of stmt.fields) {
          this.emit(`${this.fmtType(f.type)} ${f.name};`);
        }
        if (stmt.fields.length > 0 && stmt.methods.length > 0) {
          this.emitRaw("");
        }
        for (const m of stmt.methods) {
          const ret = m.returnType ? this.fmtType(m.returnType) : "void";
          const params = this.fmtParams(m.params);
          this.emit(`${ret} ${m.name}(${params}) {`);
          this.indent++;
          this.formatBlock(m.body);
          this.indent--;
          this.emit("}");
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "ClassDeclaration": {
        const typeParams =
          stmt.typeParams.length > 0 ? `<${stmt.typeParams.join(", ")}>` : "";
        const ext = stmt.superClass ? ` : ${stmt.superClass}` : "";
        const ifaces =
          stmt.interfaces.length > 0
            ? (stmt.superClass ? ", " : " : ") + stmt.interfaces.join(", ")
            : "";
        this.emit(`class ${stmt.name}${typeParams}${ext}${ifaces} {`);
        this.indent++;
        for (const f of stmt.fields) {
          this.emit(`${this.fmtType(f.type)} ${f.name};`);
        }
        if (stmt.fields.length > 0 && stmt.methods.length > 0) {
          this.emitRaw("");
        }
        for (const m of stmt.methods) {
          const ret = m.returnType ? this.fmtType(m.returnType) : "void";
          const params = this.fmtParams(m.params);
          this.emit(`${ret} ${m.name}(${params}) {`);
          this.indent++;
          this.formatBlock(m.body);
          this.indent--;
          this.emit("}");
        }
        this.indent--;
        this.emit("}");
        break;
      }

      case "InterfaceDeclaration":
        this.emit(`interface ${stmt.name} {`);
        this.indent++;
        for (const f of stmt.fields) {
          this.emit(`${this.fmtType(f.type)} ${f.name};`);
        }
        for (const m of stmt.methods) {
          const ret = m.returnType ? this.fmtType(m.returnType) : "void";
          const params = this.fmtParams(m.params);
          this.emit(`${ret} ${m.name}(${params});`);
        }
        this.indent--;
        this.emit("}");
        break;

      case "EnumDeclaration":
        this.emit(`enum ${stmt.name} {`);
        this.indent++;
        for (let i = 0; i < stmt.variants.length; i++) {
          const v = stmt.variants[i];
          const trailing = i < stmt.variants.length - 1 ? "," : "";
          if (v.value) {
            this.emit(`${v.name} = ${this.fmtExpr(v.value)}${trailing}`);
          } else if (v.fields && v.fields.length > 0) {
            const fields = v.fields
              .map((f) => `${this.fmtType(f.type)} ${f.name}`)
              .join(", ");
            this.emit(`${v.name}(${fields})${trailing}`);
          } else {
            this.emit(`${v.name}${trailing}`);
          }
        }
        this.indent--;
        this.emit("}");
        break;

      case "TakeStatement": {
        const names = stmt.names.join(", ");
        this.emit(`take { ${names} } from "${stmt.path}"`);
        break;
      }

      case "LoadStatement":
        this.emit(`load "${stmt.path}"`);
        break;

      case "TryCatchStatement":
        this.emit("try {");
        this.indent++;
        this.formatBlock(stmt.tryBlock);
        this.indent--;
        if (stmt.catchBinding) {
          this.emit(`} catch (${stmt.catchBinding}) {`);
        } else {
          this.emit("} catch {");
        }
        this.indent++;
        this.formatBlock(stmt.catchBlock);
        this.indent--;
        this.emit("}");
        break;

      case "MatchStatement":
        this.emit(`match (${this.fmtExpr(stmt.subject)}) {`);
        this.indent++;
        for (const arm of stmt.arms) {
          this.formatMatchArm(arm);
        }
        this.indent--;
        this.emit("}");
        break;

      case "TypeAlias":
        this.emit(`type ${stmt.name} = ${this.fmtType(stmt.type)};`);
        break;

      case "DestructureDeclaration": {
        const names = stmt.names.join(", ");
        const init = this.fmtExpr(stmt.initializer);
        if (stmt.pattern === "object") {
          this.emit(`var { ${names} } = ${init};`);
        } else if (stmt.pattern === "tuple") {
          this.emit(`var (${names}) = ${init};`);
        } else {
          this.emit(`var [${names}] = ${init};`);
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

  private formatBlock(block: BlockStatement): void {
    for (const stmt of block.body) {
      this.formatStatement(stmt);
    }
  }

  private fmtIfInline(stmt: Statement): string {
    if (stmt.kind !== "IfStatement") return "";
    let code = `if (${this.fmtExpr(stmt.condition)}) {\n`;
    this.indent++;
    const saved = this.output.length;
    this.formatBlock(stmt.consequent);
    const inner = this.output.splice(saved).join("\n");
    this.indent--;
    code += inner + "\n" + "  ".repeat(this.indent);
    if (stmt.alternate) {
      if (stmt.alternate.kind === "IfStatement") {
        code += "} else " + this.fmtIfInline(stmt.alternate);
      } else {
        code += "} else {\n";
        this.indent++;
        const saved2 = this.output.length;
        this.formatBlock(stmt.alternate);
        const inner2 = this.output.splice(saved2).join("\n");
        this.indent--;
        code += inner2 + "\n" + "  ".repeat(this.indent) + "}";
      }
    } else {
      code += "}";
    }
    return code;
  }

  private formatMatchArm(arm: MatchArm): void {
    const pattern = this.fmtMatchPattern(arm.pattern);
    if (arm.body.kind === "BlockStatement") {
      this.emit(`${pattern} => {`);
      this.indent++;
      this.formatBlock(arm.body);
      this.indent--;
      this.emit("}");
    } else {
      this.emit(`${pattern} => ${this.fmtExpr(arm.body)}`);
    }
  }

  private fmtMatchPattern(pattern: MatchArm["pattern"]): string {
    switch (pattern.kind) {
      case "OkPattern":
        return `Ok(${pattern.binding})`;
      case "ErrPattern":
        return `Err(${pattern.binding})`;
      case "LiteralPattern":
        return this.fmtExpr(pattern.value);
      case "WildcardPattern":
        return "_";
      case "IdentifierPattern":
        return pattern.name;
      case "EnumVariantPattern": {
        const bindings =
          pattern.bindings.length > 0 ? `(${pattern.bindings.join(", ")})` : "";
        return `${pattern.enumName}.${pattern.variant}${bindings}`;
      }
    }
  }

  // --- Expressions ---

  private fmtExpr(expr: Expression): string {
    switch (expr.kind) {
      case "IntLiteral":
      case "FloatLiteral":
        return String(expr.value);

      case "StringLiteral":
        return `"${expr.value}"`;

      case "BoolLiteral":
        return String(expr.value);

      case "NullLiteral":
        return "null";

      case "Identifier":
        return expr.name;

      case "BinaryExpr":
        return `${this.fmtExpr(expr.left)} ${expr.operator} ${this.fmtExpr(expr.right)}`;

      case "UnaryExpr":
        return `${expr.operator}${this.fmtExpr(expr.operand)}`;

      case "CallExpr": {
        const callee = this.fmtExpr(expr.callee);
        const args = expr.args.map((a) => this.fmtExpr(a)).join(", ");
        return `${callee}(${args})`;
      }

      case "MemberExpr": {
        const obj = this.fmtExpr(expr.object);
        const op = expr.optional ? "?." : ".";
        return `${obj}${op}${expr.property}`;
      }

      case "IndexExpr":
        return `${this.fmtExpr(expr.object)}[${this.fmtExpr(expr.index)}]`;

      case "AssignExpr":
        return `${this.fmtExpr(expr.target)} = ${this.fmtExpr(expr.value)}`;

      case "ArrowFunction": {
        const params = this.fmtParams(expr.params);
        if (expr.body.kind === "BlockStatement") {
          const saved = this.output.length;
          this.indent++;
          this.formatBlock(expr.body);
          const inner = this.output.splice(saved).join("\n");
          this.indent--;
          return `(${params}) => {\n${inner}\n${"  ".repeat(this.indent)}}`;
        }
        return `(${params}) => ${this.fmtExpr(expr.body)}`;
      }

      case "NewExpr": {
        const callee = this.fmtExpr(expr.callee);
        const args = expr.args.map((a) => this.fmtExpr(a)).join(", ");
        return `new ${callee}(${args})`;
      }

      case "ThisExpr":
        return "this";

      case "ArrayLiteral": {
        const elements = expr.elements.map((e) => this.fmtExpr(e)).join(", ");
        return `[${elements}]`;
      }

      case "OkExpr":
        return `Ok(${this.fmtExpr(expr.value)})`;

      case "ErrExpr":
        return `Err(${this.fmtExpr(expr.value)})`;

      case "MatchExpr": {
        // Inline match expressions keep them compact
        const subject = this.fmtExpr(expr.subject);
        let code = `match (${subject}) {\n`;
        this.indent++;
        for (const arm of expr.arms) {
          const pattern = this.fmtMatchPattern(arm.pattern);
          if (arm.body.kind === "BlockStatement") {
            code += "  ".repeat(this.indent) + `${pattern} => {\n`;
            this.indent++;
            const saved = this.output.length;
            this.formatBlock(arm.body);
            const inner = this.output.splice(saved).join("\n");
            this.indent--;
            code += inner + "\n" + "  ".repeat(this.indent) + "}\n";
          } else {
            code +=
              "  ".repeat(this.indent) +
              `${pattern} => ${this.fmtExpr(arm.body)}\n`;
          }
        }
        this.indent--;
        code += "  ".repeat(this.indent) + "}";
        return code;
      }

      case "StringInterpolation": {
        let s = '"';
        for (const part of expr.parts) {
          if (typeof part === "string") {
            s += part;
          } else {
            s += "${" + this.fmtExpr(part) + "}";
          }
        }
        s += '"';
        return s;
      }

      case "CompoundAssignExpr":
        return `${this.fmtExpr(expr.target)} ${expr.operator} ${this.fmtExpr(expr.value)}`;

      case "UpdateExpr":
        return expr.prefix
          ? `${expr.operator}${this.fmtExpr(expr.argument)}`
          : `${this.fmtExpr(expr.argument)}${expr.operator}`;

      case "TernaryExpr":
        return `${this.fmtExpr(expr.condition)} ? ${this.fmtExpr(expr.consequent)} : ${this.fmtExpr(expr.alternate)}`;

      case "SpreadExpr":
        return `...${this.fmtExpr(expr.argument)}`;

      case "MapLiteral": {
        if (expr.entries.length === 0) return "{}";
        const entries = expr.entries
          .map((e) => `${this.fmtExpr(e.key)}: ${this.fmtExpr(e.value)}`)
          .join(", ");
        return `{ ${entries} }`;
      }

      case "PipeExpr":
        return `${this.fmtExpr(expr.left)} |> ${this.fmtExpr(expr.right)}`;

      case "RangeExpr": {
        const op = expr.inclusive ? "..=" : "..";
        return `${this.fmtExpr(expr.start)}${op}${this.fmtExpr(expr.end)}`;
      }

      case "TupleLiteral": {
        const elems = expr.elements.map((e) => this.fmtExpr(e)).join(", ");
        return `(${elems})`;
      }

      case "NullCoalesceExpr":
        return `${this.fmtExpr(expr.left)} ?? ${this.fmtExpr(expr.right)}`;

      case "ArrayComprehension": {
        const body = this.fmtExpr(expr.body);
        const iter = this.fmtExpr(expr.iterable);
        if (expr.condition) {
          return `[${body} for (${expr.variable} in ${iter}) if (${this.fmtExpr(expr.condition)})]`;
        }
        return `[${body} for (${expr.variable} in ${iter})]`;
      }

      default:
        return "/* unknown */";
    }
  }
}

function isDeclaration(stmt: Statement): boolean {
  return (
    stmt.kind === "FunctionDeclaration" ||
    stmt.kind === "StructDeclaration" ||
    stmt.kind === "ClassDeclaration" ||
    stmt.kind === "InterfaceDeclaration" ||
    stmt.kind === "EnumDeclaration"
  );
}
