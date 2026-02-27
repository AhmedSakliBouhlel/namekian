import { Token, TokenType, token } from "./token.js";
import { KEYWORDS } from "./keywords.js";
import { Diagnostic, errorDiag } from "../errors/diagnostic.js";

export class Lexer {
  private source: string;
  private file: string;
  private pos = 0;
  private line = 1;
  private column = 1;
  private tokens: Token[] = [];
  readonly diagnostics: Diagnostic[] = [];
  private interpStack: number[] = []; // brace depth stack for interpolation

  constructor(source: string, file = "<stdin>") {
    this.source = source;
    this.file = file;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;
      this.scanToken();
    }
    this.tokens.push(
      token(TokenType.EOF, "", this.line, this.column, this.pos),
    );
    return this.tokens;
  }

  private peek(): string {
    return this.source[this.pos] ?? "\0";
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? "\0";
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private match(expected: string): boolean {
    if (this.pos < this.source.length && this.source[this.pos] === expected) {
      this.advance();
      return true;
    }
    return false;
  }

  private addToken(
    type: TokenType,
    value: string,
    startLine: number,
    startCol: number,
    startOffset: number,
  ): void {
    this.tokens.push(token(type, value, startLine, startCol, startOffset));
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
      } else if (ch === "/" && this.peekNext() === "/") {
        // Line comment
        while (this.pos < this.source.length && this.peek() !== "\n") {
          this.advance();
        }
      } else if (ch === "/" && this.peekNext() === "*") {
        // Block comment
        this.advance(); // /
        this.advance(); // *
        while (this.pos < this.source.length) {
          if (this.peek() === "*" && this.peekNext() === "/") {
            this.advance(); // *
            this.advance(); // /
            break;
          }
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private scanToken(): void {
    const startLine = this.line;
    const startCol = this.column;
    const startOffset = this.pos;
    const ch = this.advance();

    switch (ch) {
      case "(":
        this.addToken(
          TokenType.LeftParen,
          "(",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case ")":
        this.addToken(
          TokenType.RightParen,
          ")",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case "{":
        if (this.interpStack.length > 0) {
          this.interpStack[this.interpStack.length - 1]++;
        }
        this.addToken(
          TokenType.LeftBrace,
          "{",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case "}":
        if (this.interpStack.length > 0) {
          const depth = --this.interpStack[this.interpStack.length - 1];
          if (depth === 0) {
            // Closing } of ${...}, resume string scanning
            this.interpStack.pop();
            this.scanStringInterp(startLine, startCol, startOffset, false);
            break;
          }
        }
        this.addToken(
          TokenType.RightBrace,
          "}",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case "[":
        this.addToken(
          TokenType.LeftBracket,
          "[",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case "]":
        this.addToken(
          TokenType.RightBracket,
          "]",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case ",":
        this.addToken(TokenType.Comma, ",", startLine, startCol, startOffset);
        break;
      case ":":
        this.addToken(TokenType.Colon, ":", startLine, startCol, startOffset);
        break;
      case ";":
        this.addToken(
          TokenType.Semicolon,
          ";",
          startLine,
          startCol,
          startOffset,
        );
        break;
      case "+":
        if (this.match("=")) {
          this.addToken(
            TokenType.PlusAssign,
            "+=",
            startLine,
            startCol,
            startOffset,
          );
        } else if (this.match("+")) {
          this.addToken(
            TokenType.PlusPlus,
            "++",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Plus, "+", startLine, startCol, startOffset);
        }
        break;
      case "-":
        if (this.match("=")) {
          this.addToken(
            TokenType.MinusAssign,
            "-=",
            startLine,
            startCol,
            startOffset,
          );
        } else if (this.match("-")) {
          this.addToken(
            TokenType.MinusMinus,
            "--",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Minus, "-", startLine, startCol, startOffset);
        }
        break;
      case "*":
        if (this.match("=")) {
          this.addToken(
            TokenType.StarAssign,
            "*=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Star, "*", startLine, startCol, startOffset);
        }
        break;
      case "%":
        if (this.match("=")) {
          this.addToken(
            TokenType.PercentAssign,
            "%=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(
            TokenType.Percent,
            "%",
            startLine,
            startCol,
            startOffset,
          );
        }
        break;
      case "/":
        if (this.match("=")) {
          this.addToken(
            TokenType.SlashAssign,
            "/=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Slash, "/", startLine, startCol, startOffset);
        }
        break;

      case ".":
        if (this.peek() === "." && this.source[this.pos + 1] === ".") {
          this.advance();
          this.advance();
          this.addToken(
            TokenType.Spread,
            "...",
            startLine,
            startCol,
            startOffset,
          );
        } else if (this.peek() === ".") {
          this.advance();
          this.addToken(
            TokenType.DotDot,
            "..",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Dot, ".", startLine, startCol, startOffset);
        }
        break;

      case "?":
        if (this.match(".")) {
          this.addToken(
            TokenType.QuestionDot,
            "?.",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(
            TokenType.Question,
            "?",
            startLine,
            startCol,
            startOffset,
          );
        }
        break;

      case "=":
        if (this.match("=")) {
          this.addToken(
            TokenType.Equal,
            "==",
            startLine,
            startCol,
            startOffset,
          );
        } else if (this.match(">")) {
          this.addToken(
            TokenType.Arrow,
            "=>",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(
            TokenType.Assign,
            "=",
            startLine,
            startCol,
            startOffset,
          );
        }
        break;

      case "!":
        if (this.match("=")) {
          this.addToken(
            TokenType.NotEqual,
            "!=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Not, "!", startLine, startCol, startOffset);
        }
        break;

      case "<":
        if (this.match("=")) {
          this.addToken(
            TokenType.LessEqual,
            "<=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(TokenType.Less, "<", startLine, startCol, startOffset);
        }
        break;

      case ">":
        if (this.match("=")) {
          this.addToken(
            TokenType.GreaterEqual,
            ">=",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.addToken(
            TokenType.Greater,
            ">",
            startLine,
            startCol,
            startOffset,
          );
        }
        break;

      case "&":
        if (this.match("&")) {
          this.addToken(TokenType.And, "&&", startLine, startCol, startOffset);
        } else {
          this.diagnostics.push(
            errorDiag(`Unexpected character '&'. Did you mean '&&'?`, {
              file: this.file,
              line: startLine,
              column: startCol,
              offset: startOffset,
            }),
          );
        }
        break;

      case "|":
        if (this.match("|")) {
          this.addToken(TokenType.Or, "||", startLine, startCol, startOffset);
        } else if (this.match(">")) {
          this.addToken(
            TokenType.PipeArrow,
            "|>",
            startLine,
            startCol,
            startOffset,
          );
        } else {
          this.diagnostics.push(
            errorDiag(`Unexpected character '|'. Did you mean '||' or '|>'?`, {
              file: this.file,
              line: startLine,
              column: startCol,
              offset: startOffset,
            }),
          );
        }
        break;

      case '"':
        this.scanString(startLine, startCol, startOffset);
        break;

      default:
        if (isDigit(ch)) {
          this.scanNumber(ch, startLine, startCol, startOffset);
        } else if (isIdentStart(ch)) {
          this.scanIdentifier(ch, startLine, startCol, startOffset);
        } else {
          this.diagnostics.push(
            errorDiag(`Unexpected character '${ch}'`, {
              file: this.file,
              line: startLine,
              column: startCol,
              offset: startOffset,
            }),
          );
        }
        break;
    }
  }

  private scanString(
    startLine: number,
    startCol: number,
    startOffset: number,
  ): void {
    // Check if the string contains ${...} interpolation
    // Quick scan ahead to decide
    let hasInterp = false;
    let scanPos = this.pos;
    while (scanPos < this.source.length && this.source[scanPos] !== '"') {
      if (this.source[scanPos] === "\\") {
        scanPos += 2;
        continue;
      }
      if (this.source[scanPos] === "$" && this.source[scanPos + 1] === "{") {
        hasInterp = true;
        break;
      }
      if (this.source[scanPos] === "\n") break;
      scanPos++;
    }

    if (hasInterp) {
      this.scanStringInterp(startLine, startCol, startOffset, true);
    } else {
      this.scanPlainString(startLine, startCol, startOffset);
    }
  }

  private scanPlainString(
    startLine: number,
    startCol: number,
    startOffset: number,
  ): void {
    let value = "";
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\n") {
        this.diagnostics.push(
          errorDiag("Unterminated string literal", {
            file: this.file,
            line: startLine,
            column: startCol,
            offset: startOffset,
          }),
        );
        return;
      }
      if (this.peek() === "\\") {
        value += this.scanEscape();
      } else {
        value += this.advance();
      }
    }
    if (this.pos >= this.source.length) {
      this.diagnostics.push(
        errorDiag("Unterminated string literal", {
          file: this.file,
          line: startLine,
          column: startCol,
          offset: startOffset,
        }),
      );
      return;
    }
    this.advance(); // closing "
    this.addToken(
      TokenType.StringLiteral,
      value,
      startLine,
      startCol,
      startOffset,
    );
  }

  private scanStringInterp(
    startLine: number,
    startCol: number,
    startOffset: number,
    isStart: boolean,
  ): void {
    // Scan string content until we hit ${ or closing "
    let value = "";
    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\n") {
        this.diagnostics.push(
          errorDiag("Unterminated string literal", {
            file: this.file,
            line: startLine,
            column: startCol,
            offset: startOffset,
          }),
        );
        return;
      }
      if (this.peek() === "\\") {
        value += this.scanEscape();
        continue;
      }
      if (this.peek() === "$" && this.peekNext() === "{") {
        // Emit text before ${
        const tokType = isStart
          ? TokenType.StringInterpStart
          : TokenType.StringInterpMiddle;
        this.addToken(tokType, value, startLine, startCol, startOffset);
        this.advance(); // $
        this.advance(); // {
        // Push brace depth = 1 (the ${ counts as entering)
        this.interpStack.push(1);
        return; // Return to main tokenize loop for the expression
      }
      value += this.advance();
    }

    // Reached closing "
    if (this.pos >= this.source.length) {
      this.diagnostics.push(
        errorDiag("Unterminated string literal", {
          file: this.file,
          line: startLine,
          column: startCol,
          offset: startOffset,
        }),
      );
      return;
    }
    this.advance(); // closing "
    const tokType = isStart
      ? TokenType.StringLiteral
      : TokenType.StringInterpEnd;
    this.addToken(tokType, value, startLine, startCol, startOffset);
  }

  private scanEscape(): string {
    this.advance(); // backslash
    const esc = this.advance();
    switch (esc) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "$":
        return "$";
      default:
        return esc;
    }
  }

  private scanNumber(
    first: string,
    startLine: number,
    startCol: number,
    startOffset: number,
  ): void {
    let value = first;
    let isFloat = false;

    while (this.pos < this.source.length && isDigit(this.peek())) {
      value += this.advance();
    }

    if (this.peek() === "." && isDigit(this.peekNext())) {
      isFloat = true;
      value += this.advance(); // .
      while (this.pos < this.source.length && isDigit(this.peek())) {
        value += this.advance();
      }
    }

    this.addToken(
      isFloat ? TokenType.FloatLiteral : TokenType.IntLiteral,
      value,
      startLine,
      startCol,
      startOffset,
    );
  }

  private scanIdentifier(
    first: string,
    startLine: number,
    startCol: number,
    startOffset: number,
  ): void {
    let value = first;
    while (this.pos < this.source.length && isIdentPart(this.peek())) {
      value += this.advance();
    }

    const kwType = KEYWORDS.get(value);
    if (kwType !== undefined) {
      this.addToken(kwType, value, startLine, startCol, startOffset);
    } else {
      this.addToken(
        TokenType.Identifier,
        value,
        startLine,
        startCol,
        startOffset,
      );
    }
  }
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}
