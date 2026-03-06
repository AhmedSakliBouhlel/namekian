import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { compile, buildProject } from "./compiler.js";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./checker/checker.js";
import { reportDiagnostics } from "./errors/reporter.js";
import { Formatter } from "./formatter/formatter.js";
import { typeToString } from "./checker/types.js";
import { readManifest, writeManifest, installDep } from "./package.js";

// ANSI color helpers
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const GRAY = "\x1b[90m";
const RESET = "\x1b[0m";

interface CliOptions {
  command: string;
  file: string;
  outDir?: string;
  noCheck?: boolean;
  showAst?: boolean;
  showTokens?: boolean;
  watch?: boolean;
  sourceMap?: boolean;
  run?: boolean;
  coverage?: boolean;
  target?: "js" | "wasm";
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.length === 0 || (args.length === 1 && args[0] === "repl")) {
    return { command: "repl", file: "" };
  }

  // Commands that don't need a file
  if (args[0] === "init") {
    return { command: "init", file: "." };
  }
  if (args[0] === "test") {
    const testArgs = args.slice(1);
    const cov = testArgs.includes("--coverage");
    const testFile = testArgs.find((a) => !a.startsWith("-")) || ".";
    return { command: "test", file: testFile, coverage: cov };
  }
  if (args[0] === "doc") {
    return { command: "doc", file: args[1] || "." };
  }
  if (args[0] === "bundle" && args.length >= 2) {
    return { command: "bundle", file: args[1] };
  }
  if (args[0] === "install" && args.length >= 2) {
    return { command: "install", file: args[1] };
  }
  if (args[0] === "add" && args.length >= 2) {
    return { command: "add", file: args[1] };
  }

  if (args.length < 2) return null;

  const command = args[0];
  let file = "";
  let outDir: string | undefined;
  let noCheck = false;
  let showAst = false;
  let showTokens = false;
  let watch = false;
  let sourceMap = false;
  let run = false;
  let target: "js" | "wasm" | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" && i + 1 < args.length) {
      outDir = args[++i];
    } else if (arg === "--no-check") {
      noCheck = true;
    } else if (arg === "--ast") {
      showAst = true;
    } else if (arg === "--tokens") {
      showTokens = true;
    } else if (arg === "--watch" || arg === "-w") {
      watch = true;
    } else if (arg === "--source-map") {
      sourceMap = true;
    } else if (arg === "--run") {
      run = true;
    } else if (arg === "--target" && i + 1 < args.length) {
      const t = args[++i];
      if (t === "wasm") target = "wasm";
      else target = "js";
    } else if (!arg.startsWith("-")) {
      file = arg;
    }
  }

  if (!file) return null;
  return {
    command,
    file,
    outDir,
    noCheck,
    showAst,
    showTokens,
    watch,
    sourceMap,
    run,
    target,
  };
}

function printUsage(): void {
  console.log(
    `
Namekian Compiler v0.1.0

Usage: nk <command> [file] [options]

Commands:
  build <file>    Compile .nk file to JavaScript
  run <file>      Compile and execute with Node.js
  check <file>    Type-check without generating code
  fmt <file>      Format source code
  tokens <file>   Print token stream
  ast <file>      Print AST as JSON
  test [dir]      Run *.test.nk files
  doc [dir]       Generate HTML documentation
  bundle <file>   Bundle all files into a single JS file
  init            Create nk.toml in current directory
  install <repo>  Install dependency (owner/repo)
  add <pkg>       Install npm package and generate type stub
  repl            Start interactive REPL (also: nk with no args)

Options:
  -o <dir>        Output directory (default: same as source)
  --no-check      Skip type checking
  --ast           Also print AST when building
  --tokens        Also print tokens when building
  -w, --watch     Watch for changes and recompile
  --run           Re-run after successful compilation (with --watch)
  --source-map    Generate source map (.js.map) alongside compiled output
  --target wasm   Compile to WebAssembly Text (WAT) instead of JavaScript
  --coverage      Show coverage report (with test command)
`.trim(),
  );
}

export async function cli(args: string[]): Promise<void> {
  const opts = parseArgs(args);
  if (!opts) {
    printUsage();
    return;
  }

  if (opts.command === "repl") {
    await startRepl();
    return;
  }

  if (opts.command === "init") {
    const dir = resolve(".");
    const name = basename(dir);
    writeManifest(dir, {
      package: { name, version: "0.1.0" },
      dependencies: {},
    });
    console.log(`${GREEN}Created nk.toml${RESET}`);
    return;
  }

  if (opts.command === "install") {
    const dir = resolve(".");
    const spec = opts.file;
    const { name, path: targetDir } = installDep(dir, spec);

    // Create nk_modules directory
    mkdirSync(dirname(targetDir), { recursive: true });

    // Clone the repo
    const { execSync } = await import("child_process");
    try {
      console.log(`Installing ${spec}...`);
      execSync(`git clone https://github.com/${spec}.git "${targetDir}"`, {
        stdio: "inherit",
      });
    } catch {
      console.error(`${RED}Failed to install ${spec}${RESET}`);
      process.exit(1);
    }

    // Update nk.toml
    let manifest = readManifest(dir);
    if (!manifest) {
      manifest = {
        package: { name: basename(dir), version: "0.1.0" },
        dependencies: {},
      };
    }
    manifest.dependencies[name] = `github:${spec}`;
    writeManifest(dir, manifest);
    console.log(`${GREEN}Installed ${spec}${RESET}`);
    return;
  }

  if (opts.command === "add") {
    const packageName = opts.file;
    const { execSync } = await import("child_process");
    try {
      console.log(`Installing ${packageName} via npm...`);
      execSync(`npm install ${packageName}`, { stdio: "inherit" });
    } catch {
      console.error(`${RED}Failed to install ${packageName}${RESET}`);
      process.exit(1);
    }
    const { generateStub } = await import("./stub-generator.js");
    const stubPath = generateStub(packageName);
    console.log(`${GREEN}Added ${packageName}${RESET}`);
    console.log(`${GRAY}Type stub: ${stubPath}${RESET}`);
    return;
  }

  if (opts.command === "test") {
    await runTests(opts.file, opts.coverage);
    return;
  }

  if (opts.command === "doc") {
    const { extractDocs, generateHtml } = await import("./doc-generator.js");
    const docDir = resolve(opts.file);
    const nkFiles = findNkFiles(docDir);
    if (nkFiles.length === 0) {
      console.log("No .nk files found");
      return;
    }
    const allEntries: Awaited<ReturnType<typeof extractDocs>> = [];
    for (const file of nkFiles) {
      const source = readFileSync(file, "utf-8");
      allEntries.push(...extractDocs(source, file));
    }
    const html = generateHtml(allEntries, basename(docDir));
    const outFile = resolve(docDir, "docs.html");
    writeFileSync(outFile, html);
    console.log(`${GREEN}Generated: ${outFile}${RESET}`);
    return;
  }

  if (opts.command === "bundle") {
    const { bundle: doBundle } = await import("./bundler.js");
    const result = doBundle(resolve(opts.file));
    if (result.diagnostics.length > 0) {
      const source = readFileSync(resolve(opts.file), "utf-8");
      reportDiagnostics(result.diagnostics, source);
    }
    if (!result.success || !result.js) {
      process.exit(1);
    }
    const outFile = resolve(
      dirname(opts.file),
      basename(opts.file).replace(/\.nk$/, ".bundle.js"),
    );
    writeFileSync(outFile, result.js);
    console.log(`${GREEN}Bundled: ${outFile}${RESET}`);
    return;
  }

  const filePath = resolve(opts.file);
  const source = readFileSync(filePath, "utf-8");

  switch (opts.command) {
    case "tokens": {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      if (lexer.diagnostics.length > 0) {
        reportDiagnostics(lexer.diagnostics, source);
      }
      for (const tok of tokens) {
        console.log(
          `${tok.type.padEnd(16)} ${JSON.stringify(tok.value).padEnd(20)} ${tok.line}:${tok.column}`,
        );
      }
      break;
    }

    case "ast": {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, filePath);
      const ast = parser.parse();
      if (parser.diagnostics.length > 0) {
        reportDiagnostics(parser.diagnostics, source);
      }
      console.log(JSON.stringify(ast, null, 2));
      break;
    }

    case "fmt": {
      const lexer = new Lexer(source, filePath);
      const tokens = lexer.tokenize();
      if (lexer.diagnostics.length > 0) {
        reportDiagnostics(lexer.diagnostics, source);
        process.exit(1);
      }
      const parser = new Parser(tokens, filePath);
      const ast = parser.parse();
      if (parser.diagnostics.some((d) => d.severity === "error")) {
        reportDiagnostics(parser.diagnostics, source);
        process.exit(1);
      }
      const formatter = new Formatter();
      const formatted = formatter.format(ast);
      writeFileSync(filePath, formatted);
      console.log(`Formatted: ${filePath}`);
      break;
    }

    case "build": {
      if (opts.target === "wasm") {
        const lexer = new Lexer(source, filePath);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, filePath);
        const ast = parser.parse();
        if (parser.diagnostics.some((d) => d.severity === "error")) {
          reportDiagnostics(parser.diagnostics, source);
          process.exit(1);
        }
        const { generateWat } = await import("./codegen/wasm-codegen.js");
        const wasmResult = generateWat(ast);
        if (wasmResult.diagnostics.length > 0) {
          reportDiagnostics(wasmResult.diagnostics, source);
        }
        if (!wasmResult.success || !wasmResult.wat) {
          process.exit(1);
        }
        const watFile = resolve(
          opts.outDir || dirname(filePath),
          basename(filePath).replace(/\.nk$/, ".wat"),
        );
        writeFileSync(watFile, wasmResult.wat);
        console.log(`Compiled: ${watFile}`);
        break;
      }
      let childProc: ReturnType<typeof import("child_process").spawn> | null =
        null;

      const doBuild = () => {
        const src = readFileSync(filePath, "utf-8");

        if (opts.showTokens) {
          const lexer = new Lexer(src, filePath);
          const tokens = lexer.tokenize();
          for (const tok of tokens) {
            console.log(
              `${tok.type.padEnd(16)} ${JSON.stringify(tok.value).padEnd(20)}`,
            );
          }
          console.log("---");
        }

        if (opts.showAst) {
          const result = compile(src, filePath, { noCheck: opts.noCheck });
          if (result.ast) {
            console.log(JSON.stringify(result.ast, null, 2));
            console.log("---");
          }
        }

        const buildResult = buildProject(filePath, opts.outDir, {
          noCheck: opts.noCheck,
          sourceMap: opts.sourceMap,
        });

        if (buildResult.diagnostics.length > 0) {
          reportDiagnostics(buildResult.diagnostics, src);
        }

        if (!buildResult.success) {
          if (!opts.watch) process.exit(1);
          return;
        }

        for (const outFile of buildResult.outputFiles) {
          console.log(`Compiled: ${outFile}`);
        }

        // Feature 8: --run flag: re-run after successful build
        if (opts.run && buildResult.outputFiles.length > 0) {
          const { spawn } =
            require("child_process") as typeof import("child_process");
          if (childProc) {
            childProc.kill();
            childProc = null;
          }
          console.log(`\n--- Running... ---`);
          childProc = spawn("node", [buildResult.outputFiles[0]], {
            stdio: "inherit",
          });
          childProc.on("exit", () => {
            childProc = null;
          });
        }
      };

      doBuild();

      if (opts.watch) {
        const { watch: fsWatch } = await import("fs");
        console.log(`\nWatching ${filePath} for changes...`);
        let debounce: ReturnType<typeof setTimeout> | null = null;
        fsWatch(filePath, () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            console.log(`\n--- Rebuilding... ---`);
            doBuild();
          }, 100);
        });
        // Keep alive
        await new Promise(() => {});
      }
      break;
    }

    case "run": {
      const result = compile(source, filePath, { noCheck: opts.noCheck });

      if (result.diagnostics.length > 0) {
        reportDiagnostics(result.diagnostics, source);
      }

      if (!result.success) {
        process.exit(1);
      }

      const tmpFile = `/tmp/nk_${Date.now()}.mjs`;
      writeFileSync(tmpFile, result.js!);
      const { execSync } = await import("child_process");
      try {
        execSync(`node ${tmpFile}`, { encoding: "utf-8", stdio: "inherit" });
      } finally {
        const { unlinkSync } = await import("fs");
        try {
          unlinkSync(tmpFile);
        } catch {}
      }
      break;
    }

    case "check": {
      const result = compile(source, filePath);

      if (result.diagnostics.length > 0) {
        reportDiagnostics(result.diagnostics, source);
      }

      if (!result.success) {
        process.exit(1);
      }

      console.log("No errors found.");
      break;
    }

    default:
      console.error(`Unknown command: ${opts.command}`);
      printUsage();
      process.exit(1);
  }
}

// --- Feature 9: Test runner ---

async function runTests(dir: string, coverage?: boolean): Promise<void> {
  const testDir = resolve(dir);
  const testFiles = findTestFiles(testDir);

  if (testFiles.length === 0) {
    console.log("No test files found (*.test.nk)");
    return;
  }

  let passed = 0;
  let failed = 0;
  const coverageReports: {
    file: string;
    percentage: number;
    uncovered: number[];
  }[] = [];

  for (const file of testFiles) {
    const source = readFileSync(file, "utf-8");
    const result = compile(source, file);

    if (!result.success || !result.js) {
      console.log(`${RED}  \u2718 ${file}${RESET}`);
      if (result.diagnostics.length > 0) {
        for (const d of result.diagnostics) {
          console.log(`    ${d.severity}: ${d.message}`);
        }
      }
      failed++;
      continue;
    }

    if (coverage) {
      const { runWithCoverage } = await import("./coverage.js");
      const report = await runWithCoverage(result.js, file);
      if (report) {
        coverageReports.push({
          file,
          percentage: report.percentage,
          uncovered: report.uncoveredLines,
        });
      }
      console.log(`${GREEN}  \u2714 ${file}${RESET}`);
      passed++;
    } else {
      try {
        const tmpFile = `/tmp/nk_test_${Date.now()}.mjs`;
        writeFileSync(tmpFile, result.js);
        const { execSync } = await import("child_process");
        execSync(`node ${tmpFile}`, { encoding: "utf-8", stdio: "pipe" });
        const { unlinkSync } = await import("fs");
        try {
          unlinkSync(tmpFile);
        } catch {}
        console.log(`${GREEN}  \u2714 ${file}${RESET}`);
        passed++;
      } catch (err: unknown) {
        console.log(`${RED}  \u2718 ${file}${RESET}`);
        if (err instanceof Error && "stderr" in err) {
          const msg = String((err as { stderr: unknown }).stderr).trim();
          if (msg) console.log(`    ${msg.split("\n")[0]}`);
        }
        failed++;
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (coverage && coverageReports.length > 0) {
    console.log(`\n${CYAN}Coverage:${RESET}`);
    for (const r of coverageReports) {
      const color =
        r.percentage >= 80 ? GREEN : r.percentage >= 50 ? CYAN : RED;
      console.log(`  ${color}${r.percentage}%${RESET} ${r.file}`);
      if (r.uncovered.length > 0 && r.uncovered.length <= 10) {
        console.log(
          `    ${GRAY}Uncovered lines: ${r.uncovered.join(", ")}${RESET}`,
        );
      }
    }
  }

  if (failed > 0) process.exit(1);
}

function findNkFiles(dir: string): string[] {
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === "nk_modules" || entry === "node_modules") continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...findNkFiles(full));
        } else if (entry.endsWith(".nk") && !entry.endsWith(".test.nk")) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

function findTestFiles(dir: string): string[] {
  const { readdirSync, statSync } = require("fs") as typeof import("fs");
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry === "nk_modules" || entry === "node_modules") continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...findTestFiles(full));
        } else if (entry.endsWith(".test.nk")) {
          results.push(full);
        }
      } catch {}
    }
  } catch {}
  return results;
}

// --- Feature 7: REPL improvements ---

async function startRepl(): Promise<void> {
  const { createInterface } = await import("readline");

  // Collect known identifiers for tab completion
  const keywords = [
    "int",
    "float",
    "string",
    "bool",
    "void",
    "var",
    "const",
    "if",
    "else",
    "while",
    "for",
    "return",
    "break",
    "continue",
    "struct",
    "class",
    "interface",
    "enum",
    "match",
    "take",
    "load",
    "try",
    "catch",
    "true",
    "false",
    "null",
    "new",
    "print",
    "assert",
    "Ok",
    "Err",
    "type",
  ];

  // Persistent checker for type display
  let checkerNames = [...keywords];

  function completer(line: string): [string[], string] {
    const hits = checkerNames.filter((c) => c.startsWith(line));
    return [hits.length > 0 ? hits : checkerNames, line];
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${CYAN}nk>${RESET} `,
    completer,
  });

  console.log("Namekian REPL v0.1.0 — type .exit to quit");
  rl.prompt();

  let buffer = "";

  rl.on("line", (line: string) => {
    const trimmed = line.trim();

    if (trimmed === ".exit") {
      rl.close();
      return;
    }

    if (trimmed === ".help") {
      console.log("  .exit    Exit the REPL");
      console.log("  .help    Show this help");
      console.log("  .clear   Clear multi-line buffer");
      rl.prompt();
      return;
    }

    if (trimmed === ".clear") {
      buffer = "";
      rl.setPrompt(`${CYAN}nk>${RESET} `);
      rl.prompt();
      return;
    }

    buffer += line + "\n";

    // Try to compile and run (with type checking enabled)
    const result = compile(buffer, "<repl>");

    if (!result.success || !result.js) {
      // Check if it might be an incomplete statement (missing closing brace, etc.)
      const openBraces = (buffer.match(/\{/g) || []).length;
      const closeBraces = (buffer.match(/\}/g) || []).length;
      const openParens = (buffer.match(/\(/g) || []).length;
      const closeParens = (buffer.match(/\)/g) || []).length;

      if (openBraces > closeBraces || openParens > closeParens) {
        // Likely incomplete — wait for more input
        rl.setPrompt(`${GRAY}...${RESET} `);
        rl.prompt();
        return;
      }

      // Real error
      if (result.diagnostics.length > 0) {
        for (const d of result.diagnostics) {
          console.error(`  ${RED}${d.severity}: ${d.message}${RESET}`);
        }
      }
      buffer = "";
      rl.setPrompt(`${CYAN}nk>${RESET} `);
      rl.prompt();
      return;
    }

    // Try to get type info for expression statements
    if (result.ast) {
      try {
        const checker = new TypeChecker("<repl>");
        checker.check(result.ast);
        // Update completion candidates
        const names = new Set([...keywords]);
        const allSyms = [...checker.getExportedTypes().keys()];
        for (const s of allSyms) names.add(s);
        checkerNames = [...names];

        // Show type for the last expression statement
        const lastStmt = result.ast.body[result.ast.body.length - 1];
        if (lastStmt && lastStmt.kind === "ExpressionStatement") {
          const exprType = checker.typeMap.get(lastStmt.expression.span.offset);
          if (exprType) {
            // Will print after execution
            const typeStr = typeToString(exprType);
            // Execute first, then show type
            try {
              const fn = new Function(result.js);
              fn();
            } catch (err: unknown) {
              if (err instanceof Error) {
                console.error(`  ${RED}Runtime error: ${err.message}${RESET}`);
              }
            }
            console.log(`${GRAY}  // : ${typeStr}${RESET}`);
            buffer = "";
            rl.setPrompt(`${CYAN}nk>${RESET} `);
            rl.prompt();
            return;
          }
        }
      } catch {
        // Ignore checker errors for REPL display
      }
    }

    // Execute the compiled JS
    try {
      const fn = new Function(result.js);
      fn();
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`  ${RED}Runtime error: ${err.message}${RESET}`);
      }
    }

    buffer = "";
    rl.setPrompt(`${CYAN}nk>${RESET} `);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nBye!");
  });

  // Keep the process alive while REPL is running
  return new Promise((resolve) => {
    rl.on("close", resolve);
  });
}
