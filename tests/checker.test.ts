import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { TypeChecker } from "../src/checker/checker.js";

function check(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const checker = new TypeChecker();
  checker.check(ast);
  return checker.diagnostics;
}

function expectNoErrors(source: string) {
  const diags = check(source);
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors).toEqual([]);
}

function expectError(source: string, fragment: string) {
  const diags = check(source);
  const errors = diags.filter((d) => d.severity === "error");
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.some((e) => e.message.includes(fragment))).toBe(true);
}

describe("TypeChecker", () => {
  it("accepts valid variable declarations", () => {
    expectNoErrors("int x = 5;");
    expectNoErrors("float pi = 3.14;");
    expectNoErrors('string name = "hello";');
    expectNoErrors("bool active = true;");
  });

  it("rejects type mismatches in variable declarations", () => {
    expectError('int x = "hello";', "not assignable");
    expectError("string s = 42;", "not assignable");
    expectError("bool b = 5;", "not assignable");
  });

  it("allows int -> float widening", () => {
    expectNoErrors("float x = 5;");
  });

  it("accepts var inference", () => {
    expectNoErrors("var x = 5;");
    expectNoErrors('var s = "hello";');
    expectNoErrors("var b = true;");
  });

  it("accepts valid function declarations", () => {
    expectNoErrors("int add(int a, int b) { return a + b; }");
    expectNoErrors("void greet() { print(42); }");
  });

  it("detects wrong return type", () => {
    expectError('int bad() { return "hello"; }', "not assignable");
  });

  it("detects undefined variables", () => {
    expectError("var x = y;", "Undefined variable 'y'");
  });

  it("accepts arithmetic operations on numeric types", () => {
    expectNoErrors("var x = 1 + 2;");
    expectNoErrors("var x = 1.0 * 2.0;");
    expectNoErrors("var x = 1 + 2.0;");
  });

  it("detects invalid arithmetic operands", () => {
    expectError('var x = true + "hello";', "cannot be applied");
  });

  it("accepts comparison operators", () => {
    expectNoErrors("var x = 1 < 2;");
    expectNoErrors("var x = 1 == 2;");
  });

  it("checks function call arity", () => {
    expectError(
      "int add(int a, int b) { return a + b; } add(1);",
      "Expected 2 arguments, got 1",
    );
  });

  it("allows print with any number of args", () => {
    expectNoErrors("print(1);");
    expectNoErrors('print(1, "hello", true);');
  });

  it("accepts struct declarations", () => {
    expectNoErrors("struct Point { int x; int y; }");
  });

  it("accepts class declarations", () => {
    expectNoErrors("class Dog : Animal { string name; }");
  });

  it("accepts enum declarations", () => {
    expectNoErrors("enum Color { Red, Green, Blue }");
  });

  it("accepts interface declarations", () => {
    expectNoErrors("interface Printable { string toString(); }");
  });

  it("accepts try/catch", () => {
    expectNoErrors("try { print(1); } catch (e) { print(e); }");
  });

  it("accepts Ok/Err expressions", () => {
    expectNoErrors("var x = Ok(5);");
    expectNoErrors('var x = Err("fail");');
  });

  it("accepts match statements", () => {
    expectNoErrors(`
      var result = Ok(5);
      match (result) {
        Ok(val) => { print(val); }
        Err(e) => { print(e); }
      }
    `);
  });

  it("accepts nullable types", () => {
    expectNoErrors("string? name = null;");
    expectNoErrors('string? name = "hello";');
  });

  it("rejects null for non-nullable types", () => {
    expectError("int x = null;", "not assignable");
  });

  it("accepts if/else, while, for", () => {
    expectNoErrors("if (true) { print(1); } else { print(2); }");
    expectNoErrors("while (true) { print(1); break; }");
    expectNoErrors("for (int i = 0; i < 10; i = i + 1) { print(i); }");
  });

  it("accepts take and load statements", () => {
    expectNoErrors('take { User } from "./models";');
    expectNoErrors('load "express";');
  });

  it("detects this used outside class", () => {
    expectError("var x = this;", "'this' used outside");
  });

  it("accepts this inside class method", () => {
    expectNoErrors(`
      class Dog : Animal {
        string name;
        string getName() {
          return this.name;
        }
      }
    `);
  });

  it("accepts arrow functions", () => {
    expectNoErrors("var add = (int a, int b) => a + b;");
  });

  it("accepts array literals", () => {
    expectNoErrors("var arr = [1, 2, 3];");
  });

  it("accepts array built-in methods", () => {
    expectNoErrors(`
      int[] nums = [1, 2, 3];
      var len = nums.length;
      nums.push(4);
      var has = nums.includes(2);
    `);
  });

  it("accepts generic function declaration", () => {
    expectNoErrors("T identity<T>(T value) { return value; }");
  });

  it("accepts generic struct declaration", () => {
    expectNoErrors("struct Box<T> { T value; }");
  });

  it("accepts object destructuring", () => {
    expectNoErrors(`
      struct Point { int x; int y; }
      var point = new Point(1, 2);
      var { x, y } = point;
    `);
  });

  it("accepts array destructuring", () => {
    expectNoErrors("var [a, b] = [1, 2];");
  });

  it("accepts string built-in methods", () => {
    expectNoErrors(`
      string s = "hello";
      var len = s.length;
      var upper = s.toUpperCase();
      var parts = s.split(",");
      var has = s.includes("ell");
    `);
  });

  // --- Pipe operator ---

  it("type-checks pipe operator", () => {
    expectNoErrors(`
      int double(int x) { return x * 2; }
      var result = 5 |> double;
    `);
  });

  // --- Range expressions ---

  it("type-checks range expression as int array", () => {
    expectNoErrors("var r = 0..10;");
  });

  it("type-checks inclusive range expression", () => {
    expectNoErrors("var r = 0..=5;");
  });

  // --- Tuple ---

  it("type-checks tuple literal", () => {
    expectNoErrors('var t = (1, "hello");');
  });

  it("type-checks tuple type annotation", () => {
    expectNoErrors('(int, string) t = (1, "hi");');
  });

  // --- Enum with associated data ---

  it("type-checks enum with associated data", () => {
    expectNoErrors(`
      enum Shape {
        Circle(float radius),
        Point
      }
      var c = Shape.Circle(3.14);
      var p = Shape.Point;
    `);
  });

  // --- const immutability ---

  it("rejects assignment to const variable", () => {
    expectError("const x = 5; x = 10;", "Cannot assign to");
  });

  it("rejects compound assignment to const variable", () => {
    expectError("const x = 5; x += 1;", "Cannot assign to");
  });

  it("rejects increment on const variable", () => {
    expectError("const x = 5; x++;", "Cannot assign to");
  });

  // --- Null coalescing type checking ---

  it("null coalescing on nullable unwraps to inner type", () => {
    expectNoErrors(`
      string? name = null;
      var result = name ?? "default";
    `);
  });

  it("null coalescing on non-nullable warns", () => {
    const diags = check(
      'string name = "hello"; var result = name ?? "default";',
    );
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.message.includes("not nullable"))).toBe(true);
  });

  // --- Array comprehension ---

  it("array comprehension returns correct element type", () => {
    expectNoErrors(`
      int[] nums = [1, 2, 3];
      var doubled = [x * 2 for (x in nums)];
    `);
  });

  // --- Match exhaustiveness ---

  it("warns on match missing enum variant", () => {
    const diags = check(`
      enum Color { Red, Green, Blue }
      var c = Color.Red;
      match (c) {
        Color.Red => { print("red"); }
        Color.Green => { print("green"); }
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.message.includes("missing variant"))).toBe(
      true,
    );
  });

  it("no warning when all enum variants are covered", () => {
    const diags = check(`
      enum Color { Red, Green, Blue }
      var c = Color.Red;
      match (c) {
        Color.Red => { print("red"); }
        Color.Green => { print("green"); }
        Color.Blue => { print("blue"); }
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings).toEqual([]);
  });

  it("no warning when match has wildcard pattern", () => {
    const diags = check(`
      enum Color { Red, Green, Blue }
      var c = Color.Red;
      match (c) {
        Color.Red => { print("red"); }
        _ => { print("other"); }
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings).toEqual([]);
  });

  it("warns on match on Result missing Err", () => {
    const diags = check(`
      var result = Ok(5);
      match (result) {
        Ok(val) => { print(val); }
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.message.includes("missing pattern"))).toBe(
      true,
    );
  });

  // --- Generic type inference ---

  it("infers return type from generic function call", () => {
    expectNoErrors(`
      T identity<T>(T v) { return v; }
      var x = identity(5);
    `);
  });

  // --- fs and stream stdlib ---

  it("accepts fs module without undefined variable error", () => {
    expectNoErrors('var content = fs.read("data.txt");');
  });

  it("accepts stream module without undefined variable error", () => {
    expectNoErrors('var reader = stream.reader("file.txt");');
  });

  // --- Feature 1: Type narrowing ---

  it("narrows nullable type after != null check", () => {
    expectNoErrors(`
      string? name = null;
      if (name != null) {
        var len = name.length;
      }
    `);
  });

  it("narrows nullable with reversed null != x", () => {
    expectNoErrors(`
      string? name = "hello";
      if (null != name) {
        var len = name.length;
      }
    `);
  });

  it("narrows nullable in alternate block for == null", () => {
    expectNoErrors(`
      string? name = "hello";
      if (name == null) {
        print("is null");
      } else {
        var len = name.length;
      }
    `);
  });

  it("does not narrow non-nullable types", () => {
    expectNoErrors(`
      string name = "hello";
      if (name != null) {
        var len = name.length;
      }
    `);
  });

  // --- Feature 2: Interface enforcement ---

  it("accepts class that implements interface correctly", () => {
    expectNoErrors(`
      interface Printable {
        string toString();
      }
      class Foo : Printable {
        string toString() {
          return "foo";
        }
      }
    `);
  });

  it("rejects class missing interface method", () => {
    expectError(
      `
      interface Printable {
        string toString();
      }
      class Foo : Printable {
      }
      `,
      "does not implement method 'toString' from interface 'Printable'",
    );
  });

  it("rejects class missing interface field", () => {
    expectError(
      `
      interface HasName {
        string name;
      }
      class Foo : HasName {
      }
      `,
      "does not implement field 'name' from interface 'HasName'",
    );
  });

  it("checks multiple interfaces", () => {
    expectError(
      `
      interface A {
        void doA();
      }
      interface B {
        void doB();
      }
      class Foo : A, B {
        void doA() { print("a"); }
      }
      `,
      "does not implement method 'doB' from interface 'B'",
    );
  });

  // --- Feature 3: Linter rules ---

  it("warns on unreachable code after return", () => {
    const diags = check(`
      int foo() {
        return 1;
        print("unreachable");
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.some((w) => w.message.includes("Unreachable code"))).toBe(
      true,
    );
  });

  it("warns on unused variable in function", () => {
    const diags = check(`
      void foo() {
        var x = 5;
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(
      warnings.some((w) =>
        w.message.includes("'x' is declared but never used"),
      ),
    ).toBe(true);
  });

  it("does not warn on used variable", () => {
    const diags = check(`
      void foo() {
        var x = 5;
        print(x);
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.some((w) => w.message.includes("never used"))).toBe(false);
  });

  it("does not warn on _ prefixed variables", () => {
    const diags = check(`
      void foo() {
        var _unused = 5;
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.some((w) => w.message.includes("_unused"))).toBe(false);
  });

  it("warns on variable shadowing", () => {
    const diags = check(`
      var x = 10;
      void foo() {
        var x = 5;
        print(x);
      }
    `);
    const warnings = diags.filter((d) => d.severity === "warning");
    expect(warnings.some((w) => w.message.includes("shadows"))).toBe(true);
  });

  // --- Feature 4: Array method type improvements ---

  it("infers .map() return type from callback", () => {
    expectNoErrors(`
      int[] nums = [1, 2, 3];
      var doubled = nums.map((int x) => x * 2);
    `);
  });

  it(".filter() preserves element type", () => {
    expectNoErrors(`
      int[] nums = [1, 2, 3];
      var filtered = nums.filter((int x) => x > 0);
    `);
  });

  it(".find() returns nullable element type", () => {
    expectNoErrors(`
      int[] nums = [1, 2, 3];
      var found = nums.find((int x) => x > 2);
    `);
  });

  // --- Feature 5: Better error messages (already tested via suggestName) ---

  it("suggests similar name on typo", () => {
    const diags = check('prnt("hello");');
    const errors = diags.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].hint).toContain("print");
  });

  // --- Feature 6: Tuple destructuring ---

  it("type-checks tuple destructuring", () => {
    expectNoErrors(`
      var t = (1, "hello");
      var (a, b) = t;
    `);
  });

  it("rejects tuple destructure count mismatch", () => {
    expectError(
      `
      var t = (1, "hello", true);
      var (a, b) = t;
      `,
      "expects 3 elements, got 2",
    );
  });

  // --- Feature 9: assert stdlib ---

  it("accepts assert calls", () => {
    expectNoErrors("assert(true);");
    expectNoErrors('assert(1 == 1, "should be equal");');
  });

  // --- Declare module ---

  it("declared module gives load proper types", () => {
    expectNoErrors(`
      declare module "m" {
        int foo();
      }
      load "m"
      var x = m.foo();
    `);
  });

  it("declared module member access returns correct type", () => {
    // m.foo() returns int, assigning to int should work
    expectNoErrors(`
      declare module "m" {
        int foo();
        string bar;
      }
      load "m"
      int x = m.foo();
      string y = m.bar;
    `);
  });

  it("take from declared module resolves types", () => {
    expectNoErrors(`
      declare module "m" {
        int add(int a, int b);
      }
      take { add } from "m"
    `);
  });

  it("take from declared module errors on missing member", () => {
    expectError(
      `
      declare module "m" {
        int foo();
      }
      take { bar } from "m"
      `,
      "has no exported member 'bar'",
    );
  });

  it("module without declaration falls through to any", () => {
    // No declare for "unknown-pkg", should not error
    expectNoErrors(`
      load "unknown-pkg"
    `);
  });

  it("declared function params are type-checked", () => {
    expectNoErrors(`
      declare module "m" {
        void greet(string name);
      }
      load "m"
      m.greet("hello");
    `);
  });
});
