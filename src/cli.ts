import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { compile, buildProject } from "./compiler.js";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { reportDiagnostics } from "./errors/reporter.js";
import { Formatter } from "./formatter/formatter.js";

interface CliOptions {
  command: string;
  file: string;
  outDir?: string;
  noCheck?: boolean;
  showAst?: boolean;
  showTokens?: boolean;
  watch?: boolean;
  sourceMap?: boolean;
}

function parseArgs(args: string[]): CliOptions | null {
  if (args.length === 0 || (args.length === 1 && args[0] === "repl")) {
    return { command: "repl", file: "" };
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
  repl            Start interactive REPL (also: nk with no args)

Options:
  -o <dir>        Output directory (default: same as source)
  --no-check      Skip type checking
  --ast           Also print AST when building
  --tokens        Also print tokens when building
  -w, --watch     Watch for changes and recompile
  --source-map    Generate source map (.js.map) alongside compiled output
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

async function startRepl(): Promise<void> {
  const { createInterface } = await import("readline");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "nk> ",
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
      rl.setPrompt("nk> ");
      rl.prompt();
      return;
    }

    buffer += line + "\n";

    // Try to compile and run
    const result = compile(buffer, "<repl>", { noCheck: true });

    if (!result.success || !result.js) {
      // Check if it might be an incomplete statement (missing closing brace, etc.)
      const openBraces = (buffer.match(/\{/g) || []).length;
      const closeBraces = (buffer.match(/\}/g) || []).length;
      const openParens = (buffer.match(/\(/g) || []).length;
      const closeParens = (buffer.match(/\)/g) || []).length;

      if (openBraces > closeBraces || openParens > closeParens) {
        // Likely incomplete — wait for more input
        rl.setPrompt("... ");
        rl.prompt();
        return;
      }

      // Real error
      if (result.diagnostics.length > 0) {
        for (const d of result.diagnostics) {
          console.error(`  ${d.severity}: ${d.message}`);
        }
      }
      buffer = "";
      rl.setPrompt("nk> ");
      rl.prompt();
      return;
    }

    // Execute the compiled JS
    try {
      const fn = new Function(result.js);
      fn();
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`  Runtime error: ${err.message}`);
      }
    }

    buffer = "";
    rl.setPrompt("nk> ");
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
