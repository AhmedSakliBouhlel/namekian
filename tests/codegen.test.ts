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

  // --- Declare module ---

  it("declare module produces no JS output", () => {
    const js = gen(`
      declare module "express" {
        void get(string path, any handler);
        void listen(int port);
      }
    `);
    expect(js).not.toContain("declare");
    expect(js).not.toContain("express");
    expect(js).not.toContain("module");
    expect(js.trim()).toBe("");
  });

  it("load still compiles to import with declare module present", () => {
    const js = gen(`
      declare module "express" {
        void get(string path);
      }
      load "express"
    `);
    expect(js).toContain('import express from "express"');
    expect(js).not.toContain("declare");
  });

  // --- Type guard codegen ---

  it("generates typeof check for x is string", () => {
    const js = gen("var b = x is string;");
    expect(js).toContain('typeof x === "string"');
  });

  it("generates typeof check for x is int", () => {
    const js = gen("var b = x is int;");
    expect(js).toContain('typeof x === "number"');
  });

  it("generates typeof check for x is bool", () => {
    const js = gen("var b = x is bool;");
    expect(js).toContain('typeof x === "boolean"');
  });

  it("generates instanceof for x is MyStruct", () => {
    const js = gen("var b = x is MyStruct;");
    expect(js).toContain("x instanceof MyStruct");
  });

  // --- Await codegen ---

  it("generates await expression", () => {
    const js = gen("var x = await foo();");
    expect(js).toContain("await foo()");
  });

  it("await in function makes it async", () => {
    const js = gen(`
      void loadData() {
        var x = await fetch();
      }
    `);
    expect(js).toContain("async function loadData");
  });

  // --- Result unwrap ? codegen ---

  it("generates __nk_unwrap for ? operator", () => {
    const js = gen("var x = getValue()?;");
    expect(js).toContain("__nk_unwrap(getValue())");
    expect(js).toContain("function __nk_unwrap");
  });

  it("function with ? gets try/catch wrapper", () => {
    const js = gen(`
      int process() {
        var x = getValue()?;
        return x;
      }
    `);
    expect(js).toContain("try {");
    expect(js).toContain("__NkResultError");
  });

  // --- Union type in function param (erased in codegen) ---

  it("generates generic function with constraint (erased)", () => {
    const js = gen("T sort<T : Comparable>(T value) { return value; }");
    expect(js).toContain("function sort(value)");
  });

  // --- Guard clauses in match ---

  it("generates match arm with guard clause", () => {
    const js = gen(`
      var r = Ok(42);
      match (r) {
        Ok(v) if v > 0 => { print(v); }
        _ => { print("other"); }
      }
    `);
    expect(js).toContain("> 0");
    expect(js).toContain("console.log");
  });

  // --- Nested patterns ---

  it("generates nested Ok pattern check", () => {
    const js = gen(`
      var r = Ok(Ok(1));
      match (r) {
        Ok(Ok(x)) => { print(x); }
        _ => { print("no"); }
      }
    `);
    expect(js).toContain("__tag");
  });

  // --- Binding pattern ---

  it("generates binding pattern with @", () => {
    const js = gen(`
      var r = Ok(42);
      match (r) {
        val @ Ok(x) => { print(val); }
        _ => {}
      }
    `);
    expect(js).toContain("val");
  });

  // --- Defer ---

  it("generates defer as try/finally", () => {
    const js = gen(`
      defer {
        print("cleanup");
      }
      print("work");
    `);
    expect(js).toContain("finally");
    expect(js).toContain("cleanup");
  });

  // --- Extension methods ---

  it("generates extension methods as standalone functions", () => {
    const js = gen(`
      extend string {
        int wordCount() {
          return 1;
        }
      }
    `);
    expect(js).toContain("__ext_string_wordCount");
  });

  // --- Named arguments ---

  it("generates named arguments stripping names", () => {
    const js = gen("var r = foo(a: 1, b: 2);");
    expect(js).toContain("foo(1, 2)");
  });

  // --- Spawn ---

  it("generates spawn as async IIFE", () => {
    const js = gen("var t = spawn compute();");
    expect(js).toContain("async");
    expect(js).toContain("compute()");
  });

  // --- await all / await race ---

  it("generates await all as Promise.all", () => {
    const js = gen("var r = await all [a(), b()];");
    expect(js).toContain("Promise.all");
  });

  it("generates await race as Promise.race", () => {
    const js = gen("var r = await race [a(), b()];");
    expect(js).toContain("Promise.race");
  });

  // --- Chan ---

  it("generates chan as __nk_chan", () => {
    const js = gen("var ch = chan<int>(10);");
    expect(js).toContain("__nk_chan(10)");
    expect(js).toContain("__NkChannel");
  });

  // --- Get/Set accessors ---

  it("generates getter accessor in struct", () => {
    const js = gen(`
      struct Circle {
        float radius;
        get float area() {
          return 3.14;
        }
      }
    `);
    expect(js).toContain("get area()");
  });

  it("generates setter accessor in struct", () => {
    const js = gen(`
      struct Circle {
        float _radius;
        set radius(float r) {
          this._radius = r;
        }
      }
    `);
    expect(js).toContain("set radius(r)");
  });

  // --- Stdlib runtimes ---

  it("regex module emits runtime", () => {
    const js = gen('var r = regex.test("[0-9]+", "123");');
    expect(js).toContain("__nk_regex");
  });

  it("time module emits runtime", () => {
    const js = gen("var now = time.now();");
    expect(js).toContain("__nk_time");
  });

  it("env module emits runtime", () => {
    const js = gen('var home = env.get("HOME");');
    expect(js).toContain("__nk_env");
  });

  it("path module emits runtime", () => {
    const js = gen('var p = path.join("a", "b");');
    expect(js).toContain("__nk_path");
  });

  it("crypto module emits runtime", () => {
    const js = gen("var id = crypto.uuid();");
    expect(js).toContain("__nk_crypto");
  });

  // --- Inferred return type ---

  it("generates function with inferred return type", () => {
    const js = gen("add(int a, int b) { return a + b; }");
    expect(js).toContain("function add(a, b)");
  });

  // --- Doc comments are erased in codegen ---

  it("doc comments do not appear in JS output", () => {
    const js = gen(`
      /// Adds two numbers
      int add(int a, int b) {
        return a + b;
      }
    `);
    expect(js).not.toContain("///");
    expect(js).toContain("function add(a, b)");
  });

  // --- Fix 1: defer LIFO ordering ---
  it("defer statements execute in LIFO order", () => {
    const js = gen(`
      void test() {
        defer { print("first"); }
        defer { print("second"); }
        defer { print("third"); }
        print("body");
      }
    `);
    // Defers should be wrapped in nested try/finally in reverse order
    // The last defer should be in the innermost finally
    expect(js).toContain("try");
    expect(js).toContain("finally");
    // "third" should be in an inner finally, "first" in the outermost
    const thirdIdx = js.indexOf('"third"');
    const firstIdx = js.indexOf('"first"');
    // first defer's finally wraps everything, so appears later in the output
    expect(firstIdx).toBeGreaterThan(thirdIdx);
  });

  // --- Fix 2: match expression block-body returns value ---
  it("match expression with block body returns a value", () => {
    const js = gen(`
var r = Ok(5);
var result = match (r) {
  Ok(v) => {
    int y = v;
    y + 1;
  }
  Err(e) => 0
};
`);
    // The block arm should have a return for the last expression
    expect(js).toContain("return");
  });

  // --- Fix 3: detectFeatures false positives ---
  it("string literal 'http' does not inject HTTP runtime", () => {
    const js = gen(`
      string url = "http://example.com";
      print(url);
    `);
    expect(js).not.toContain("__nk_http");
  });

  // --- Fix 4: class extends interface emits no extends ---
  it("class implementing interface does not emit extends", () => {
    const js = gen(`
      interface Printable {
        string toString();
      }
      class Foo : Printable {
        string toString() { return "foo"; }
      }
    `);
    expect(js).not.toContain("extends Printable");
    expect(js).toContain("class Foo");
  });

  // --- Feature 9: throw statement ---
  it("generates throw statement", () => {
    const js = gen(`throw "error";`);
    expect(js).toContain('throw "error"');
  });

  // --- Feature 10: import aliasing ---
  it("generates import with aliasing", () => {
    const js = gen(`take { User as U, Post } from "./models";`);
    expect(js).toContain("User as U");
    expect(js).toContain("Post");
  });

  // --- Feature 11: try/catch/finally ---
  it("generates try/catch/finally", () => {
    const js = gen(`
      try {
        print("try");
      } catch (e) {
        print("catch");
      } finally {
        print("finally");
      }
    `);
    expect(js).toContain("try");
    expect(js).toContain("catch");
    expect(js).toContain("finally");
  });

  it("generates try/finally without catch", () => {
    const js = gen(`
      try {
        print("try");
      } finally {
        print("finally");
      }
    `);
    expect(js).toContain("try");
    expect(js).toContain("finally");
    expect(js).not.toContain("catch");
  });

  // --- Feature 12: do..while loop ---
  it("generates do..while loop", () => {
    const js = gen(`
      int x = 0;
      do {
        x = x + 1;
      } while (x < 10);
    `);
    expect(js).toContain("do {");
    expect(js).toContain("} while");
  });

  // --- Feature 13: variadic parameters ---
  it("generates rest parameters", () => {
    const js = gen(`
      void log(...string items) {
        print(items);
      }
    `);
    expect(js).toContain("...items");
  });

  // --- Feature 16: operator overload on struct variables ---
  it("generates operator overload on struct variables", () => {
    const js = gen(`
struct Vec2 {
  float x;
  float y;
  operator +(Vec2 other) {
    return new Vec2(x + other.x, y + other.y);
  }
}
Vec2 v1 = new Vec2(1.0, 2.0);
Vec2 v2 = new Vec2(3.0, 4.0);
var v3 = v1 + v2;
`);
    expect(js).toContain("__op_plus");
  });
});
