import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./checker/checker.js";
import { CodeGenerator } from "./codegen/codegen.js";
import { Diagnostic, errorDiag } from "./errors/diagnostic.js";
import { Program } from "./parser/ast.js";

export interface CompileOptions {
  noCheck?: boolean;
  retainChecker?: boolean;
}

export interface CompileResult {
  success: boolean;
  js?: string;
  ast?: Program;
  diagnostics: Diagnostic[];
  checker?: TypeChecker;
}

export function compile(
  source: string,
  file = "<stdin>",
  options: CompileOptions = {},
): CompileResult {
  const diagnostics: Diagnostic[] = [];

  // Lex
  const lexer = new Lexer(source, file);
  const tokens = lexer.tokenize();
  diagnostics.push(...lexer.diagnostics);

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, diagnostics };
  }

  // Parse
  const parser = new Parser(tokens, file);
  const ast = parser.parse();
  diagnostics.push(...parser.diagnostics);

  if (diagnostics.some((d) => d.severity === "error")) {
    return { success: false, ast, diagnostics };
  }

  // Type check
  let checker: TypeChecker | undefined;
  if (!options.noCheck) {
    checker = new TypeChecker(file);
    checker.check(ast);
    diagnostics.push(...checker.diagnostics);

    if (diagnostics.some((d) => d.severity === "error")) {
      return {
        success: false,
        ast,
        diagnostics,
        checker: options.retainChecker ? checker : undefined,
      };
    }
  }

  // Codegen
  const codegen = new CodeGenerator();
  const js = codegen.generate(ast);

  return {
    success: true,
    js,
    ast,
    diagnostics,
    checker: options.retainChecker ? checker : undefined,
  };
}

/**
 * Compile a .nk file and all its local dependencies.
 * Returns a map of input file path → compiled JS string.
 */
export function compileProject(
  entryFile: string,
  options: CompileOptions = {},
): { files: Map<string, string>; diagnostics: Diagnostic[] } {
  const compiled = new Map<string, string>();
  const inProgress = new Set<string>();
  const allDiagnostics: Diagnostic[] = [];

  function compileFile(filePath: string): boolean {
    const absPath = resolve(filePath);

    if (compiled.has(absPath)) return true;

    if (inProgress.has(absPath)) {
      allDiagnostics.push(
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
      allDiagnostics.push(
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
    const result = compile(source, absPath, options);
    allDiagnostics.push(...result.diagnostics);

    if (!result.success || !result.js) {
      inProgress.delete(absPath);
      return false;
    }

    // Find local take imports and compile dependencies
    if (result.ast) {
      for (const stmt of result.ast.body) {
        if (stmt.kind === "TakeStatement") {
          if (stmt.path.startsWith("./") || stmt.path.startsWith("../")) {
            const depPath = resolve(dirname(absPath), stmt.path);
            const nkPath = depPath.endsWith(".nk") ? depPath : depPath + ".nk";
            compileFile(nkPath);
          }
        }
      }
    }

    inProgress.delete(absPath);
    compiled.set(absPath, result.js);
    return true;
  }

  compileFile(entryFile);
  return { files: compiled, diagnostics: allDiagnostics };
}

/**
 * Compile a project and write all output .js files.
 */
export function buildProject(
  entryFile: string,
  outDir?: string,
  options: CompileOptions = {},
): { success: boolean; diagnostics: Diagnostic[]; outputFiles: string[] } {
  const { files, diagnostics } = compileProject(entryFile, options);
  const outputFiles: string[] = [];

  for (const [absPath, js] of files) {
    const dir = outDir || dirname(absPath);
    const outFile = resolve(dir, basename(absPath).replace(/\.nk$/, ".js"));
    writeFileSync(outFile, js);
    outputFiles.push(outFile);
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return { success: !hasErrors, diagnostics, outputFiles };
}
