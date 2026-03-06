import { describe, it, expect } from "vitest";
import { compile } from "../src/compiler.js";
import {
  extractDocs,
  extractDocsFromAst,
  generateHtml,
} from "../src/doc-generator.js";
import { bundle } from "../src/bundler.js";
import { generateWat } from "../src/codegen/wasm-codegen.js";
import { getCodeActions } from "../src/lsp/code-actions.js";
import { getReferences } from "../src/lsp/references.js";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { Diagnostic } from "../src/errors/diagnostic.js";

// ---------------------------------------------------------------------------
// Doc Generator (Feature 22/23)
// ---------------------------------------------------------------------------

describe("Doc Generator", () => {
  it("extracts function docs", () => {
    const entries = extractDocs(
      "/// Adds two numbers\nint add(int a, int b) { return a + b; }",
      "test.nk",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("function");
    expect(entries[0].name).toBe("add");
    expect(entries[0].doc).toBe("Adds two numbers");
    expect(entries[0].signature).toContain("add");
  });

  it("extracts struct docs with fields and methods", () => {
    const entries = extractDocs(
      "/// A point in 2D\nstruct Point { float x; float y; float dist() { return x; } }",
      "test.nk",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("struct");
    expect(entries[0].name).toBe("Point");
    expect(entries[0].doc).toBe("A point in 2D");
    expect(entries[0].fields).toContain("float x");
    expect(entries[0].methods).toHaveLength(1);
    expect(entries[0].methods![0].name).toBe("dist");
  });

  it("extracts enum docs with variants", () => {
    const entries = extractDocs(
      "/// Directions\nenum Dir { North, South, East, West }",
      "test.nk",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("enum");
    expect(entries[0].variants).toEqual(["North", "South", "East", "West"]);
  });

  it("extracts class docs", () => {
    const entries = extractDocs(
      "/// A counter\nclass Counter { int count; void inc() { count = count + 1; } }",
      "test.nk",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("class");
    expect(entries[0].name).toBe("Counter");
    expect(entries[0].fields).toContain("int count");
  });

  it("generates HTML", () => {
    const entries = extractDocs(
      "/// Greets\nstring greet(string name) { return name; }",
      "test.nk",
    );
    const html = generateHtml(entries, "Test Docs");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Test Docs");
    expect(html).toContain("greet");
    expect(html).toContain("Greets");
  });

  it("handles function without doc comment", () => {
    const entries = extractDocs(
      "int add(int a, int b) { return a + b; }",
      "test.nk",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].doc).toBeUndefined();
  });

  it("extracts from AST directly", () => {
    const source = "/// Hello\nvoid greet() { }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const entries = extractDocsFromAst(ast);
    expect(entries).toHaveLength(1);
    expect(entries[0].doc).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// WASM Codegen (Feature 28)
// ---------------------------------------------------------------------------

describe("WASM Codegen", () => {
  it("generates WAT for simple arithmetic function", () => {
    const source = "int add(int a, int b) { return a + b; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain("(module");
    expect(result.wat).toContain("i32.add");
    expect(result.wat).toContain('(export "add"');
    expect(result.wat).toContain("(param $a i32)");
    expect(result.wat).toContain("(param $b i32)");
    expect(result.wat).toContain("(result i32)");
  });

  it("generates WAT for subtraction", () => {
    const source = "int sub(int a, int b) { return a - b; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain("i32.sub");
  });

  it("generates WAT for multiplication", () => {
    const source = "int mul(int a, int b) { return a * b; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain("i32.mul");
  });

  it("generates WAT for integer constants", () => {
    const source = "int five() { return 5; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain("i32.const 5");
  });

  it("errors on non-function declarations", () => {
    const source = "int x = 5;";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].message).toContain(
      "only supports function declarations",
    );
  });

  it("errors on unsupported return types", () => {
    const source = 'string hello() { return "hi"; }';
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(false);
    expect(result.diagnostics[0].message).toContain(
      "only supports int/float return types",
    );
  });

  it("supports float type", () => {
    const source = "float add(float a, float b) { return a + b; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain("f64.add");
    expect(result.wat).toContain("(param $a f64)");
    expect(result.wat).toContain("(result f64)");
  });

  it("supports multiple functions", () => {
    const source =
      "int add(int a, int b) { return a + b; }\nint sub(int a, int b) { return a - b; }";
    const lexer = new Lexer(source, "test.nk");
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, "test.nk");
    const ast = parser.parse();
    const result = generateWat(ast);
    expect(result.success).toBe(true);
    expect(result.wat).toContain('(export "add"');
    expect(result.wat).toContain('(export "sub"');
  });
});

// ---------------------------------------------------------------------------
// Code Actions (Feature 25)
// ---------------------------------------------------------------------------

describe("Code Actions", () => {
  it("suggests did-you-mean fix", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        message: "Undefined variable 'prnt'. Did you mean 'print'?",
        location: { file: "test.nk", line: 1, column: 1, offset: 0 },
      },
    ];
    const source = 'prnt("hello");';
    const actions = getCodeActions(diags, source, 0, source.length);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].title).toContain("print");
    expect(actions[0].kind).toBe("quickfix");
  });

  it("suggests prefix _ for unused variable", () => {
    const diags: Diagnostic[] = [
      {
        severity: "warning",
        message: "Variable 'foo' is declared but never used",
        location: { file: "test.nk", line: 1, column: 1, offset: 0 },
      },
    ];
    const source = "var foo = 42;";
    const actions = getCodeActions(diags, source, 0, source.length);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].title).toContain("_");
  });

  it("suggests wildcard arm for non-exhaustive match", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        message: "Non-exhaustive match: not all cases covered",
        location: { file: "test.nk", line: 1, column: 1, offset: 0 },
      },
    ];
    const source = "match x { 1 => {} }";
    const actions = getCodeActions(diags, source, 0, source.length);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].title).toContain("wildcard");
  });

  it("returns empty for unrelated diagnostics", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        message: "Type mismatch: expected int, got string",
        location: { file: "test.nk", line: 1, column: 1, offset: 0 },
      },
    ];
    const actions = getCodeActions(diags, "var x = 5;", 0, 100);
    expect(actions).toHaveLength(0);
  });

  it("filters diagnostics by range", () => {
    const diags: Diagnostic[] = [
      {
        severity: "warning",
        message: "Variable 'foo' is declared but never used",
        location: { file: "test.nk", line: 1, column: 1, offset: 50 },
      },
    ];
    const actions = getCodeActions(diags, "var foo = 42;", 0, 20);
    expect(actions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// LSP Rename (Feature 24)
// ---------------------------------------------------------------------------

describe("LSP Rename", () => {
  it("finds all references for rename", () => {
    const source = "int x = 5;\nint y = x + 1;\nprint(x);";
    const result = compile(source, "test.nk", { retainChecker: true });
    expect(result.success).toBe(true);

    // x in expression at offset 19 ("int y = x + 1;", x is at column 8 on line 2)
    const xOffset = source.indexOf("x + 1");
    const refs = getReferences(result.ast!, source, xOffset, "test.nk");
    // Should find at least 2 expression uses of x
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("finds function name references for rename", () => {
    const source =
      "int add(int a, int b) { return a + b; }\nint z = add(1, 2);";
    const result = compile(source, "test.nk", { retainChecker: true });
    expect(result.success).toBe(true);

    // 'add' in the call expression
    const callOffset = source.indexOf("add(1");
    const refs = getReferences(result.ast!, source, callOffset, "test.nk");
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Doc comment in hover (Feature 22)
// ---------------------------------------------------------------------------

describe("Doc comments in compilation", () => {
  it("preserves doc comments in AST", () => {
    const source =
      "/// This adds numbers\nint add(int a, int b) { return a + b; }";
    const result = compile(source, "test.nk");
    expect(result.success).toBe(true);
    const fn = result.ast!.body[0];
    expect(fn.kind).toBe("FunctionDeclaration");
    if (fn.kind === "FunctionDeclaration") {
      expect(fn.docComment).toBe("This adds numbers");
    }
  });

  it("preserves struct doc comments", () => {
    const source = "/// A point\nstruct Point { float x; float y; }";
    const result = compile(source, "test.nk");
    expect(result.success).toBe(true);
    const s = result.ast!.body[0];
    if (s.kind === "StructDeclaration") {
      expect(s.docComment).toBe("A point");
    }
  });

  it("doc comments are erased in codegen", () => {
    const result = compile(
      "/// Doc here\nint add(int a, int b) { return a + b; }",
      "test.nk",
      { noCheck: true },
    );
    expect(result.success).toBe(true);
    expect(result.js).not.toContain("///");
    expect(result.js).not.toContain("Doc here");
  });
});

// ---------------------------------------------------------------------------
// Bundler (Feature 27) - basic single-file test
// ---------------------------------------------------------------------------

describe("Bundler", () => {
  it("wraps output in IIFE", () => {
    // We can't easily test multi-file without real files, but we can test
    // the IIFE wrapping by checking the structure
    const { writeFileSync, unlinkSync, mkdirSync, rmdirSync } = require("fs");
    const { join } = require("path");
    const tmpDir = "/tmp/nk_bundle_test_" + Date.now();
    mkdirSync(tmpDir, { recursive: true });
    const testFile = join(tmpDir, "main.nk");
    writeFileSync(testFile, 'print("hello");');

    const result = bundle(testFile);
    expect(result.success).toBe(true);
    expect(result.js).toContain("(function()");
    expect(result.js).toContain("use strict");
    expect(result.js).toContain("console.log");
    expect(result.js).toContain("})();");

    // Cleanup
    try {
      unlinkSync(testFile);
    } catch {}
    try {
      rmdirSync(tmpDir);
    } catch {}
  });

  it("reports error for missing file", () => {
    const result = bundle("/tmp/nonexistent_nk_file_" + Date.now() + ".nk");
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
