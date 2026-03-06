import { Program, Expression, SourceSpan } from "../parser/ast.js";
import { Diagnostic, SourceLocation } from "../errors/diagnostic.js";

function spanToLoc(span: SourceSpan): SourceLocation {
  return { file: "<wasm>", ...span };
}

function wasmError(message: string, span: SourceSpan): Diagnostic {
  return { severity: "error", message, location: spanToLoc(span) };
}

export interface WasmResult {
  success: boolean;
  wat?: string;
  diagnostics: Diagnostic[];
}

/**
 * Proof-of-concept WASM code generator.
 * Only supports numeric functions (int params, int return, arithmetic + return).
 */
export function generateWat(ast: Program): WasmResult {
  const diagnostics: Diagnostic[] = [];
  const funcs: string[] = [];
  const exports: string[] = [];

  for (const stmt of ast.body) {
    if (stmt.kind !== "FunctionDeclaration") {
      diagnostics.push(
        wasmError(
          `WASM target only supports function declarations, got '${stmt.kind}'`,
          stmt.span,
        ),
      );
      continue;
    }

    const fn = stmt;
    const retType = fn.returnType;
    if (
      !retType ||
      retType.kind !== "NamedType" ||
      !["int", "float"].includes(retType.name)
    ) {
      diagnostics.push(
        wasmError(
          `WASM target only supports int/float return types for '${fn.name}'`,
          fn.span,
        ),
      );
      continue;
    }

    const wasmType = retType.name === "int" ? "i32" : "f64";
    const params: string[] = [];
    const paramNames = new Map<string, number>();

    for (let i = 0; i < fn.params.length; i++) {
      const p = fn.params[i];
      if (
        !p.type ||
        p.type.kind !== "NamedType" ||
        !["int", "float"].includes(p.type.name)
      ) {
        diagnostics.push(
          wasmError(
            `WASM target only supports int/float parameter types, got '${p.name}'`,
            p.span,
          ),
        );
        continue;
      }
      const pt = p.type.name === "int" ? "i32" : "f64";
      params.push(`(param $${p.name} ${pt})`);
      paramNames.set(p.name, i);
    }

    // Generate function body
    const bodyInstructions: string[] = [];
    let ok = true;

    for (const bodyStmt of fn.body.body) {
      if (bodyStmt.kind === "ReturnStatement" && bodyStmt.value) {
        const instrs = emitExpr(
          bodyStmt.value,
          paramNames,
          wasmType,
          diagnostics,
        );
        if (instrs === null) {
          ok = false;
          break;
        }
        bodyInstructions.push(...instrs);
      } else {
        diagnostics.push(
          wasmError(
            `WASM target only supports return statements in function body`,
            bodyStmt.span,
          ),
        );
        ok = false;
        break;
      }
    }

    if (!ok) continue;

    const paramStr = params.length > 0 ? " " + params.join(" ") : "";
    funcs.push(
      `  (func $${fn.name}${paramStr} (result ${wasmType})\n    ${bodyInstructions.join("\n    ")}\n  )`,
    );
    exports.push(`  (export "${fn.name}" (func $${fn.name}))`);
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  const wat = `(module\n${funcs.join("\n")}\n${exports.join("\n")}\n)`;
  return { success: true, wat, diagnostics };
}

function emitExpr(
  expr: Expression,
  params: Map<string, number>,
  wasmType: string,
  diagnostics: Diagnostic[],
): string[] | null {
  switch (expr.kind) {
    case "IntLiteral":
      return [`${wasmType}.const ${expr.value}`];
    case "FloatLiteral":
      return [`f64.const ${expr.value}`];
    case "Identifier": {
      if (params.has(expr.name)) {
        return [`local.get $${expr.name}`];
      }
      diagnostics.push(
        wasmError(`WASM: unknown variable '${expr.name}'`, expr.span),
      );
      return null;
    }
    case "BinaryExpr": {
      const left = emitExpr(expr.left, params, wasmType, diagnostics);
      const right = emitExpr(expr.right, params, wasmType, diagnostics);
      if (!left || !right) return null;

      const opMap: Record<string, string> = {
        "+": `${wasmType}.add`,
        "-": `${wasmType}.sub`,
        "*": `${wasmType}.mul`,
        "/": wasmType === "i32" ? "i32.div_s" : "f64.div",
        "%": wasmType === "i32" ? "i32.rem_s" : null!,
      };

      const op = opMap[expr.operator];
      if (!op) {
        diagnostics.push(
          wasmError(
            `WASM target does not support operator '${expr.operator}'`,
            expr.span,
          ),
        );
        return null;
      }
      return [...left, ...right, op];
    }
    default:
      diagnostics.push(
        wasmError(
          `WASM target does not support expression kind '${expr.kind}'`,
          expr.span,
        ),
      );
      return null;
  }
}
