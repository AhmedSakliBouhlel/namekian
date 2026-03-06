import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { TokenType } from "../src/lexer/token.js";

function tokenTypes(source: string): TokenType[] {
  const lexer = new Lexer(source);
  return lexer.tokenize().map((t) => t.type);
}

function tokenValues(source: string): string[] {
  const lexer = new Lexer(source);
  return lexer.tokenize().map((t) => t.value);
}

describe("Lexer", () => {
  it("tokenizes an empty string", () => {
    expect(tokenTypes("")).toEqual([TokenType.EOF]);
  });

  it("tokenizes integer literals", () => {
    expect(tokenTypes("42")).toEqual([TokenType.IntLiteral, TokenType.EOF]);
    expect(tokenValues("42")[0]).toBe("42");
  });

  it("tokenizes float literals", () => {
    expect(tokenTypes("3.14")).toEqual([TokenType.FloatLiteral, TokenType.EOF]);
    expect(tokenValues("3.14")[0]).toBe("3.14");
  });

  it("tokenizes string literals", () => {
    const tokens = new Lexer('"hello world"').tokenize();
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe("hello world");
  });

  it("handles string escape sequences", () => {
    const tokens = new Lexer('"line1\\nline2\\t"').tokenize();
    expect(tokens[0].value).toBe("line1\nline2\t");
  });

  it("tokenizes keywords", () => {
    const types = tokenTypes("int float string bool void var");
    expect(types).toEqual([
      TokenType.Int,
      TokenType.Float,
      TokenType.String,
      TokenType.Bool,
      TokenType.Void,
      TokenType.Var,
      TokenType.EOF,
    ]);
  });

  it("tokenizes struct/class/interface/enum", () => {
    const types = tokenTypes("struct class interface enum");
    expect(types).toEqual([
      TokenType.Struct,
      TokenType.Class,
      TokenType.Interface,
      TokenType.Enum,
      TokenType.EOF,
    ]);
  });

  it("tokenizes control flow keywords", () => {
    const types = tokenTypes("if else for while return match break continue");
    expect(types).toEqual([
      TokenType.If,
      TokenType.Else,
      TokenType.For,
      TokenType.While,
      TokenType.Return,
      TokenType.Match,
      TokenType.Break,
      TokenType.Continue,
      TokenType.EOF,
    ]);
  });

  it("tokenizes try/catch/Ok/Err/Result", () => {
    const types = tokenTypes("try catch Ok Err Result");
    expect(types).toEqual([
      TokenType.Try,
      TokenType.Catch,
      TokenType.Ok,
      TokenType.Err,
      TokenType.Result,
      TokenType.EOF,
    ]);
  });

  it("tokenizes module keywords", () => {
    const types = tokenTypes("take from load");
    expect(types).toEqual([
      TokenType.Take,
      TokenType.From,
      TokenType.Load,
      TokenType.EOF,
    ]);
  });

  it("tokenizes boolean and null literals", () => {
    const types = tokenTypes("true false null");
    expect(types).toEqual([
      TokenType.BoolLiteral,
      TokenType.BoolLiteral,
      TokenType.NullLiteral,
      TokenType.EOF,
    ]);
  });

  it("tokenizes identifiers", () => {
    const types = tokenTypes("foo bar_baz _private myVar123");
    expect(types).toEqual([
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("tokenizes operators", () => {
    const types = tokenTypes("+ - * / % = == != < <= > >= && || ! =>");
    expect(types).toEqual([
      TokenType.Plus,
      TokenType.Minus,
      TokenType.Star,
      TokenType.Slash,
      TokenType.Percent,
      TokenType.Assign,
      TokenType.Equal,
      TokenType.NotEqual,
      TokenType.Less,
      TokenType.LessEqual,
      TokenType.Greater,
      TokenType.GreaterEqual,
      TokenType.And,
      TokenType.Or,
      TokenType.Not,
      TokenType.Arrow,
      TokenType.EOF,
    ]);
  });

  it("tokenizes compound assignment operators", () => {
    const types = tokenTypes("+= -= *= /= %=");
    expect(types).toEqual([
      TokenType.PlusAssign,
      TokenType.MinusAssign,
      TokenType.StarAssign,
      TokenType.SlashAssign,
      TokenType.PercentAssign,
      TokenType.EOF,
    ]);
  });

  it("tokenizes increment and decrement", () => {
    const types = tokenTypes("++ --");
    expect(types).toEqual([
      TokenType.PlusPlus,
      TokenType.MinusMinus,
      TokenType.EOF,
    ]);
  });

  it("tokenizes delimiters", () => {
    const types = tokenTypes("( ) { } [ ] , : ;");
    expect(types).toEqual([
      TokenType.LeftParen,
      TokenType.RightParen,
      TokenType.LeftBrace,
      TokenType.RightBrace,
      TokenType.LeftBracket,
      TokenType.RightBracket,
      TokenType.Comma,
      TokenType.Colon,
      TokenType.Semicolon,
      TokenType.EOF,
    ]);
  });

  it("tokenizes dot and question operators", () => {
    const types = tokenTypes(". ?. ?");
    expect(types).toEqual([
      TokenType.Dot,
      TokenType.QuestionDot,
      TokenType.Question,
      TokenType.EOF,
    ]);
  });

  it("skips line comments", () => {
    const types = tokenTypes("42 // this is a comment\n43");
    expect(types).toEqual([
      TokenType.IntLiteral,
      TokenType.IntLiteral,
      TokenType.EOF,
    ]);
  });

  it("skips block comments", () => {
    const types = tokenTypes("42 /* block\ncomment */ 43");
    expect(types).toEqual([
      TokenType.IntLiteral,
      TokenType.IntLiteral,
      TokenType.EOF,
    ]);
  });

  it("tracks line and column numbers", () => {
    const tokens = new Lexer("int x = 5;\nfloat y = 3.14;").tokenize();
    expect(tokens[0]).toMatchObject({ line: 1, column: 1 }); // int
    expect(tokens[1]).toMatchObject({ line: 1, column: 5 }); // x
    expect(tokens[4]).toMatchObject({ line: 1, column: 10 }); // ;
    expect(tokens[5]).toMatchObject({ line: 2, column: 1 }); // float
  });

  it("tokenizes a variable declaration", () => {
    const types = tokenTypes("int x = 5;");
    expect(types).toEqual([
      TokenType.Int,
      TokenType.Identifier,
      TokenType.Assign,
      TokenType.IntLiteral,
      TokenType.Semicolon,
      TokenType.EOF,
    ]);
  });

  it("tokenizes a function declaration", () => {
    const types = tokenTypes("int add(int a, int b) { return a + b; }");
    expect(types).toEqual([
      TokenType.Int,
      TokenType.Identifier,
      TokenType.LeftParen,
      TokenType.Int,
      TokenType.Identifier,
      TokenType.Comma,
      TokenType.Int,
      TokenType.Identifier,
      TokenType.RightParen,
      TokenType.LeftBrace,
      TokenType.Return,
      TokenType.Identifier,
      TokenType.Plus,
      TokenType.Identifier,
      TokenType.Semicolon,
      TokenType.RightBrace,
      TokenType.EOF,
    ]);
  });

  it("tokenizes a take/from import", () => {
    const types = tokenTypes('take { User } from "./models"');
    expect(types).toEqual([
      TokenType.Take,
      TokenType.LeftBrace,
      TokenType.Identifier,
      TokenType.RightBrace,
      TokenType.From,
      TokenType.StringLiteral,
      TokenType.EOF,
    ]);
  });

  it("reports error on unexpected character", () => {
    const lexer = new Lexer("~");
    lexer.tokenize();
    expect(lexer.diagnostics.length).toBe(1);
    expect(lexer.diagnostics[0].severity).toBe("error");
  });

  it("reports error on unterminated string", () => {
    const lexer = new Lexer('"hello');
    lexer.tokenize();
    expect(lexer.diagnostics.length).toBe(1);
    expect(lexer.diagnostics[0].message).toContain("Unterminated");
  });

  it("tokenizes string interpolation", () => {
    const types = tokenTypes('"hello ${name}!"');
    expect(types).toEqual([
      TokenType.StringInterpStart,
      TokenType.Identifier,
      TokenType.StringInterpEnd,
      TokenType.EOF,
    ]);
  });

  it("tokenizes string interpolation with multiple expressions", () => {
    const types = tokenTypes('"${a} and ${b}"');
    expect(types).toEqual([
      TokenType.StringInterpStart,
      TokenType.Identifier,
      TokenType.StringInterpMiddle,
      TokenType.Identifier,
      TokenType.StringInterpEnd,
      TokenType.EOF,
    ]);
  });

  it("tokenizes string interpolation values correctly", () => {
    const lexer = new Lexer('"hello ${name}!"');
    const tokens = lexer.tokenize();
    expect(tokens[0].value).toBe("hello ");
    expect(tokens[1].value).toBe("name");
    expect(tokens[2].value).toBe("!");
  });

  it("tokenizes in keyword", () => {
    const types = tokenTypes("for item in list");
    expect(types).toEqual([
      TokenType.For,
      TokenType.Identifier,
      TokenType.In,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("tokenizes new and this", () => {
    const types = tokenTypes("new this");
    expect(types).toEqual([TokenType.New, TokenType.This, TokenType.EOF]);
  });

  it("tokenizes pipe operator |>", () => {
    const types = tokenTypes("x |> f");
    expect(types).toEqual([
      TokenType.Identifier,
      TokenType.PipeArrow,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("tokenizes .. (range)", () => {
    const types = tokenTypes("0..10");
    expect(types).toEqual([
      TokenType.IntLiteral,
      TokenType.DotDot,
      TokenType.IntLiteral,
      TokenType.EOF,
    ]);
  });

  it("distinguishes .. from ... (spread)", () => {
    const types = tokenTypes("...x");
    expect(types).toEqual([
      TokenType.Spread,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("distinguishes . from .. from ...", () => {
    const dotTypes = tokenTypes("a.b");
    expect(dotTypes).toContain(TokenType.Dot);
    const rangeTypes = tokenTypes("1..5");
    expect(rangeTypes).toContain(TokenType.DotDot);
    const spreadTypes = tokenTypes("...x");
    expect(spreadTypes).toContain(TokenType.Spread);
  });

  // --- const keyword ---

  it("tokenizes const keyword", () => {
    const types = tokenTypes("const x = 5");
    expect(types).toEqual([
      TokenType.Const,
      TokenType.Identifier,
      TokenType.Assign,
      TokenType.IntLiteral,
      TokenType.EOF,
    ]);
  });

  // --- Null coalescing operator ?? ---

  it("tokenizes ?? as QuestionQuestion", () => {
    const types = tokenTypes("a ?? b");
    expect(types).toEqual([
      TokenType.Identifier,
      TokenType.QuestionQuestion,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  it("still tokenizes ? as Question (not broken by ??)", () => {
    const types = tokenTypes("int?");
    expect(types).toEqual([TokenType.Int, TokenType.Question, TokenType.EOF]);
  });

  it("still tokenizes ?. as QuestionDot (not broken by ??)", () => {
    const types = tokenTypes("a?.b");
    expect(types).toEqual([
      TokenType.Identifier,
      TokenType.QuestionDot,
      TokenType.Identifier,
      TokenType.EOF,
    ]);
  });

  // --- Triple-quote strings ---

  it("tokenizes triple-quote string as StringLiteral with indent stripping", () => {
    const source = '"""\n    hello\n    world\n    """';
    const tokens = new Lexer(source).tokenize();
    expect(tokens[0].type).toBe(TokenType.StringLiteral);
    expect(tokens[0].value).toBe("hello\nworld");
  });

  it("reports error on unterminated triple-quote string", () => {
    const lexer = new Lexer('"""\nhello\nworld');
    lexer.tokenize();
    expect(lexer.diagnostics.length).toBe(1);
    expect(lexer.diagnostics[0].message).toContain(
      "Unterminated triple-quoted string",
    );
  });

  // --- Union type: Bar token ---

  it("tokenizes | as Bar token", () => {
    const types = tokenTypes("int | string");
    expect(types).toEqual([
      TokenType.Int,
      TokenType.Bar,
      TokenType.String,
      TokenType.EOF,
    ]);
  });

  it("still tokenizes || as Or and |> as PipeArrow", () => {
    expect(tokenTypes("a || b")).toContain(TokenType.Or);
    expect(tokenTypes("a |> b")).toContain(TokenType.PipeArrow);
  });

  // --- is keyword ---

  it("tokenizes is as Is keyword", () => {
    const types = tokenTypes("x is string");
    expect(types).toEqual([
      TokenType.Identifier,
      TokenType.Is,
      TokenType.String,
      TokenType.EOF,
    ]);
  });

  // --- await keyword ---

  it("tokenizes await as Await keyword", () => {
    const types = tokenTypes("await foo()");
    expect(types).toEqual([
      TokenType.Await,
      TokenType.Identifier,
      TokenType.LeftParen,
      TokenType.RightParen,
      TokenType.EOF,
    ]);
  });

  // --- New keywords ---

  it("tokenizes never as Never keyword", () => {
    expect(tokenTypes("never")).toContain(TokenType.Never);
  });

  it("tokenizes defer as Defer keyword", () => {
    expect(tokenTypes("defer")).toContain(TokenType.Defer);
  });

  it("tokenizes extend as Extend keyword", () => {
    expect(tokenTypes("extend")).toContain(TokenType.Extend);
  });

  it("tokenizes spawn as Spawn keyword", () => {
    expect(tokenTypes("spawn")).toContain(TokenType.Spawn);
  });

  it("tokenizes chan as Chan keyword", () => {
    expect(tokenTypes("chan")).toContain(TokenType.Chan);
  });

  it("tokenizes & as Ampersand", () => {
    expect(tokenTypes("A & B")).toContain(TokenType.Ampersand);
  });

  it("tokenizes @ as At", () => {
    expect(tokenTypes("x @ 1")).toContain(TokenType.At);
  });

  it("tokenizes get and set as keywords", () => {
    expect(tokenTypes("get")).toContain(TokenType.Get);
    expect(tokenTypes("set")).toContain(TokenType.Set);
  });

  it("tokenizes doc comments (///)", () => {
    const lexer = new Lexer("/// This is a doc\nint x = 1;");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.DocComment);
    expect(tokens[0].value).toBe("This is a doc");
  });
});
