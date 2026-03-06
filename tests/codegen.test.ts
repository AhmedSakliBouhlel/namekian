import { describe, it, expect } from "vitest";
import { compile } from "../src/compiler.js";

function gen(source: string): string {
  const result = compile(source, "<stdin>", { noCheck: true });
  expect(result.success).toBe(true);
  return result.js!;
}

describe("CodeGenerator", () => {
  it("generates variable declarations", () => {
    const js = gen("int x = 5;");
    expect(js).toContain("let x = 5;");
  });

  it("generates function declarations", () => {
    const js = gen("int add(int a, int b) { return a + b; }");
    expect(js).toContain("function add(a, b)");
    expect(js).toContain("return (a + b)");
  });

  it("maps print to console.log", () => {
    const js = gen('print("hello");');
    expect(js).toContain('console.log("hello")');
  });

  it("generates if/else", () => {
    const js = gen("if (x > 0) { print(x); } else { print(0); }");
    expect(js).toContain("if ((x > 0))");
    expect(js).toContain("} else {");
  });

  it("generates while loop", () => {
    const js = gen("while (x > 0) { x = x - 1; }");
    expect(js).toContain("while ((x > 0))");
  });

  it("generates for loop", () => {
    const js = gen("for (int i = 0; i < 10; i = i + 1) { print(i); }");
    expect(js).toContain("for (let i = 0; (i < 10); i = (i + 1))");
  });

  it("generates struct as class", () => {
    const js = gen("struct Point { int x; int y; }");
    expect(js).toContain("class Point");
    expect(js).toContain("constructor(x, y)");
    expect(js).toContain("this.x = x");
  });

  it("generates class with extends", () => {
    const js = gen("class Dog : Animal { string name; }");
    expect(js).toContain("class Dog extends Animal");
  });

  it("generates enum as frozen object", () => {
    const js = gen("enum Color { Red, Green, Blue }");
    expect(js).toContain("Object.freeze");
    expect(js).toContain("Red: 0");
    expect(js).toContain("Green: 1");
    expect(js).toContain("Blue: 2");
  });

  it("generates take as import", () => {
    const js = gen('take { User } from "./models";');
    expect(js).toContain('import { User } from "./models.js"');
  });

  it("generates load as default import", () => {
    const js = gen('load "express";');
    expect(js).toContain('import express from "express"');
  });

  it("generates try/catch", () => {
    const js = gen("try { risky(); } catch (e) { print(e); }");
    expect(js).toContain("try {");
    expect(js).toContain("} catch (e) {");
  });

  it("generates Ok/Err with runtime", () => {
    const js = gen("var x = Ok(42);");
    expect(js).toContain("__nk_Ok");
    expect(js).toContain("function __nk_Ok");
  });

  it("generates match statement", () => {
    const js = gen(`
      var result = Ok(5);
      match (result) {
        Ok(val) => { print(val); }
        Err(e) => { print(e); }
      }
    `);
    expect(js).toContain('__tag === "Ok"');
    expect(js).toContain('__tag === "Err"');
  });

  it("generates new expression", () => {
    const js = gen("var p = new Point(1, 2);");
    expect(js).toContain("new Point(1, 2)");
  });

  it("generates arrow function", () => {
    const js = gen("var add = (int a, int b) => a + b;");
    expect(js).toContain("(a, b) => (a + b)");
  });

  it("generates array literal", () => {
    const js = gen("var arr = [1, 2, 3];");
    expect(js).toContain("[1, 2, 3]");
  });

  it("erases type aliases", () => {
    const js = gen("type ID = int;");
    expect(js.trim()).toBe("");
  });

  it("erases interfaces", () => {
    const js = gen("interface Printable { string toString(); }");
    expect(js.trim()).toBe("");
  });

  it("generates break and continue", () => {
    const js = gen("while (true) { break; }");
    expect(js).toContain("break;");
  });

  it("compiles the hello.nk example", () => {
    const source = `
      int add(int a, int b) {
        return a + b;
      }
      var result = add(3, 4);
      print(result);
      print("Hello, Namekian!");
    `;
    const result = compile(source);
    expect(result.success).toBe(true);
    expect(result.js).toContain("function add(a, b)");
    expect(result.js).toContain("console.log");
  });

  it("maps math to Math", () => {
    const js = gen("var x = math.sqrt(16);");
    expect(js).toContain("Math.sqrt(16)");
  });

  it("handles member expressions", () => {
    const js = gen("var x = obj.field;");
    expect(js).toContain("obj.field");
  });

  it("generates function with default parameter", () => {
    const js = gen("int add(int a, int b = 0) { return a + b; }");
    expect(js).toContain("function add(a, b = 0)");
  });

  it("generates compound assignment", () => {
    const js = gen("x += 5;");
    expect(js).toContain("x += 5");
  });

  it("generates postfix increment", () => {
    const js = gen("i++;");
    expect(js).toContain("i++");
  });

  it("generates ternary expression", () => {
    const js = gen("var x = a > 0 ? 1 : 0;");
    expect(js).toContain("(a > 0) ? 1 : 0)");
  });

  it("generates for..in as for..of", () => {
    const js = gen("for (item in items) { print(item); }");
    expect(js).toContain("for (const item of items)");
  });

  it("generates string interpolation as template literal", () => {
    const js = gen('var msg = "hello ${name}!";');
    expect(js).toContain("`hello ${name}!`");
  });

  it("generates string interpolation with multiple expressions", () => {
    const js = gen('var msg = "${a} and ${b}";');
    expect(js).toContain("`${a} and ${b}`");
  });

  it("generates spread in array literal", () => {
    const js = gen("var arr = [1, ...rest];");
    expect(js).toContain("[1, ...rest]");
  });

  it("generates spread in function call", () => {
    const js = gen("print(...args);");
    expect(js).toContain("console.log(...args)");
  });

  it("generates generic function (type params erased)", () => {
    const js = gen("T identity<T>(T value) { return value; }");
    expect(js).toContain("function identity(value)");
  });

  it("generates object destructuring", () => {
    const js = gen("var { x, y } = point;");
    expect(js).toContain("const { x, y } = point;");
  });

  it("generates array destructuring", () => {
    const js = gen("var [a, b] = arr;");
    expect(js).toContain("const [a, b] = arr;");
  });

  it("handles optional chaining", () => {
    const js = gen("var x = obj?.field;");
    expect(js).toContain("obj?.field");
  });

  // --- Pipe operator ---

  it("generates pipe operator as function call", () => {
    const js = gen("var x = 5 |> double;");
    expect(js).toContain("double(5)");
  });

  it("generates chained pipe operators", () => {
    const js = gen("var x = 1 |> f |> g;");
    expect(js).toContain("g(f(1))");
  });

  // --- Range expressions ---

  it("generates exclusive range", () => {
    const js = gen("var r = 0..10;");
    expect(js).toContain("__nk_range(0, 10, false)");
    expect(js).toContain("function __nk_range");
  });

  it("generates inclusive range", () => {
    const js = gen("var r = 0..=5;");
    expect(js).toContain("__nk_range(0, 5, true)");
  });

  it("generates range in for-in loop", () => {
    const js = gen("for (i in 0..5) { print(i); }");
    expect(js).toContain("__nk_range(0, 5, false)");
    expect(js).toContain("for (const i of");
  });

  // --- Tuple ---

  it("generates tuple literal as array", () => {
    const js = gen('var t = (1, "hello");');
    expect(js).toContain('[1, "hello"]');
  });

  it("generates 3-element tuple", () => {
    const js = gen("var t = (1, 2, 3);");
    expect(js).toContain("[1, 2, 3]");
  });

  // --- Enum with associated data ---

  it("generates ADT enum with factory functions", () => {
    const js = gen(`
      enum Shape {
        Circle(float radius),
        Rect(float width, float height),
        Point
      }
    `);
    expect(js).toContain("Circle:");
    expect(js).toContain('__tag: "Circle"');
    expect(js).toContain("(radius) =>");
    expect(js).toContain("(width, height) =>");
    expect(js).toContain('Point: Object.freeze({ __tag: "Point" })');
  });

  it("generates simple enum unchanged", () => {
    const js = gen("enum Color { Red, Green, Blue }");
    expect(js).toContain("Red: 0");
    expect(js).toContain("Green: 1");
    expect(js).toContain("Blue: 2");
  });

  it("generates match with EnumVariantPattern", () => {
    const js = gen(`
      match (shape) {
        Shape.Circle(r) => { print(r); }
        Shape.Point => { print("point"); }
        _ => { print("other"); }
      }
    `);
    expect(js).toContain('__tag === "Circle"');
    expect(js).toContain("const r =");
    expect(js).toContain('__tag === "Point"');
  });

  // --- const vs var ---

  it("generates const declaration", () => {
    const js = gen("const x = 5;");
    expect(js).toContain("const x = 5;");
  });

  it("generates var declaration as let", () => {
    const js = gen("var x = 5;");
    expect(js).toContain("let x = 5;");
  });

  // --- Null coalescing ---

  it("generates null coalescing operator", () => {
    const js = gen("var x = a ?? b;");
    expect(js).toContain("(a ?? b)");
  });

  // --- Array comprehension ---

  it("generates array comprehension as .map()", () => {
    const js = gen("var r = [x * 2 for (x in nums)];");
    expect(js).toContain(".map(");
    expect(js).toContain("(x) =>");
  });

  it("generates array comprehension with condition as .filter().map()", () => {
    const js = gen("var r = [x for (x in nums) if (x > 0)];");
    expect(js).toContain(".filter(");
    expect(js).toContain(".map(");
  });

  // --- Triple-quote string ---

  it("generates triple-quote multi-line string as correct string literal", () => {
    const source = 'var s = """\n    hello\n    world\n    """;';
    const js = gen(source);
    expect(js).toContain("hello\\nworld");
  });

  // --- fs module ---

  it("generates fs.read as await __nk_fs.read with preamble", () => {
    const js = gen('var content = fs.read("data.txt");');
    expect(js).toContain('await __nk_fs.read("data.txt")');
    expect(js).toContain("__nk_fs");
  });

  it("generates fs.write as await __nk_fs.write", () => {
    const js = gen('fs.write("out.txt", "hello");');
    expect(js).toContain('await __nk_fs.write("out.txt", "hello")');
  });

  it("marks function calling fs as async", () => {
    const js = gen(`
      void loadFile() {
        var content = fs.read("data.txt");
        print(content);
      }
    `);
    expect(js).toContain("async function loadFile");
  });

  // --- stream module ---

  it("generates stream.reader as __nk_stream.reader (no await)", () => {
    const js = gen('var reader = stream.reader("file.txt");');
    expect(js).toContain('__nk_stream.reader("file.txt")');
    expect(js).not.toContain("await __nk_stream.reader");
  });

  it("generates stream.pipe as __nk_stream.pipe (no await)", () => {
    const js = gen('stream.pipe("a.txt", "b.txt");');
    expect(js).toContain('__nk_stream.pipe("a.txt", "b.txt")');
    expect(js).not.toContain("await __nk_stream.pipe");
  });

  it("does not mark function calling stream as async", () => {
    const js = gen(`
      void copyFile() {
        stream.pipe("a.txt", "b.txt");
      }
    `);
    expect(js).not.toContain("async function copyFile");
    expect(js).toContain("function copyFile");
  });

  it("emits fs preamble only when fs is used", () => {
    const withFs = gen('var x = fs.read("f");');
    const without = gen("var x = 5;");
    expect(withFs).toContain("__nk_fs");
    expect(without).not.toContain("__nk_fs");
  });

  it("emits stream preamble only when stream is used", () => {
    const withStream = gen('var r = stream.reader("f");');
    const without = gen("var x = 5;");
    expect(withStream).toContain("__nk_stream");
    expect(without).not.toContain("__nk_stream");
  });

  // --- Assert ---

  it("generates assert as __nk_assert", () => {
    const js = gen("assert(true);");
    expect(js).toContain("__nk_assert(true)");
    expect(js).toContain("function __nk_assert");
  });

  it("generates assert with message", () => {
    const js = gen('assert(false, "should fail");');
    expect(js).toContain('__nk_assert(false, "should fail")');
  });

  // --- Tuple destructuring ---

  it("generates tuple destructuring as array destructuring", () => {
    const js = gen('var (a, b) = (1, "hello");');
    expect(js).toContain('const [a, b] = [1, "hello"];');
  });
});
