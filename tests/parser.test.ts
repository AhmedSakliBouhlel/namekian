import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { Program } from "../src/parser/ast.js";

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function parseFirst(source: string) {
  return parse(source).body[0];
}

describe("Parser", () => {
  it("parses a variable declaration with type", () => {
    const stmt = parseFirst("int x = 5;");
    expect(stmt.kind).toBe("VariableDeclaration");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.name).toBe("x");
      expect(stmt.type).toMatchObject({ kind: "NamedType", name: "int" });
      expect(stmt.initializer).toMatchObject({ kind: "IntLiteral", value: 5 });
    }
  });

  it("parses a var declaration (type inference)", () => {
    const stmt = parseFirst('var name = "hello";');
    expect(stmt.kind).toBe("VariableDeclaration");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.name).toBe("name");
      expect(stmt.type).toBeUndefined();
      expect(stmt.initializer).toMatchObject({
        kind: "StringLiteral",
        value: "hello",
      });
    }
  });

  it("parses a function declaration", () => {
    const stmt = parseFirst("int add(int a, int b) { return a + b; }");
    expect(stmt.kind).toBe("FunctionDeclaration");
    if (stmt.kind === "FunctionDeclaration") {
      expect(stmt.name).toBe("add");
      expect(stmt.params.length).toBe(2);
      expect(stmt.params[0].name).toBe("a");
      expect(stmt.params[0].type).toMatchObject({
        kind: "NamedType",
        name: "int",
      });
      expect(stmt.returnType).toMatchObject({ kind: "NamedType", name: "int" });
      expect(stmt.body.body.length).toBe(1);
    }
  });

  it("parses binary expressions with precedence", () => {
    const stmt = parseFirst("var x = 1 + 2 * 3;");
    if (stmt.kind === "VariableDeclaration") {
      const expr = stmt.initializer;
      expect(expr.kind).toBe("BinaryExpr");
      if (expr.kind === "BinaryExpr") {
        expect(expr.operator).toBe("+");
        expect(expr.left).toMatchObject({ kind: "IntLiteral", value: 1 });
        expect(expr.right).toMatchObject({
          kind: "BinaryExpr",
          operator: "*",
        });
      }
    }
  });

  it("parses unary expressions", () => {
    const stmt = parseFirst("var x = !true;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer).toMatchObject({
        kind: "UnaryExpr",
        operator: "!",
      });
    }
  });

  it("parses if/else statements", () => {
    const stmt = parseFirst("if (x > 0) { return 1; } else { return 0; }");
    expect(stmt.kind).toBe("IfStatement");
    if (stmt.kind === "IfStatement") {
      expect(stmt.consequent.body.length).toBe(1);
      expect(stmt.alternate?.kind).toBe("BlockStatement");
    }
  });

  it("parses while loop", () => {
    const stmt = parseFirst("while (x > 0) { x = x - 1; }");
    expect(stmt.kind).toBe("WhileStatement");
  });

  it("parses for loop", () => {
    const stmt = parseFirst("for (int i = 0; i < 10; i = i + 1) { print(i); }");
    expect(stmt.kind).toBe("ForStatement");
    if (stmt.kind === "ForStatement") {
      expect(stmt.init?.kind).toBe("VariableDeclaration");
    }
  });

  it("parses function call expressions", () => {
    const stmt = parseFirst("print(42);");
    expect(stmt.kind).toBe("ExpressionStatement");
    if (stmt.kind === "ExpressionStatement") {
      expect(stmt.expression).toMatchObject({ kind: "CallExpr" });
      if (stmt.expression.kind === "CallExpr") {
        expect(stmt.expression.callee).toMatchObject({
          kind: "Identifier",
          name: "print",
        });
        expect(stmt.expression.args.length).toBe(1);
      }
    }
  });

  it("parses member expressions", () => {
    const stmt = parseFirst("var x = obj.field;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer).toMatchObject({
        kind: "MemberExpr",
        property: "field",
        optional: false,
      });
    }
  });

  it("parses optional chaining", () => {
    const stmt = parseFirst("var x = obj?.field;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer).toMatchObject({
        kind: "MemberExpr",
        property: "field",
        optional: true,
      });
    }
  });

  it("parses array literal", () => {
    const stmt = parseFirst("var arr = [1, 2, 3];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("ArrayLiteral");
      if (stmt.initializer.kind === "ArrayLiteral") {
        expect(stmt.initializer.elements.length).toBe(3);
      }
    }
  });

  it("parses index expression", () => {
    const stmt = parseFirst("var x = arr[0];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("IndexExpr");
    }
  });

  it("parses struct declaration", () => {
    const stmt = parseFirst("struct Point { int x; int y; }");
    expect(stmt.kind).toBe("StructDeclaration");
    if (stmt.kind === "StructDeclaration") {
      expect(stmt.name).toBe("Point");
      expect(stmt.fields.length).toBe(2);
      expect(stmt.fields[0].name).toBe("x");
    }
  });

  it("parses class declaration with inheritance", () => {
    const stmt = parseFirst(
      "class Dog : Animal { string name; void bark() { print(name); } }",
    );
    expect(stmt.kind).toBe("ClassDeclaration");
    if (stmt.kind === "ClassDeclaration") {
      expect(stmt.name).toBe("Dog");
      expect(stmt.superClass).toBe("Animal");
      expect(stmt.fields.length).toBe(1);
      expect(stmt.methods.length).toBe(1);
    }
  });

  it("parses interface declaration", () => {
    const stmt = parseFirst("interface Printable { string toString(); }");
    expect(stmt.kind).toBe("InterfaceDeclaration");
    if (stmt.kind === "InterfaceDeclaration") {
      expect(stmt.name).toBe("Printable");
      expect(stmt.methods.length).toBe(1);
    }
  });

  it("parses enum declaration", () => {
    const stmt = parseFirst("enum Color { Red, Green, Blue }");
    expect(stmt.kind).toBe("EnumDeclaration");
    if (stmt.kind === "EnumDeclaration") {
      expect(stmt.name).toBe("Color");
      expect(stmt.variants.length).toBe(3);
    }
  });

  it("parses take statement", () => {
    const stmt = parseFirst('take { User, Post } from "./models";');
    expect(stmt.kind).toBe("TakeStatement");
    if (stmt.kind === "TakeStatement") {
      expect(stmt.names).toEqual(["User", "Post"]);
      expect(stmt.path).toBe("./models");
    }
  });

  it("parses load statement", () => {
    const stmt = parseFirst('load "express";');
    expect(stmt.kind).toBe("LoadStatement");
    if (stmt.kind === "LoadStatement") {
      expect(stmt.path).toBe("express");
    }
  });

  it("parses try/catch statement", () => {
    const stmt = parseFirst("try { risky(); } catch (e) { print(e); }");
    expect(stmt.kind).toBe("TryCatchStatement");
    if (stmt.kind === "TryCatchStatement") {
      expect(stmt.catchBinding).toBe("e");
    }
  });

  it("parses Ok/Err expressions", () => {
    const stmt = parseFirst("var x = Ok(42);");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("OkExpr");
    }
  });

  it("parses match statement", () => {
    const prog = parse(`
      match (result) {
        Ok(val) => { print(val); }
        Err(e) => { print(e); }
        _ => { print("unknown"); }
      }
    `);
    expect(prog.body[0].kind).toBe("MatchStatement");
    if (prog.body[0].kind === "MatchStatement") {
      expect(prog.body[0].arms.length).toBe(3);
    }
  });

  it("parses new expression", () => {
    const stmt = parseFirst("var dog = new Dog();");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("NewExpr");
    }
  });

  it("parses arrow function", () => {
    const stmt = parseFirst("var add = (int a, int b) => a + b;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("ArrowFunction");
      if (stmt.initializer.kind === "ArrowFunction") {
        expect(stmt.initializer.params.length).toBe(2);
      }
    }
  });

  it("parses nullable type annotation", () => {
    const stmt = parseFirst("string? name = null;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.type).toMatchObject({ kind: "NullableType" });
    }
  });

  it("parses array type annotation", () => {
    const stmt = parseFirst("int[] nums = [1, 2];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.type).toMatchObject({ kind: "ArrayType" });
    }
  });

  it("parses generic type Result<T, E>", () => {
    const stmt = parseFirst("Result<int, string> res = Ok(5);");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.type).toMatchObject({
        kind: "GenericType",
        name: "Result",
      });
    }
  });

  it("parses assignment expression", () => {
    const stmt = parseFirst("x = 10;");
    expect(stmt.kind).toBe("ExpressionStatement");
    if (stmt.kind === "ExpressionStatement") {
      expect(stmt.expression.kind).toBe("AssignExpr");
    }
  });

  it("parses chained method calls", () => {
    const stmt = parseFirst("obj.method().field;");
    expect(stmt.kind).toBe("ExpressionStatement");
  });

  it("parses type alias", () => {
    const stmt = parseFirst("type ID = int;");
    expect(stmt.kind).toBe("TypeAlias");
    if (stmt.kind === "TypeAlias") {
      expect(stmt.name).toBe("ID");
      expect(stmt.type).toMatchObject({ kind: "NamedType", name: "int" });
    }
  });

  it("parses function with default parameter", () => {
    const stmt = parseFirst("int add(int a, int b = 0) { return a + b; }");
    expect(stmt.kind).toBe("FunctionDeclaration");
    if (stmt.kind === "FunctionDeclaration") {
      expect(stmt.params[1].name).toBe("b");
      expect(stmt.params[1].defaultValue).toMatchObject({
        kind: "IntLiteral",
        value: 0,
      });
    }
  });

  it("parses compound assignment", () => {
    const stmt = parseFirst("x += 5;");
    expect(stmt.kind).toBe("ExpressionStatement");
    if (stmt.kind === "ExpressionStatement") {
      expect(stmt.expression.kind).toBe("CompoundAssignExpr");
      if (stmt.expression.kind === "CompoundAssignExpr") {
        expect(stmt.expression.operator).toBe("+=");
        expect(stmt.expression.target).toMatchObject({
          kind: "Identifier",
          name: "x",
        });
        expect(stmt.expression.value).toMatchObject({
          kind: "IntLiteral",
          value: 5,
        });
      }
    }
  });

  it("parses postfix increment", () => {
    const stmt = parseFirst("i++;");
    expect(stmt.kind).toBe("ExpressionStatement");
    if (stmt.kind === "ExpressionStatement") {
      expect(stmt.expression.kind).toBe("UpdateExpr");
      if (stmt.expression.kind === "UpdateExpr") {
        expect(stmt.expression.operator).toBe("++");
        expect(stmt.expression.prefix).toBe(false);
      }
    }
  });

  it("parses ternary expression", () => {
    const stmt = parseFirst("var x = a > 0 ? 1 : 0;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("TernaryExpr");
      if (stmt.initializer.kind === "TernaryExpr") {
        expect(stmt.initializer.condition).toMatchObject({
          kind: "BinaryExpr",
          operator: ">",
        });
        expect(stmt.initializer.consequent).toMatchObject({
          kind: "IntLiteral",
          value: 1,
        });
        expect(stmt.initializer.alternate).toMatchObject({
          kind: "IntLiteral",
          value: 0,
        });
      }
    }
  });

  it("parses for..in loop", () => {
    const stmt = parseFirst("for (item in items) { print(item); }");
    expect(stmt.kind).toBe("ForInStatement");
    if (stmt.kind === "ForInStatement") {
      expect(stmt.variable).toBe("item");
      expect(stmt.iterable).toMatchObject({
        kind: "Identifier",
        name: "items",
      });
      expect(stmt.body.body.length).toBe(1);
    }
  });

  it("parses string interpolation", () => {
    const stmt = parseFirst('var msg = "hello ${name}!";');
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("StringInterpolation");
      if (stmt.initializer.kind === "StringInterpolation") {
        expect(stmt.initializer.parts.length).toBe(3);
        expect(stmt.initializer.parts[0]).toBe("hello ");
        expect(stmt.initializer.parts[1]).toMatchObject({
          kind: "Identifier",
          name: "name",
        });
        expect(stmt.initializer.parts[2]).toBe("!");
      }
    }
  });

  it("parses string interpolation with multiple expressions", () => {
    const stmt = parseFirst('var msg = "${a} and ${b}";');
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("StringInterpolation");
      if (stmt.initializer.kind === "StringInterpolation") {
        expect(stmt.initializer.parts.length).toBe(3);
        expect(stmt.initializer.parts[0]).toMatchObject({
          kind: "Identifier",
          name: "a",
        });
        expect(stmt.initializer.parts[1]).toBe(" and ");
        expect(stmt.initializer.parts[2]).toMatchObject({
          kind: "Identifier",
          name: "b",
        });
      }
    }
  });

  it("parses generic function declaration", () => {
    const stmt = parseFirst("T identity<T>(T value) { return value; }");
    expect(stmt.kind).toBe("FunctionDeclaration");
    if (stmt.kind === "FunctionDeclaration") {
      expect(stmt.name).toBe("identity");
      expect(stmt.typeParams).toEqual(["T"]);
      expect(stmt.params[0].name).toBe("value");
    }
  });

  it("parses generic struct declaration", () => {
    const stmt = parseFirst("struct Box<T> { T value; }");
    expect(stmt.kind).toBe("StructDeclaration");
    if (stmt.kind === "StructDeclaration") {
      expect(stmt.name).toBe("Box");
      expect(stmt.typeParams).toEqual(["T"]);
      expect(stmt.fields[0].name).toBe("value");
    }
  });

  it("parses spread in array literal", () => {
    const stmt = parseFirst("var arr = [1, ...rest];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("ArrayLiteral");
      if (stmt.initializer.kind === "ArrayLiteral") {
        expect(stmt.initializer.elements[1].kind).toBe("SpreadExpr");
      }
    }
  });

  it("parses spread in function call", () => {
    const stmt = parseFirst("print(...args);");
    if (
      stmt.kind === "ExpressionStatement" &&
      stmt.expression.kind === "CallExpr"
    ) {
      expect(stmt.expression.args[0].kind).toBe("SpreadExpr");
    }
  });

  it("parses object destructuring", () => {
    const stmt = parseFirst("var { x, y } = point;");
    expect(stmt.kind).toBe("DestructureDeclaration");
    if (stmt.kind === "DestructureDeclaration") {
      expect(stmt.pattern).toBe("object");
      expect(stmt.names).toEqual(["x", "y"]);
      expect(stmt.initializer).toMatchObject({
        kind: "Identifier",
        name: "point",
      });
    }
  });

  it("parses array destructuring", () => {
    const stmt = parseFirst("var [a, b] = arr;");
    expect(stmt.kind).toBe("DestructureDeclaration");
    if (stmt.kind === "DestructureDeclaration") {
      expect(stmt.pattern).toBe("array");
      expect(stmt.names).toEqual(["a", "b"]);
      expect(stmt.initializer).toMatchObject({
        kind: "Identifier",
        name: "arr",
      });
    }
  });

  it("parses a complete program", () => {
    const prog = parse(`
      int add(int a, int b) {
        return a + b;
      }

      var result = add(3, 4);
      print(result);
    `);
    expect(prog.body.length).toBe(3);
    expect(prog.body[0].kind).toBe("FunctionDeclaration");
    expect(prog.body[1].kind).toBe("VariableDeclaration");
    expect(prog.body[2].kind).toBe("ExpressionStatement");
  });

  // --- Pipe operator ---

  it("parses pipe operator", () => {
    const stmt = parseFirst("var x = 5 |> double;");
    expect(stmt.kind).toBe("VariableDeclaration");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("PipeExpr");
      if (stmt.initializer.kind === "PipeExpr") {
        expect(stmt.initializer.left).toMatchObject({
          kind: "IntLiteral",
          value: 5,
        });
        expect(stmt.initializer.right).toMatchObject({
          kind: "Identifier",
          name: "double",
        });
      }
    }
  });

  it("parses chained pipe operators (left-associative)", () => {
    const stmt = parseFirst("var x = 1 |> f |> g;");
    if (stmt.kind === "VariableDeclaration") {
      const expr = stmt.initializer;
      expect(expr.kind).toBe("PipeExpr");
      if (expr.kind === "PipeExpr") {
        expect(expr.left.kind).toBe("PipeExpr");
        expect(expr.right).toMatchObject({ kind: "Identifier", name: "g" });
      }
    }
  });

  // --- Range expressions ---

  it("parses exclusive range expression", () => {
    const stmt = parseFirst("var r = 0..10;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("RangeExpr");
      if (stmt.initializer.kind === "RangeExpr") {
        expect(stmt.initializer.inclusive).toBe(false);
        expect(stmt.initializer.start).toMatchObject({
          kind: "IntLiteral",
          value: 0,
        });
        expect(stmt.initializer.end).toMatchObject({
          kind: "IntLiteral",
          value: 10,
        });
      }
    }
  });

  it("parses inclusive range expression", () => {
    const stmt = parseFirst("var r = 0..=10;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("RangeExpr");
      if (stmt.initializer.kind === "RangeExpr") {
        expect(stmt.initializer.inclusive).toBe(true);
      }
    }
  });

  // --- Tuple ---

  it("parses tuple literal", () => {
    const stmt = parseFirst('var t = (1, "hello");');
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("TupleLiteral");
      if (stmt.initializer.kind === "TupleLiteral") {
        expect(stmt.initializer.elements.length).toBe(2);
        expect(stmt.initializer.elements[0].kind).toBe("IntLiteral");
        expect(stmt.initializer.elements[1].kind).toBe("StringLiteral");
      }
    }
  });

  it("parses grouped expression (not tuple)", () => {
    const stmt = parseFirst("var x = (1 + 2);");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("BinaryExpr");
    }
  });

  it("parses tuple type annotation", () => {
    const stmt = parseFirst('(int, string) t = (1, "hi");');
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.type).toBeDefined();
      if (stmt.type) {
        expect(stmt.type.kind).toBe("TupleType");
        if (stmt.type.kind === "TupleType") {
          expect(stmt.type.elements.length).toBe(2);
        }
      }
    }
  });

  // --- Enum with associated data ---

  it("parses enum with associated data fields", () => {
    const stmt = parseFirst(`
      enum Shape {
        Circle(float radius),
        Rect(float width, float height),
        Point
      }
    `);
    expect(stmt.kind).toBe("EnumDeclaration");
    if (stmt.kind === "EnumDeclaration") {
      expect(stmt.variants.length).toBe(3);
      expect(stmt.variants[0].fields).toBeDefined();
      expect(stmt.variants[0].fields!.length).toBe(1);
      expect(stmt.variants[0].fields![0].name).toBe("radius");
      expect(stmt.variants[1].fields!.length).toBe(2);
      expect(stmt.variants[2].fields).toBeUndefined();
    }
  });

  it("parses EnumVariantPattern in match", () => {
    const stmt = parseFirst(`
      match (shape) {
        Shape.Circle(r) => { print(r); }
        Shape.Point => { print("point"); }
        _ => { print("other"); }
      }
    `);
    expect(stmt.kind).toBe("MatchStatement");
    if (stmt.kind === "MatchStatement") {
      expect(stmt.arms[0].pattern.kind).toBe("EnumVariantPattern");
      if (stmt.arms[0].pattern.kind === "EnumVariantPattern") {
        expect(stmt.arms[0].pattern.enumName).toBe("Shape");
        expect(stmt.arms[0].pattern.variant).toBe("Circle");
        expect(stmt.arms[0].pattern.bindings).toEqual(["r"]);
      }
      expect(stmt.arms[1].pattern.kind).toBe("EnumVariantPattern");
      if (stmt.arms[1].pattern.kind === "EnumVariantPattern") {
        expect(stmt.arms[1].pattern.bindings).toEqual([]);
      }
    }
  });

  // --- const vs var ---

  it("parses const declaration with mutable: false", () => {
    const stmt = parseFirst("const x = 5;");
    expect(stmt.kind).toBe("VariableDeclaration");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.name).toBe("x");
      expect(stmt.mutable).toBe(false);
      expect(stmt.initializer).toMatchObject({ kind: "IntLiteral", value: 5 });
    }
  });

  it("parses var declaration with mutable: true", () => {
    const stmt = parseFirst("var x = 5;");
    expect(stmt.kind).toBe("VariableDeclaration");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.name).toBe("x");
      expect(stmt.mutable).toBe(true);
      expect(stmt.initializer).toMatchObject({ kind: "IntLiteral", value: 5 });
    }
  });

  // --- Null coalescing ---

  it("parses a ?? b as NullCoalesceExpr", () => {
    const stmt = parseFirst("var x = a ?? b;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("NullCoalesceExpr");
      if (stmt.initializer.kind === "NullCoalesceExpr") {
        expect(stmt.initializer.left).toMatchObject({
          kind: "Identifier",
          name: "a",
        });
        expect(stmt.initializer.right).toMatchObject({
          kind: "Identifier",
          name: "b",
        });
      }
    }
  });

  it("parses a ?? b ?? c as left-associative", () => {
    const stmt = parseFirst("var x = a ?? b ?? c;");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("NullCoalesceExpr");
      if (stmt.initializer.kind === "NullCoalesceExpr") {
        // (a ?? b) ?? c — left side is another NullCoalesceExpr
        expect(stmt.initializer.left.kind).toBe("NullCoalesceExpr");
        expect(stmt.initializer.right).toMatchObject({
          kind: "Identifier",
          name: "c",
        });
      }
    }
  });

  // --- Array comprehension ---

  it("parses array comprehension [x * 2 for (x in nums)]", () => {
    const stmt = parseFirst("var r = [x * 2 for (x in nums)];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("ArrayComprehension");
      if (stmt.initializer.kind === "ArrayComprehension") {
        expect(stmt.initializer.variable).toBe("x");
        expect(stmt.initializer.iterable).toMatchObject({
          kind: "Identifier",
          name: "nums",
        });
        expect(stmt.initializer.body).toMatchObject({
          kind: "BinaryExpr",
          operator: "*",
        });
        expect(stmt.initializer.condition).toBeUndefined();
      }
    }
  });

  it("parses array comprehension with condition", () => {
    const stmt = parseFirst("var r = [x for (x in nums) if (x > 0)];");
    if (stmt.kind === "VariableDeclaration") {
      expect(stmt.initializer.kind).toBe("ArrayComprehension");
      if (stmt.initializer.kind === "ArrayComprehension") {
        expect(stmt.initializer.variable).toBe("x");
        expect(stmt.initializer.iterable).toMatchObject({
          kind: "Identifier",
          name: "nums",
        });
        expect(stmt.initializer.condition).toBeDefined();
        expect(stmt.initializer.condition).toMatchObject({
          kind: "BinaryExpr",
          operator: ">",
        });
      }
    }
  });

  // --- Tuple destructuring ---

  it("parses tuple destructuring", () => {
    const stmt = parseFirst("var (a, b) = t;");
    expect(stmt.kind).toBe("DestructureDeclaration");
    if (stmt.kind === "DestructureDeclaration") {
      expect(stmt.pattern).toBe("tuple");
      expect(stmt.names).toEqual(["a", "b"]);
      expect(stmt.initializer).toMatchObject({
        kind: "Identifier",
        name: "t",
      });
    }
  });

  it("parses tuple destructuring with 3 elements", () => {
    const stmt = parseFirst("var (x, y, z) = triple;");
    expect(stmt.kind).toBe("DestructureDeclaration");
    if (stmt.kind === "DestructureDeclaration") {
      expect(stmt.pattern).toBe("tuple");
      expect(stmt.names).toEqual(["x", "y", "z"]);
    }
  });

  // --- Declare module ---

  it("parses declare module with a single function", () => {
    const stmt = parseFirst('declare module "pkg" { int foo(); }');
    expect(stmt.kind).toBe("DeclareModuleStatement");
    if (stmt.kind === "DeclareModuleStatement") {
      expect(stmt.moduleName).toBe("pkg");
      expect(stmt.declarations.length).toBe(1);
      expect(stmt.declarations[0].kind).toBe("DeclareFunctionSignature");
      if (stmt.declarations[0].kind === "DeclareFunctionSignature") {
        expect(stmt.declarations[0].name).toBe("foo");
      }
    }
  });

  it("parses declare module with multiple functions and variables", () => {
    const stmt = parseFirst(`
      declare module "express" {
        void get(string path, any handler);
        void listen(int port);
        int timeout;
      }
    `);
    expect(stmt.kind).toBe("DeclareModuleStatement");
    if (stmt.kind === "DeclareModuleStatement") {
      expect(stmt.moduleName).toBe("express");
      expect(stmt.declarations.length).toBe(3);
      expect(stmt.declarations[0].kind).toBe("DeclareFunctionSignature");
      expect(stmt.declarations[1].kind).toBe("DeclareFunctionSignature");
      expect(stmt.declarations[2].kind).toBe("DeclareVariableStatement");
      if (stmt.declarations[2].kind === "DeclareVariableStatement") {
        expect(stmt.declarations[2].name).toBe("timeout");
      }
    }
  });

  it("parses declare module with typed params", () => {
    const stmt = parseFirst(`
      declare module "m" {
        any[] map(any[] arr, any fn);
      }
    `);
    expect(stmt.kind).toBe("DeclareModuleStatement");
    if (stmt.kind === "DeclareModuleStatement") {
      const fn = stmt.declarations[0];
      expect(fn.kind).toBe("DeclareFunctionSignature");
      if (fn.kind === "DeclareFunctionSignature") {
        expect(fn.name).toBe("map");
        expect(fn.params.length).toBe(2);
        expect(fn.params[0].name).toBe("arr");
        expect(fn.params[1].name).toBe("fn");
      }
    }
  });
});
