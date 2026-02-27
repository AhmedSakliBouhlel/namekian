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
});
