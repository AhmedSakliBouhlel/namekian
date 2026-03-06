import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { compile } from "./compiler.js";
import { Diagnostic, errorDiag } from "./errors/diagnostic.js";

export interface BundleResult {
  success: boolean;
  js?: string;
  diagnostics: Diagnostic[];
}

export function bundle(entryFile: string): BundleResult {
  const absEntry = resolve(entryFile);
  const compiled = new Map<string, string>();
  const inProgress = new Set<string>();
  const order: string[] = [];
  const diagnostics: Diagnostic[] = [];

  function processFile(filePath: string): boolean {
    const absPath = resolve(filePath);

    if (compiled.has(absPath)) return true;

    if (inProgress.has(absPath)) {
      diagnostics.push(
        errorDiag(`Circular import detected: ${absPath}`, {
          file: absPath,
          line: 1,
          column: 1,
          offset: 0,
        }),
      );
      return false;
    }

    if (!existsSync(absPath)) {
      diagnostics.push(
        errorDiag(`File not found: ${absPath}`, {
          file: absPath,
          line: 1,
          column: 1,
          offset: 0,
        }),
      );
      return false;
    }

    inProgress.add(absPath);
    const source = readFileSync(absPath, "utf-8");

    // Discover local imports
    const lexer = new Lexer(source, absPath);
    const tokens = lexer.tokenize();
    if (!lexer.diagnostics.some((d) => d.severity === "error")) {
      const parser = new Parser(tokens, absPath);
      const ast = parser.parse();
      if (!parser.diagnostics.some((d) => d.severity === "error")) {
        for (const stmt of ast.body) {
          if (stmt.kind === "TakeStatement") {
            if (stmt.path.startsWith("./") || stmt.path.startsWith("../")) {
              const depPath = resolve(dirname(absPath), stmt.path);
              const nkPath = depPath.endsWith(".nk")
                ? depPath
                : depPath + ".nk";
              processFile(nkPath);
            }
          }
        }
      }
    }

    // Compile the file
    const result = compile(source, absPath, { noCheck: false });
    diagnostics.push(...result.diagnostics);

    if (!result.success || !result.js) {
      inProgress.delete(absPath);
      return false;
    }

    inProgress.delete(absPath);
    compiled.set(absPath, result.js);
    order.push(absPath);
    return true;
  }

  processFile(absEntry);

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  // Concatenate all compiled JS into a single IIFE
  const parts: string[] = [];
  parts.push("(function() {");
  parts.push('"use strict";');
  for (const filePath of order) {
    const js = compiled.get(filePath)!;
    parts.push(`// --- ${filePath} ---`);
    parts.push(js);
  }
  parts.push("})();");

  return { success: true, js: parts.join("\n"), diagnostics };
}
