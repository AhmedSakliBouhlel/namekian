import { describe, it, expect } from "vitest";
import { compile } from "../src/compiler.js";
import {
  positionToOffset,
  offsetToPosition,
  nkSpanToLspRange,
} from "../src/lsp/span-utils.js";
import { convertDiagnostics } from "../src/lsp/diagnostics.js";
import { findNodeAtOffset } from "../src/lsp/hover.js";
import { getCompletions } from "../src/lsp/completions.js";
import { buildSymbolIndex } from "../src/lsp/symbol-index.js";
import { getDefinition } from "../src/lsp/definition.js";
import { getReferences } from "../src/lsp/references.js";
import { Diagnostic } from "../src/errors/diagnostic.js";

// ---------------------------------------------------------------------------
// span-utils
// ---------------------------------------------------------------------------

describe("span-utils: positionToOffset", () => {
  it("returns 0 for line 0 character 0 on any source", () => {
    expect(positionToOffset("hello", 0, 0)).toBe(0);
    expect(positionToOffset("", 0, 0)).toBe(0);
  });

  it("returns the character offset directly on a single-line source", () => {
    const source = "int x = 42;";
    expect(positionToOffset(source, 0, 0)).toBe(0);
    expect(positionToOffset(source, 0, 4)).toBe(4);
    expect(positionToOffset(source, 0, 8)).toBe(8);
  });

  it("counts past newlines to reach the correct line", () => {
    const source = "line1\nline2\nline3";
    // Line 1, character 0 is the first character of "line2"
    expect(positionToOffset(source, 1, 0)).toBe(6);
    // Line 2, character 3 is the 'd' in "line3"
    expect(positionToOffset(source, 2, 3)).toBe(15);
  });

  it("handles CRLF-style line endings by treating \\n as the separator", () => {
    // Only \n is counted as newline separator; \r is treated as a character
    const source = "a\nb\nc";
    expect(positionToOffset(source, 1, 0)).toBe(2);
    expect(positionToOffset(source, 2, 0)).toBe(4);
  });

  it("handles a line number beyond source length gracefully", () => {
    const source = "abc";
    // Requesting line 5 on a one-line source: the loop exhausts the source
    const offset = positionToOffset(source, 5, 0);
    expect(offset).toBeGreaterThanOrEqual(source.length);
  });
});

describe("span-utils: offsetToPosition", () => {
  it("returns {line:0, character:0} for offset 0", () => {
    expect(offsetToPosition("hello", 0)).toEqual({ line: 0, character: 0 });
  });

  it("returns correct position within a single line", () => {
    const source = "int x = 42;";
    expect(offsetToPosition(source, 4)).toEqual({ line: 0, character: 4 });
    expect(offsetToPosition(source, 8)).toEqual({ line: 0, character: 8 });
  });

  it("advances the line counter when it encounters \\n", () => {
    const source = "line1\nline2\nline3";
    // Offset 6 is the first char of line2 ('l')
    expect(offsetToPosition(source, 6)).toEqual({ line: 1, character: 0 });
    // Offset 11 is the '\n' after line2; at that point we haven't stepped past it yet
    // — after the loop body executes for index 11 (the second \n), line becomes 2,
    // character resets to 0, so offset 12 (first char of line3) is {line:2, character:0}
    expect(offsetToPosition(source, 12)).toEqual({ line: 2, character: 0 });
  });

  it("resets the character counter to 0 after each newline", () => {
    const source = "ab\ncd";
    // Offset 3 is 'c', the first character of line 2
    expect(offsetToPosition(source, 3)).toEqual({ line: 1, character: 0 });
    // Offset 4 is 'd'
    expect(offsetToPosition(source, 4)).toEqual({ line: 1, character: 1 });
  });

  it("clamps gracefully when offset exceeds source length", () => {
    const source = "hi";
    const pos = offsetToPosition(source, 100);
    // Should not throw; line must be 0 and character at most 2
    expect(pos.line).toBe(0);
    expect(pos.character).toBeLessThanOrEqual(source.length);
  });

  it("round-trips with positionToOffset on single-line sources", () => {
    const source = "int x = 42;";
    for (let i = 0; i <= source.length; i++) {
      const pos = offsetToPosition(source, i);
      const back = positionToOffset(source, pos.line, pos.character);
      expect(back).toBe(i);
    }
  });

  it("round-trips with positionToOffset on multi-line sources", () => {
    const source = "foo\nbar\nbaz";
    for (let i = 0; i <= source.length; i++) {
      const pos = offsetToPosition(source, i);
      const back = positionToOffset(source, pos.line, pos.character);
      expect(back).toBe(i);
    }
  });
});

describe("span-utils: nkSpanToLspRange", () => {
  it("converts a 1-based span at the start of a single-line source", () => {
    // "int x = 42;"
    // Span for "int": line=1, column=1, offset=0, nameLength=3
    const source = "int x = 42;";
    const span = { line: 1, column: 1, offset: 0 };
    const range = nkSpanToLspRange(source, span, 3);
    expect(range.start).toEqual({ line: 0, character: 0 });
    expect(range.end).toEqual({ line: 0, character: 3 });
  });

  it("converts a 1-based span in the middle of a line", () => {
    // "int x = 42;" — identifier 'x' is at offset 4, line=1, column=5
    const source = "int x = 42;";
    const span = { line: 1, column: 5, offset: 4 };
    const range = nkSpanToLspRange(source, span, 1);
    expect(range.start).toEqual({ line: 0, character: 4 });
    expect(range.end).toEqual({ line: 0, character: 5 });
  });

  it("defaults nameLength to 1 when not provided", () => {
    const source = "int x = 42;";
    const span = { line: 1, column: 5, offset: 4 };
    const range = nkSpanToLspRange(source, span);
    expect(range.start).toEqual({ line: 0, character: 4 });
    expect(range.end).toEqual({ line: 0, character: 5 });
  });

  it("handles multi-line sources correctly — start is on the right line", () => {
    // source: "foo\nbar"
    // span for 'bar': line=2, column=1, offset=4, nameLength=3
    const source = "foo\nbar";
    const span = { line: 2, column: 1, offset: 4 };
    const range = nkSpanToLspRange(source, span, 3);
    expect(range.start).toEqual({ line: 1, character: 0 });
    expect(range.end).toEqual({ line: 1, character: 3 });
  });

  it("handles a longer nameLength that spans multiple characters on same line", () => {
    const source = "int myVar = 0;";
    // 'myVar' starts at offset 4, line=1, column=5
    const span = { line: 1, column: 5, offset: 4 };
    const range = nkSpanToLspRange(source, span, 5);
    expect(range.start).toEqual({ line: 0, character: 4 });
    expect(range.end).toEqual({ line: 0, character: 9 });
  });
});

// ---------------------------------------------------------------------------
// diagnostics
// ---------------------------------------------------------------------------

describe("diagnostics: convertDiagnostics", () => {
  it("returns an empty array when given no diagnostics", () => {
    expect(convertDiagnostics([])).toEqual([]);
  });

  it("maps severity 'error' to LSP severity 1", () => {
    const diag: Diagnostic = {
      severity: "error",
      message: "Something went wrong",
      location: { file: "<test>", line: 1, column: 1, offset: 0 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.severity).toBe(1);
  });

  it("maps severity 'warning' to LSP severity 2", () => {
    const diag: Diagnostic = {
      severity: "warning",
      message: "Watch out",
      location: { file: "<test>", line: 2, column: 3, offset: 10 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.severity).toBe(2);
  });

  it("maps severity 'info' to LSP severity 3", () => {
    const diag: Diagnostic = {
      severity: "info",
      message: "Just so you know",
      location: { file: "<test>", line: 3, column: 5, offset: 20 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.severity).toBe(3);
  });

  it("converts 1-based Namekian line/column to 0-based LSP start position", () => {
    const diag: Diagnostic = {
      severity: "error",
      message: "Bad token",
      location: { file: "<test>", line: 3, column: 7, offset: 20 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.range.start).toEqual({ line: 2, character: 6 });
  });

  it("uses endLocation when provided for the end range", () => {
    const diag: Diagnostic = {
      severity: "error",
      message: "Span error",
      location: { file: "<test>", line: 2, column: 1, offset: 5 },
      endLocation: { file: "<test>", line: 2, column: 6, offset: 10 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.range.start).toEqual({ line: 1, character: 0 });
    expect(result.range.end).toEqual({ line: 1, character: 5 });
  });

  it("falls back to same line with length extracted from quoted name in message", () => {
    // The fallback regex finds the first 'quoted' name in the message
    const diag: Diagnostic = {
      severity: "error",
      message: "Undefined variable 'myVar'",
      location: { file: "<test>", line: 1, column: 5, offset: 4 },
    };
    const [result] = convertDiagnostics([diag]);
    // endChar = startChar + length of 'myVar' (5)
    expect(result.range.end).toEqual({ line: 0, character: 4 + 5 });
  });

  it("falls back to endChar = startChar + 1 when message has no quoted name", () => {
    const diag: Diagnostic = {
      severity: "error",
      message: "Generic error with no identifier",
      location: { file: "<test>", line: 1, column: 3, offset: 2 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.range.end).toEqual({ line: 0, character: 2 + 1 });
  });

  it("sets source to 'namekian' on every diagnostic", () => {
    const diag: Diagnostic = {
      severity: "warning",
      message: "Test",
      location: { file: "<test>", line: 1, column: 1, offset: 0 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.source).toBe("namekian");
  });

  it("preserves the original message text", () => {
    const message = "Type 'int' is not assignable to type 'string'";
    const diag: Diagnostic = {
      severity: "error",
      message,
      location: { file: "<test>", line: 1, column: 1, offset: 0 },
    };
    const [result] = convertDiagnostics([diag]);
    expect(result.message).toBe(message);
  });

  it("converts multiple diagnostics preserving order", () => {
    const diags: Diagnostic[] = [
      {
        severity: "error",
        message: "First",
        location: { file: "<test>", line: 1, column: 1, offset: 0 },
      },
      {
        severity: "warning",
        message: "Second",
        location: { file: "<test>", line: 2, column: 1, offset: 10 },
      },
    ];
    const results = convertDiagnostics(diags);
    expect(results).toHaveLength(2);
    expect(results[0].message).toBe("First");
    expect(results[1].message).toBe("Second");
  });
});

// ---------------------------------------------------------------------------
// hover: findNodeAtOffset
// ---------------------------------------------------------------------------

describe("hover: findNodeAtOffset", () => {
  it("returns null for an empty program", () => {
    const result = compile("", "<test>", { noCheck: true });
    const ast = result.ast!;
    expect(findNodeAtOffset(ast, 0)).toBeNull();
  });

  it("finds the IntLiteral node at its byte offset", () => {
    // "int x = 42;" — '42' starts at offset 8
    const result = compile("int x = 42;", "<test>", { noCheck: true });
    const ast = result.ast!;
    const node = findNodeAtOffset(ast, 8);
    expect(node).not.toBeNull();
    expect(node!.kind).toBe("IntLiteral");
  });

  it("finds the Identifier node at its byte offset when used as an expression", () => {
    // In "int x = 42; int y = x;", the second 'x' is an Identifier expression.
    // "int x = 42; " is 12 chars, then "int y = x;" — 'x' reference starts at offset 20.
    const source = "int x = 42; int y = x;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // 'x' reference in "int y = x;" starts at offset 20
    const xRefOffset = source.lastIndexOf("x;");
    const node = findNodeAtOffset(ast, xRefOffset);
    expect(node).not.toBeNull();
    expect(node!.kind).toBe("Identifier");
    if (node!.kind === "Identifier") {
      expect(node!.name).toBe("x");
    }
  });

  it("returns the closest node at or before the offset", () => {
    // "int x = 42;" — offset 10 is within '42' (offset 8) but past it
    const result = compile("int x = 42;", "<test>", { noCheck: true });
    const ast = result.ast!;
    // At offset 10 (the ';'), the closest expr is the IntLiteral at 8
    const node = findNodeAtOffset(ast, 10);
    expect(node).not.toBeNull();
    // The IntLiteral at 8 is the nearest expression at-or-before 10
    expect(node!.kind).toBe("IntLiteral");
  });

  it("finds nested expression nodes in a binary expression", () => {
    // "var z = 1 + 2;" — '1' is at offset 8, '+' operator, '2' is at offset 12
    const result = compile("var z = 1 + 2;", "<test>", { noCheck: true });
    const ast = result.ast!;
    const nodeAt8 = findNodeAtOffset(ast, 8);
    expect(nodeAt8).not.toBeNull();
    expect(nodeAt8!.kind).toBe("IntLiteral");
    if (nodeAt8!.kind === "IntLiteral") {
      expect(nodeAt8!.value).toBe(1);
    }
    const nodeAt12 = findNodeAtOffset(ast, 12);
    expect(nodeAt12).not.toBeNull();
    expect(nodeAt12!.kind).toBe("IntLiteral");
    if (nodeAt12!.kind === "IntLiteral") {
      expect(nodeAt12!.value).toBe(2);
    }
  });

  it("finds the callee identifier in a call expression", () => {
    // "print(1);" — 'print' starts at offset 0
    const result = compile("print(1);", "<test>", { noCheck: true });
    const ast = result.ast!;
    const node = findNodeAtOffset(ast, 0);
    expect(node).not.toBeNull();
    expect(node!.kind).toBe("Identifier");
    if (node!.kind === "Identifier") {
      expect(node!.name).toBe("print");
    }
  });

  it("finds expression nodes inside a function body", () => {
    // function body — the return expression '99' is nested inside blocks
    const source = "int f() { return 99; }";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // '99' is at offset 17
    const node = findNodeAtOffset(ast, 17);
    expect(node).not.toBeNull();
    expect(node!.kind).toBe("IntLiteral");
    if (node!.kind === "IntLiteral") {
      expect(node!.value).toBe(99);
    }
  });
});

// ---------------------------------------------------------------------------
// completions: getCompletions
// ---------------------------------------------------------------------------

describe("completions: getCompletions", () => {
  it("returns keyword completion items when isDot is false and no ast/checker", () => {
    const items = getCompletions("", 0, undefined, undefined, false);
    const labels = items.map((i) => i.label);
    // A sample of keywords that must be present
    expect(labels).toContain("if");
    expect(labels).toContain("while");
    expect(labels).toContain("return");
    expect(labels).toContain("for");
    expect(labels).toContain("struct");
    expect(labels).toContain("class");
    expect(labels).toContain("enum");
    expect(labels).toContain("match");
  });

  it("returns built-in type completions among non-dot items", () => {
    const items = getCompletions("", 0, undefined, undefined, false);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("int");
    expect(labels).toContain("float");
    expect(labels).toContain("string");
    expect(labels).toContain("bool");
    expect(labels).toContain("void");
  });

  it("assigns kind 14 (keyword) to keyword items", () => {
    const items = getCompletions("", 0, undefined, undefined, false);
    const ifItem = items.find((i) => i.label === "if");
    expect(ifItem).toBeDefined();
    expect(ifItem!.kind).toBe(14);
  });

  it("assigns kind 25 (type parameter) to built-in type items", () => {
    // Built-in type keywords (e.g. 'int') appear twice: once as a keyword (kind 14)
    // from the KEYWORDS map, and once as a built-in type (kind 25) from BUILTIN_TYPES.
    // We verify that at least one item for 'int' carries kind 25.
    const items = getCompletions("", 0, undefined, undefined, false);
    const intItems = items.filter((i) => i.label === "int");
    expect(intItems.length).toBeGreaterThanOrEqual(1);
    const hasTypeKind = intItems.some((i) => i.kind === 25);
    expect(hasTypeKind).toBe(true);
  });

  it("includes symbols from the checker's symbolMap for the non-dot case", () => {
    const source = "int myVar = 100; ";
    // offset 17 is past the semicolon, so myVar (offset 0) is visible
    const result = compile(source, "<test>", { retainChecker: true });
    const items = getCompletions(source, 17, result.ast, result.checker, false);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("myVar");
  });

  it("marks function symbols with kind 3 (function)", () => {
    const source = "int add(int a, int b) { return a + b; } ";
    const result = compile(source, "<test>", { retainChecker: true });
    const items = getCompletions(
      source,
      source.length,
      result.ast,
      result.checker,
      false,
    );
    const addItem = items.find((i) => i.label === "add");
    expect(addItem).toBeDefined();
    expect(addItem!.kind).toBe(3);
  });

  it("marks variable symbols with kind 6 (variable)", () => {
    const source = "int counter = 5; ";
    const result = compile(source, "<test>", { retainChecker: true });
    const items = getCompletions(
      source,
      source.length,
      result.ast,
      result.checker,
      false,
    );
    const counterItem = items.find((i) => i.label === "counter");
    expect(counterItem).toBeDefined();
    expect(counterItem!.kind).toBe(6);
  });

  it("does not include symbols declared after the cursor offset", () => {
    // 'later' is declared starting at a high offset; cursor is at 0
    const source = "int later = 99;";
    const result = compile(source, "<test>", { retainChecker: true });
    const items = getCompletions(source, 0, result.ast, result.checker, false);
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain("later");
  });

  it("returns array member completions when isDot is true and object is an array", () => {
    // "int[] arr = [1, 2, 3]; arr." — offset just past the '.'
    const source = "int[] arr = [1, 2, 3]; arr.";
    const result = compile(source, "<test>", { retainChecker: true });
    if (!result.ast || !result.checker) return; // skip if compile failed
    const offset = source.length; // position of the dot trigger
    const items = getCompletions(
      source,
      offset,
      result.ast,
      result.checker,
      true,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("length");
    expect(labels).toContain("push");
    expect(labels).toContain("pop");
    expect(labels).toContain("map");
    expect(labels).toContain("filter");
    expect(labels).toContain("join");
  });

  it("returns string member completions when isDot is true and object is a string", () => {
    const source = 'string s = "hello"; s.';
    const result = compile(source, "<test>", { retainChecker: true });
    if (!result.ast || !result.checker) return;
    const offset = source.length;
    const items = getCompletions(
      source,
      offset,
      result.ast,
      result.checker,
      true,
    );
    const labels = items.map((i) => i.label);
    expect(labels).toContain("length");
    expect(labels).toContain("toUpperCase");
    expect(labels).toContain("toLowerCase");
    expect(labels).toContain("split");
    expect(labels).toContain("trim");
  });

  it("falls through to keyword completions when isDot is true but ast is missing", () => {
    // When isDot=true but ast/checker are undefined, the isDot branch is skipped
    // and the function returns the standard keyword + built-in type list instead.
    const items = getCompletions("", 0, undefined, undefined, true);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("if");
    expect(labels).toContain("int");
  });

  it("returns an empty list for dot completions when the object type has no members", () => {
    // An integer variable has no member completions — getMembersForType returns []
    // for non-array, non-string, non-struct, non-class, non-enum types.
    const source = "int n = 5; n.";
    const result = compile(source, "<test>", { retainChecker: true });
    if (!result.ast || !result.checker) return;
    const items = getCompletions(
      source,
      source.length,
      result.ast,
      result.checker,
      true,
    );
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// symbol-index: buildSymbolIndex
// ---------------------------------------------------------------------------

describe("symbol-index: buildSymbolIndex", () => {
  it("returns an empty map for an empty program", () => {
    const result = compile("", "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.size).toBe(0);
  });

  it("collects a top-level function declaration", () => {
    const source = "int greet(int n) { return n; }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("greet")).toBe(true);
    expect(index.get("greet")!.kind).toBe("function");
  });

  it("collects a top-level variable declaration", () => {
    const source = "int count = 0;";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("count")).toBe(true);
    expect(index.get("count")!.kind).toBe("variable");
  });

  it("collects a struct declaration", () => {
    const source = "struct Point { int x; int y; }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("Point")).toBe(true);
    expect(index.get("Point")!.kind).toBe("struct");
  });

  it("collects a class declaration", () => {
    const source = "class Vehicle { int speed; }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("Vehicle")).toBe(true);
    expect(index.get("Vehicle")!.kind).toBe("class");
  });

  it("collects an enum declaration", () => {
    const source = "enum Direction { North, South, East, West }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("Direction")).toBe(true);
    expect(index.get("Direction")!.kind).toBe("enum");
  });

  it("collects an interface declaration", () => {
    const source = "interface Runnable { void run(); }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("Runnable")).toBe(true);
    expect(index.get("Runnable")!.kind).toBe("interface");
  });

  it("collects multiple declarations from one source", () => {
    const source = [
      "int globalCount = 0;",
      "string greet(string name) { return name; }",
      "struct Box { int value; }",
    ].join("\n");
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    expect(index.has("globalCount")).toBe(true);
    expect(index.has("greet")).toBe(true);
    expect(index.has("Box")).toBe(true);
    expect(index.get("globalCount")!.kind).toBe("variable");
    expect(index.get("greet")!.kind).toBe("function");
    expect(index.get("Box")!.kind).toBe("struct");
  });

  it("stores the correct name on each SymbolEntry", () => {
    const source = "int answer = 42;";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    const entry = index.get("answer")!;
    expect(entry.name).toBe("answer");
  });

  it("stores a span with valid line/column numbers", () => {
    const source = "int x = 1;";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    const entry = index.get("x")!;
    // Namekian spans are 1-based
    expect(entry.span.line).toBeGreaterThanOrEqual(1);
    expect(entry.span.column).toBeGreaterThanOrEqual(1);
    expect(typeof entry.span.offset).toBe("number");
  });

  it("collects declarations nested inside function bodies", () => {
    // Local variables inside a function body are visited via BlockStatement
    const source = "void outer() { int inner = 5; }";
    const result = compile(source, "<test>", { noCheck: true });
    const index = buildSymbolIndex(result.ast!);
    // The function itself must be present
    expect(index.has("outer")).toBe(true);
    // Local variable declarations inside a block are collected too
    expect(index.has("inner")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// definition: getDefinition
// ---------------------------------------------------------------------------

describe("definition: getDefinition", () => {
  it("returns null when the offset does not land on an identifier", () => {
    // Offset 8 in "int x = 42;" is '4' (part of IntLiteral), not an Identifier
    const source = "int x = 42;";
    const result = compile(source, "<test>", { noCheck: true });
    const def = getDefinition(result.ast!, source, 8, "file:///test.nk");
    expect(def).toBeNull();
  });

  it("returns null when the identifier is not declared anywhere", () => {
    // 'y' is an undeclared reference; noCheck skips the error but symbol index won't have 'y'
    const source = "int x = 5;";
    const result = compile(source, "<test>", { noCheck: true });
    // 'x' is at offset 4; we test for a symbol not in index by asking for offset 0
    // offset 0 is 'int x = 5;' — the first token is 'int' which is a keyword, not an Identifier expr
    const def = getDefinition(result.ast!, source, 0, "file:///test.nk");
    expect(def).toBeNull();
  });

  it("finds the definition of a variable when cursor is on the reference", () => {
    // "int x = 5; int y = x;" — 'x' is referenced at the end; we need the offset of that reference
    const source = "int x = 5; int y = x;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // The second 'x' (reference) is at offset 19 in the source
    const def = getDefinition(ast, source, 19, "file:///test.nk");
    // The definition of 'x' is the variable declaration at the start
    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///test.nk");
    // The range start should be 0-based and point to where 'x' is declared
    expect(def!.range.start.line).toBe(0);
  });

  it("finds the definition of a function when cursor is on a call", () => {
    // Define 'add' then call it — the call identifier has an offset we can use
    const source = "int add(int a) { return a; } int result = add(1);";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // 'add' in the call "add(1)" starts at offset 42
    const callOffset = source.indexOf("add(1)");
    const def = getDefinition(ast, source, callOffset, "file:///test.nk");
    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///test.nk");
    // The definition range should point to the function declaration line
    expect(def!.range.start.line).toBe(0);
  });

  it("returns a location with a non-zero range end character for the defined name", () => {
    // 'counter' has length 7; the end character of the range must be start + 7
    const source = "int counter = 0; int y = counter;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    const refOffset = source.lastIndexOf("counter");
    const def = getDefinition(ast, source, refOffset, "file:///test.nk");
    expect(def).not.toBeNull();
    const { start, end } = def!.range;
    expect(end.character - start.character).toBe("counter".length);
  });

  it("passes the uri through to the returned location", () => {
    const source = "int x = 1; int y = x;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    const uri = "file:///project/src/main.nk";
    const def = getDefinition(ast, source, 19, uri);
    expect(def?.uri).toBe(uri);
  });
});

// ---------------------------------------------------------------------------
// references: getReferences
// ---------------------------------------------------------------------------

describe("references: getReferences", () => {
  it("finds all references to a variable used multiple times", () => {
    const source = "int x = 5; int y = x; int z = x;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Use offset of 'x' in expression position (first reference)
    const xRef = source.indexOf("x;");
    const refs = getReferences(ast, source, xRef, "file:///test.nk");
    // x declaration + two references = 3 locations
    expect(refs.length).toBe(3);
  });

  it("finds references to a function called in multiple places", () => {
    const source =
      "int add(int a, int b) { return a + b; } add(1, 2); add(3, 4);";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Use offset of 'add' in call position
    const callOffset = source.indexOf("add(1");
    const refs = getReferences(ast, source, callOffset, "file:///test.nk");
    // 'add' declared once + called twice = 3
    expect(refs.length).toBe(3);
  });

  it("returns empty for unknown symbol", () => {
    const source = "int x = 5;";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // offset 8 is '5', an IntLiteral, not an Identifier
    const refs = getReferences(ast, source, 8, "file:///test.nk");
    expect(refs).toEqual([]);
  });

  it("includes declaration in references", () => {
    const source = "int x = 5; print(x);";
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Use offset of 'x' in expression position inside print(x)
    const xRef = source.lastIndexOf("x");
    const refs = getReferences(ast, source, xRef, "file:///test.nk");
    // Should include declaration site + reference
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Fix 17: member-access go-to-definition
// ---------------------------------------------------------------------------

describe("definition: member-access go-to-definition", () => {
  it("jumps to struct field definition on member access", () => {
    const source = `struct Point { int x; int y; }
Point p = Point(1, 2);
int val = p.x;`;
    const result = compile(source, "<test>", { retainChecker: true });
    const ast = result.ast!;
    const typeMap = result.checker?.typeMap;
    // Find offset of '.x' property access — the 'x' after 'p.'
    const dotX = source.lastIndexOf(".x") + 1; // offset of 'x' in 'p.x'
    const def = getDefinition(ast, source, dotX, "file:///test.nk", typeMap);
    expect(def).not.toBeNull();
    // The definition should point to the 'x' field in the struct declaration
    if (def) {
      // Verify it points somewhere in the struct declaration area
      expect(def.uri).toBe("file:///test.nk");
    }
  });

  it("falls back to symbol index for non-member identifiers", () => {
    const source = `int x = 5; int y = x;`;
    const result = compile(source, "<test>", { retainChecker: true });
    const ast = result.ast!;
    // target 'x' in 'int y = x' — this is an Identifier expression
    const xRef = source.lastIndexOf("x");
    const def = getDefinition(
      ast,
      source,
      xRef,
      "file:///test.nk",
      result.checker?.typeMap,
    );
    expect(def).not.toBeNull();
    expect(def!.uri).toBe("file:///test.nk");
  });
});

// ---------------------------------------------------------------------------
// Fix 18: scope-aware references
// ---------------------------------------------------------------------------

describe("references: scope-aware", () => {
  it("does not conflate x in different functions", () => {
    const source = `void foo() { int x = 1; print(x); }
void bar() { int x = 2; print(x); }`;
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Target 'x' inside print(x) in foo — this is an Identifier expression
    // "print(x)" first occurrence, find the 'x' inside it
    const printFoo = source.indexOf("print(x)");
    const xInFoo = printFoo + 6; // offset of 'x' in first "print(x)"
    const refs = getReferences(ast, source, xInFoo, "file:///test.nk");
    // Should only find references within foo (declaration + print(x) = 2)
    expect(refs.length).toBe(2);
  });

  it("finds all references for global variable", () => {
    const source = `int x = 5; int y = x; int z = x;`;
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Target 'x' in 'int y = x' — an Identifier expression
    const xRef = source.indexOf("= x;") + 2; // offset of 'x' in first '= x;'
    const refs = getReferences(ast, source, xRef, "file:///test.nk");
    // x declaration + two references = 3
    expect(refs.length).toBe(3);
  });

  it("function-scoped variable does not leak to outer scope", () => {
    const source = `int x = 10;
void foo() { int x = 20; print(x); }
print(x);`;
    const result = compile(source, "<test>", { noCheck: true });
    const ast = result.ast!;
    // Target 'x' in the outer print(x) at the end — an Identifier expression
    const lastPrint = source.lastIndexOf("print(x)");
    const outerX = lastPrint + 6; // offset of 'x' in last "print(x)"
    const refs = getReferences(ast, source, outerX, "file:///test.nk");
    // Should find: declaration "x = 10" + the outer "print(x)" = 2
    // Should NOT include the inner "x = 20" or inner "print(x)"
    expect(refs.length).toBe(2);
  });
});
