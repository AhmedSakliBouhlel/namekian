import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./checker/checker.js";
import { CodeGenerator } from "./codegen/codegen.js";
import { Diagnostic, errorDiag } from "./errors/diagnostic.js";
import { Program } from "./parser/ast.js";
import { NkType } from "./checker/types.js";

export interface CompileOptions {
  noCheck?: boolean;
  retainChecker?: boolean;
  sourceMap?: boolean;
  externalTypes?: Map<string, Map<string, NkType>>;
  projectMode?: boolean;
}

export interface CompileResult {
  success: boolean;
  js?: string;
  sourceMap?: string;
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
    checker = new TypeChecker(file, options.externalTypes);
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
  let js: string;
  let sourceMap: string | undefined;

  if (options.sourceMap) {
    const result = codegen.generateWithMap(ast, source, file);
    js = result.code;
    sourceMap = result.sourceMap;
  } else {
    js = codegen.generate(ast, { projectMode: options.projectMode });
  }

  return {
    success: true,
    js,
    sourceMap,
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
  // Accumulates exported types keyed by absolute file path
  const exportedTypes = new Map<string, Map<string, NkType>>();

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

    // First compile all local dependencies so their exported types are available
    const source = readFileSync(absPath, "utf-8");

    // Parse-only pass to discover imports before full compilation
    const preLexer = new Lexer(source, absPath);
    const preTokens = preLexer.tokenize();
    if (!preLexer.diagnostics.some((d) => d.severity === "error")) {
      const preParser = new Parser(preTokens, absPath);
      const preAst = preParser.parse();
      if (!preParser.diagnostics.some((d) => d.severity === "error")) {
        for (const stmt of preAst.body) {
          if (stmt.kind === "TakeStatement") {
            if (stmt.path.startsWith("./") || stmt.path.startsWith("../")) {
              const depPath = resolve(dirname(absPath), stmt.path);
              const nkPath = depPath.endsWith(".nk")
                ? depPath
                : depPath + ".nk";
              compileFile(nkPath);
            }
          }
        }
      }
    }

    // Now compile this file with cross-file type information
    const fileOptions: CompileOptions = {
      ...options,
      projectMode: true,
      retainChecker: true,
      externalTypes: options.noCheck ? undefined : exportedTypes,
    };

    const result = compile(source, absPath, fileOptions);
    allDiagnostics.push(...result.diagnostics);

    if (!result.success || !result.js) {
      inProgress.delete(absPath);
      return false;
    }

    // Store exported types from this file for files that import it
    if (!options.noCheck && result.checker) {
      exportedTypes.set(absPath, result.checker.getExportedTypes());
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
  const outputFiles: string[] = [];

  if (options.sourceMap) {
    // When source maps are requested we compile each file individually so we
    // can capture the source map string alongside the JS output.
    const compiled = new Map<string, { js: string; sourceMap?: string }>();
    const inProgress = new Set<string>();
    const allDiagnostics: Diagnostic[] = [];

    function compileFileWithMap(filePath: string): boolean {
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

      if (result.ast) {
        for (const stmt of result.ast.body) {
          if (stmt.kind === "TakeStatement") {
            if (stmt.path.startsWith("./") || stmt.path.startsWith("../")) {
              const depPath = resolve(dirname(absPath), stmt.path);
              const nkPath = depPath.endsWith(".nk")
                ? depPath
                : depPath + ".nk";
              compileFileWithMap(nkPath);
            }
          }
        }
      }

      inProgress.delete(absPath);
      compiled.set(absPath, { js: result.js, sourceMap: result.sourceMap });
      return true;
    }

    compileFileWithMap(entryFile);

    for (const [absPath, { js, sourceMap }] of compiled) {
      const dir = outDir || dirname(absPath);
      const outFile = resolve(dir, basename(absPath).replace(/\.nk$/, ".js"));
      writeFileSync(outFile, js);
      outputFiles.push(outFile);

      if (sourceMap) {
        const mapFile = outFile + ".map";
        writeFileSync(mapFile, sourceMap);
        outputFiles.push(mapFile);
      }
    }

    const hasErrors = allDiagnostics.some((d) => d.severity === "error");
    return { success: !hasErrors, diagnostics: allDiagnostics, outputFiles };
  }

  const { files, diagnostics } = compileProject(entryFile, options);

  for (const [absPath, js] of files) {
    const dir = outDir || dirname(absPath);
    const outFile = resolve(dir, basename(absPath).replace(/\.nk$/, ".js"));
    writeFileSync(outFile, js);
    outputFiles.push(outFile);
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return { success: !hasErrors, diagnostics, outputFiles };
}
