/**
 * Browser entry point — self-contained compile() that does not import Node.js modules.
 */
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./checker/checker.js";
import { CodeGenerator } from "./codegen/codegen.js";
import { Diagnostic } from "./errors/diagnostic.js";
import { Program } from "./parser/ast.js";

export interface CompileOptions {
  noCheck?: boolean;
}

export interface CompileResult {
  success: boolean;
  js?: string;
  ast?: Program;
  diagnostics: Diagnostic[];
}

export function compile(
  source: string,
  file = "<playground>",
  options: CompileOptions = {},
): CompileResult {
  const diagnostics: Diagnostic[] = [];

  const lexer = new Lexer(source, file);
  const tokens = lexer.tokenize();
  diagnostics.push(...lexer.diagnostics);

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  const parser = new Parser(tokens, file);
  const ast = parser.parse();
  diagnostics.push(...parser.diagnostics);

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, ast, diagnostics };
  }

  if (!options.noCheck) {
    const checker = new TypeChecker(file);
    checker.check(ast);
    diagnostics.push(...checker.diagnostics);

    if (diagnostics.some((d) => d.severity === "error")) {
      return { success: false, ast, diagnostics };
    }
  }

  const codegen = new CodeGenerator();
  const js = codegen.generate(ast);

  return { success: true, js, ast, diagnostics };
}

// Expose on globalThis for the playground
(globalThis as Record<string, unknown>).nk = { compile };
