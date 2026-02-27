"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/lexer/token.ts
  function token(type, value, line, column, offset) {
    return { type, value, line, column, offset };
  }

  // src/lexer/keywords.ts
  var KEYWORDS = /* @__PURE__ */ new Map([
    ["int", "Int" /* Int */],
    ["float", "Float" /* Float */],
    ["string", "String" /* String */],
    ["bool", "Bool" /* Bool */],
    ["void", "Void" /* Void */],
    ["var", "Var" /* Var */],
    ["type", "Type" /* Type */],
    ["struct", "Struct" /* Struct */],
    ["class", "Class" /* Class */],
    ["interface", "Interface" /* Interface */],
    ["enum", "Enum" /* Enum */],
    ["new", "New" /* New */],
    ["this", "This" /* This */],
    ["if", "If" /* If */],
    ["else", "Else" /* Else */],
    ["for", "For" /* For */],
    ["while", "While" /* While */],
    ["return", "Return" /* Return */],
    ["match", "Match" /* Match */],
    ["break", "Break" /* Break */],
    ["continue", "Continue" /* Continue */],
    ["in", "In" /* In */],
    ["try", "Try" /* Try */],
    ["catch", "Catch" /* Catch */],
    ["Ok", "Ok" /* Ok */],
    ["Err", "Err" /* Err */],
    ["Result", "Result" /* Result */],
    ["take", "Take" /* Take */],
    ["from", "From" /* From */],
    ["load", "Load" /* Load */],
    ["true", "BoolLiteral" /* BoolLiteral */],
    ["false", "BoolLiteral" /* BoolLiteral */],
    ["null", "NullLiteral" /* NullLiteral */]
  ]);

  // src/errors/diagnostic.ts
  function createDiagnostic(severity, message, location, hint) {
    return { severity, message, location, hint };
  }
  function errorDiag(message, location, hint) {
    return createDiagnostic("error", message, location, hint);
  }
  function warnDiag(message, location, hint) {
    return createDiagnostic("warning", message, location, hint);
  }

  // src/lexer/lexer.ts
  var Lexer = class {
    // brace depth stack for interpolation
    constructor(source, file = "<stdin>") {
      __publicField(this, "source");
      __publicField(this, "file");
      __publicField(this, "pos", 0);
      __publicField(this, "line", 1);
      __publicField(this, "column", 1);
      __publicField(this, "tokens", []);
      __publicField(this, "diagnostics", []);
      __publicField(this, "interpStack", []);
      this.source = source;
      this.file = file;
    }
    tokenize() {
      while (this.pos < this.source.length) {
        this.skipWhitespaceAndComments();
        if (this.pos >= this.source.length) break;
        this.scanToken();
      }
      this.tokens.push(
        token("EOF" /* EOF */, "", this.line, this.column, this.pos)
      );
      return this.tokens;
    }
    peek() {
      return this.source[this.pos] ?? "\0";
    }
    peekNext() {
      return this.source[this.pos + 1] ?? "\0";
    }
    advance() {
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
    match(expected) {
      if (this.pos < this.source.length && this.source[this.pos] === expected) {
        this.advance();
        return true;
      }
      return false;
    }
    addToken(type, value, startLine, startCol, startOffset) {
      this.tokens.push(token(type, value, startLine, startCol, startOffset));
    }
    skipWhitespaceAndComments() {
      while (this.pos < this.source.length) {
        const ch = this.peek();
        if (ch === " " || ch === "	" || ch === "\r" || ch === "\n") {
          this.advance();
        } else if (ch === "/" && this.peekNext() === "/") {
          while (this.pos < this.source.length && this.peek() !== "\n") {
            this.advance();
          }
        } else if (ch === "/" && this.peekNext() === "*") {
          this.advance();
          this.advance();
          while (this.pos < this.source.length) {
            if (this.peek() === "*" && this.peekNext() === "/") {
              this.advance();
              this.advance();
              break;
            }
            this.advance();
          }
        } else {
          break;
        }
      }
    }
    scanToken() {
      const startLine = this.line;
      const startCol = this.column;
      const startOffset = this.pos;
      const ch = this.advance();
      switch (ch) {
        case "(":
          this.addToken(
            "LeftParen" /* LeftParen */,
            "(",
            startLine,
            startCol,
            startOffset
          );
          break;
        case ")":
          this.addToken(
            "RightParen" /* RightParen */,
            ")",
            startLine,
            startCol,
            startOffset
          );
          break;
        case "{":
          if (this.interpStack.length > 0) {
            this.interpStack[this.interpStack.length - 1]++;
          }
          this.addToken(
            "LeftBrace" /* LeftBrace */,
            "{",
            startLine,
            startCol,
            startOffset
          );
          break;
        case "}":
          if (this.interpStack.length > 0) {
            const depth = --this.interpStack[this.interpStack.length - 1];
            if (depth === 0) {
              this.interpStack.pop();
              this.scanStringInterp(startLine, startCol, startOffset, false);
              break;
            }
          }
          this.addToken(
            "RightBrace" /* RightBrace */,
            "}",
            startLine,
            startCol,
            startOffset
          );
          break;
        case "[":
          this.addToken(
            "LeftBracket" /* LeftBracket */,
            "[",
            startLine,
            startCol,
            startOffset
          );
          break;
        case "]":
          this.addToken(
            "RightBracket" /* RightBracket */,
            "]",
            startLine,
            startCol,
            startOffset
          );
          break;
        case ",":
          this.addToken("Comma" /* Comma */, ",", startLine, startCol, startOffset);
          break;
        case ":":
          this.addToken("Colon" /* Colon */, ":", startLine, startCol, startOffset);
          break;
        case ";":
          this.addToken(
            "Semicolon" /* Semicolon */,
            ";",
            startLine,
            startCol,
            startOffset
          );
          break;
        case "+":
          if (this.match("=")) {
            this.addToken(
              "PlusAssign" /* PlusAssign */,
              "+=",
              startLine,
              startCol,
              startOffset
            );
          } else if (this.match("+")) {
            this.addToken(
              "PlusPlus" /* PlusPlus */,
              "++",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Plus" /* Plus */, "+", startLine, startCol, startOffset);
          }
          break;
        case "-":
          if (this.match("=")) {
            this.addToken(
              "MinusAssign" /* MinusAssign */,
              "-=",
              startLine,
              startCol,
              startOffset
            );
          } else if (this.match("-")) {
            this.addToken(
              "MinusMinus" /* MinusMinus */,
              "--",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Minus" /* Minus */, "-", startLine, startCol, startOffset);
          }
          break;
        case "*":
          if (this.match("=")) {
            this.addToken(
              "StarAssign" /* StarAssign */,
              "*=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Star" /* Star */, "*", startLine, startCol, startOffset);
          }
          break;
        case "%":
          if (this.match("=")) {
            this.addToken(
              "PercentAssign" /* PercentAssign */,
              "%=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken(
              "Percent" /* Percent */,
              "%",
              startLine,
              startCol,
              startOffset
            );
          }
          break;
        case "/":
          if (this.match("=")) {
            this.addToken(
              "SlashAssign" /* SlashAssign */,
              "/=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Slash" /* Slash */, "/", startLine, startCol, startOffset);
          }
          break;
        case ".":
          if (this.peek() === "." && this.source[this.pos + 1] === ".") {
            this.advance();
            this.advance();
            this.addToken(
              "Spread" /* Spread */,
              "...",
              startLine,
              startCol,
              startOffset
            );
          } else if (this.peek() === ".") {
            this.advance();
            this.addToken(
              "DotDot" /* DotDot */,
              "..",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Dot" /* Dot */, ".", startLine, startCol, startOffset);
          }
          break;
        case "?":
          if (this.match(".")) {
            this.addToken(
              "QuestionDot" /* QuestionDot */,
              "?.",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken(
              "Question" /* Question */,
              "?",
              startLine,
              startCol,
              startOffset
            );
          }
          break;
        case "=":
          if (this.match("=")) {
            this.addToken(
              "Equal" /* Equal */,
              "==",
              startLine,
              startCol,
              startOffset
            );
          } else if (this.match(">")) {
            this.addToken(
              "Arrow" /* Arrow */,
              "=>",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken(
              "Assign" /* Assign */,
              "=",
              startLine,
              startCol,
              startOffset
            );
          }
          break;
        case "!":
          if (this.match("=")) {
            this.addToken(
              "NotEqual" /* NotEqual */,
              "!=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Not" /* Not */, "!", startLine, startCol, startOffset);
          }
          break;
        case "<":
          if (this.match("=")) {
            this.addToken(
              "LessEqual" /* LessEqual */,
              "<=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken("Less" /* Less */, "<", startLine, startCol, startOffset);
          }
          break;
        case ">":
          if (this.match("=")) {
            this.addToken(
              "GreaterEqual" /* GreaterEqual */,
              ">=",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.addToken(
              "Greater" /* Greater */,
              ">",
              startLine,
              startCol,
              startOffset
            );
          }
          break;
        case "&":
          if (this.match("&")) {
            this.addToken("And" /* And */, "&&", startLine, startCol, startOffset);
          } else {
            this.diagnostics.push(
              errorDiag(`Unexpected character '&'. Did you mean '&&'?`, {
                file: this.file,
                line: startLine,
                column: startCol,
                offset: startOffset
              })
            );
          }
          break;
        case "|":
          if (this.match("|")) {
            this.addToken("Or" /* Or */, "||", startLine, startCol, startOffset);
          } else if (this.match(">")) {
            this.addToken(
              "PipeArrow" /* PipeArrow */,
              "|>",
              startLine,
              startCol,
              startOffset
            );
          } else {
            this.diagnostics.push(
              errorDiag(`Unexpected character '|'. Did you mean '||' or '|>'?`, {
                file: this.file,
                line: startLine,
                column: startCol,
                offset: startOffset
              })
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
                offset: startOffset
              })
            );
          }
          break;
      }
    }
    scanString(startLine, startCol, startOffset) {
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
    scanPlainString(startLine, startCol, startOffset) {
      let value = "";
      while (this.pos < this.source.length && this.peek() !== '"') {
        if (this.peek() === "\n") {
          this.diagnostics.push(
            errorDiag("Unterminated string literal", {
              file: this.file,
              line: startLine,
              column: startCol,
              offset: startOffset
            })
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
            offset: startOffset
          })
        );
        return;
      }
      this.advance();
      this.addToken(
        "StringLiteral" /* StringLiteral */,
        value,
        startLine,
        startCol,
        startOffset
      );
    }
    scanStringInterp(startLine, startCol, startOffset, isStart) {
      let value = "";
      while (this.pos < this.source.length && this.peek() !== '"') {
        if (this.peek() === "\n") {
          this.diagnostics.push(
            errorDiag("Unterminated string literal", {
              file: this.file,
              line: startLine,
              column: startCol,
              offset: startOffset
            })
          );
          return;
        }
        if (this.peek() === "\\") {
          value += this.scanEscape();
          continue;
        }
        if (this.peek() === "$" && this.peekNext() === "{") {
          const tokType2 = isStart ? "StringInterpStart" /* StringInterpStart */ : "StringInterpMiddle" /* StringInterpMiddle */;
          this.addToken(tokType2, value, startLine, startCol, startOffset);
          this.advance();
          this.advance();
          this.interpStack.push(1);
          return;
        }
        value += this.advance();
      }
      if (this.pos >= this.source.length) {
        this.diagnostics.push(
          errorDiag("Unterminated string literal", {
            file: this.file,
            line: startLine,
            column: startCol,
            offset: startOffset
          })
        );
        return;
      }
      this.advance();
      const tokType = isStart ? "StringLiteral" /* StringLiteral */ : "StringInterpEnd" /* StringInterpEnd */;
      this.addToken(tokType, value, startLine, startCol, startOffset);
    }
    scanEscape() {
      this.advance();
      const esc = this.advance();
      switch (esc) {
        case "n":
          return "\n";
        case "t":
          return "	";
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
    scanNumber(first, startLine, startCol, startOffset) {
      let value = first;
      let isFloat = false;
      while (this.pos < this.source.length && isDigit(this.peek())) {
        value += this.advance();
      }
      if (this.peek() === "." && isDigit(this.peekNext())) {
        isFloat = true;
        value += this.advance();
        while (this.pos < this.source.length && isDigit(this.peek())) {
          value += this.advance();
        }
      }
      this.addToken(
        isFloat ? "FloatLiteral" /* FloatLiteral */ : "IntLiteral" /* IntLiteral */,
        value,
        startLine,
        startCol,
        startOffset
      );
    }
    scanIdentifier(first, startLine, startCol, startOffset) {
      let value = first;
      while (this.pos < this.source.length && isIdentPart(this.peek())) {
        value += this.advance();
      }
      const kwType = KEYWORDS.get(value);
      if (kwType !== void 0) {
        this.addToken(kwType, value, startLine, startCol, startOffset);
      } else {
        this.addToken(
          "Identifier" /* Identifier */,
          value,
          startLine,
          startCol,
          startOffset
        );
      }
    }
  };
  function isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }
  function isIdentStart(ch) {
    return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
  }
  function isIdentPart(ch) {
    return isIdentStart(ch) || isDigit(ch);
  }

  // src/parser/parser.ts
  var TYPE_KEYWORDS = /* @__PURE__ */ new Set([
    "Int" /* Int */,
    "Float" /* Float */,
    "String" /* String */,
    "Bool" /* Bool */,
    "Void" /* Void */,
    "Var" /* Var */
  ]);
  var Parser = class {
    constructor(tokens, file = "<stdin>") {
      __publicField(this, "tokens");
      __publicField(this, "pos", 0);
      __publicField(this, "diagnostics", []);
      __publicField(this, "file");
      this.tokens = tokens;
      this.file = file;
    }
    parse() {
      const span = this.span();
      const body = [];
      while (!this.isAtEnd()) {
        const before = this.pos;
        const diagsBefore = this.diagnostics.length;
        const stmt = this.parseStatement();
        if (this.diagnostics.length > diagsBefore && this.pos === before) {
          this.synchronize();
          continue;
        }
        body.push(stmt);
      }
      return { kind: "Program", body, span };
    }
    // --- Helpers ---
    peek() {
      return this.tokens[this.pos];
    }
    peekType() {
      return this.tokens[this.pos].type;
    }
    advance() {
      const tok = this.tokens[this.pos];
      if (!this.isAtEnd()) this.pos++;
      return tok;
    }
    isAtEnd() {
      return this.peekType() === "EOF" /* EOF */;
    }
    check(type) {
      return this.peekType() === type;
    }
    match(...types) {
      for (const type of types) {
        if (this.check(type)) {
          return this.advance();
        }
      }
      return null;
    }
    expect(type, message) {
      if (this.check(type)) {
        return this.advance();
      }
      const tok = this.peek();
      this.diagnostics.push(
        errorDiag(`${message}, got '${tok.value}' (${tok.type})`, {
          file: this.file,
          line: tok.line,
          column: tok.column,
          offset: tok.offset
        })
      );
      if (!this.isAtEnd()) this.advance();
      return tok;
    }
    span() {
      const tok = this.peek();
      return { line: tok.line, column: tok.column, offset: tok.offset };
    }
    /**
     * Skip tokens until we reach a statement boundary — a semicolon, closing
     * brace, or a token that starts a new statement. This allows the parser
     * to recover from errors and continue producing diagnostics.
     */
    synchronize() {
      while (!this.isAtEnd()) {
        if (this.peek().type === "Semicolon" /* Semicolon */) {
          this.advance();
          return;
        }
        switch (this.peekType()) {
          case "If" /* If */:
          case "While" /* While */:
          case "For" /* For */:
          case "Return" /* Return */:
          case "Break" /* Break */:
          case "Continue" /* Continue */:
          case "Struct" /* Struct */:
          case "Class" /* Class */:
          case "Interface" /* Interface */:
          case "Enum" /* Enum */:
          case "Take" /* Take */:
          case "Load" /* Load */:
          case "Try" /* Try */:
          case "Match" /* Match */:
          case "Var" /* Var */:
          case "Type" /* Type */:
            return;
          case "RightBrace" /* RightBrace */:
            return;
        }
        this.advance();
      }
    }
    lookAhead(offset) {
      const idx = this.pos + offset;
      if (idx < this.tokens.length) return this.tokens[idx].type;
      return "EOF" /* EOF */;
    }
    looksLikeTypedDecl() {
      if (this.lookAhead(1) === "Identifier" /* Identifier */) return true;
      if (this.lookAhead(1) === "Question" /* Question */ && this.lookAhead(2) === "Identifier" /* Identifier */)
        return true;
      if (this.lookAhead(1) === "LeftBracket" /* LeftBracket */ && this.lookAhead(2) === "RightBracket" /* RightBracket */ && this.lookAhead(3) === "Identifier" /* Identifier */)
        return true;
      if (this.lookAhead(1) === "Less" /* Less */) {
        let depth = 1;
        let i = 2;
        while (depth > 0 && this.lookAhead(i) !== "EOF" /* EOF */) {
          if (this.lookAhead(i) === "Less" /* Less */) depth++;
          else if (this.lookAhead(i) === "Greater" /* Greater */) depth--;
          i++;
        }
        const next = this.lookAhead(i);
        if (next === "Identifier" /* Identifier */) return true;
        if (next === "Question" /* Question */ && this.lookAhead(i + 1) === "Identifier" /* Identifier */)
          return true;
      }
      return false;
    }
    looksLikeTupleTypeDecl() {
      let i = 1;
      let depth = 1;
      while (depth > 0 && this.lookAhead(i) !== "EOF" /* EOF */) {
        if (this.lookAhead(i) === "LeftParen" /* LeftParen */) depth++;
        else if (this.lookAhead(i) === "RightParen" /* RightParen */) depth--;
        i++;
      }
      return this.lookAhead(i) === "Identifier" /* Identifier */;
    }
    // --- Type annotations ---
    isTypeStart() {
      const t = this.peekType();
      return TYPE_KEYWORDS.has(t) || t === "Identifier" /* Identifier */ || t === "Result" /* Result */;
    }
    parseTypeAnnotation() {
      let type = this.parsePrimaryType();
      while (this.check("LeftBracket" /* LeftBracket */) && this.lookAhead(1) === "RightBracket" /* RightBracket */) {
        this.advance();
        this.advance();
        type = { kind: "ArrayType", elementType: type, span: type.span };
      }
      if (this.match("Question" /* Question */)) {
        type = { kind: "NullableType", innerType: type, span: type.span };
      }
      return type;
    }
    parsePrimaryType() {
      const tok = this.peek();
      const span = this.span();
      if (this.match("Int" /* Int */))
        return { kind: "NamedType", name: "int", span };
      if (this.match("Float" /* Float */))
        return { kind: "NamedType", name: "float", span };
      if (this.match("String" /* String */))
        return { kind: "NamedType", name: "string", span };
      if (this.match("Bool" /* Bool */))
        return { kind: "NamedType", name: "bool", span };
      if (this.match("Void" /* Void */))
        return { kind: "NamedType", name: "void", span };
      if (this.check("LeftParen" /* LeftParen */)) {
        const saved = this.pos;
        const savedDiags = this.diagnostics.length;
        this.advance();
        const first = this.parseTypeAnnotation();
        if (this.check("Comma" /* Comma */)) {
          const elements = [first];
          while (this.match("Comma" /* Comma */)) {
            elements.push(this.parseTypeAnnotation());
          }
          this.expect("RightParen" /* RightParen */, "Expected ')'");
          return { kind: "TupleType", elements, span };
        }
        this.pos = saved;
        this.diagnostics.length = savedDiags;
      }
      if (this.check("Result" /* Result */) || this.check("Identifier" /* Identifier */)) {
        const name = this.advance().value;
        if (this.match("Less" /* Less */)) {
          const typeArgs = [];
          if (!this.check("Greater" /* Greater */)) {
            typeArgs.push(this.parseTypeAnnotation());
            while (this.match("Comma" /* Comma */)) {
              typeArgs.push(this.parseTypeAnnotation());
            }
          }
          this.expect("Greater" /* Greater */, "Expected '>'");
          return { kind: "GenericType", name, typeArgs, span };
        }
        return { kind: "NamedType", name, span };
      }
      this.diagnostics.push(
        errorDiag(`Expected type, got '${tok.value}'`, {
          file: this.file,
          line: tok.line,
          column: tok.column,
          offset: tok.offset
        })
      );
      this.advance();
      return { kind: "NamedType", name: "unknown", span };
    }
    // --- Statements ---
    parseStatement() {
      const t = this.peekType();
      if (t === "Take" /* Take */) return this.parseTakeStatement();
      if (t === "Load" /* Load */) return this.parseLoadStatement();
      if (t === "If" /* If */) return this.parseIfStatement();
      if (t === "While" /* While */) return this.parseWhileStatement();
      if (t === "For" /* For */) return this.parseForStatement();
      if (t === "Return" /* Return */) return this.parseReturnStatement();
      if (t === "Break" /* Break */) return this.parseBreakStatement();
      if (t === "Continue" /* Continue */) return this.parseContinueStatement();
      if (t === "LeftBrace" /* LeftBrace */) return this.parseBlock();
      if (t === "Struct" /* Struct */) return this.parseStructDeclaration();
      if (t === "Class" /* Class */) return this.parseClassDeclaration();
      if (t === "Interface" /* Interface */) return this.parseInterfaceDeclaration();
      if (t === "Enum" /* Enum */) return this.parseEnumDeclaration();
      if (t === "Try" /* Try */) return this.parseTryCatch();
      if (t === "Match" /* Match */) return this.parseMatchStatement();
      if (t === "Type" /* Type */ && this.lookAhead(1) === "Identifier" /* Identifier */) {
        return this.parseTypeAlias();
      }
      if (t === "Var" /* Var */ && (this.lookAhead(1) === "LeftBrace" /* LeftBrace */ || this.lookAhead(1) === "LeftBracket" /* LeftBracket */)) {
        return this.parseDestructureDeclaration();
      }
      if (t === "Var" /* Var */) return this.parseVarDeclaration();
      if (this.isTypeStart() && this.looksLikeTypedDecl()) {
        return this.parseTypedDeclaration();
      }
      if (this.check("LeftParen" /* LeftParen */) && this.looksLikeTupleTypeDecl()) {
        return this.parseTypedDeclaration();
      }
      return this.parseExpressionStatement();
    }
    parseTypedDeclaration() {
      const span = this.span();
      const type = this.parseTypeAnnotation();
      const name = this.expect("Identifier" /* Identifier */, "Expected identifier").value;
      const typeParams = this.parseTypeParams();
      if (this.check("LeftParen" /* LeftParen */)) {
        return this.parseFunctionRest(name, type, span, typeParams);
      }
      this.expect("Assign" /* Assign */, "Expected '='");
      const initializer = this.parseExpression();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return {
        kind: "VariableDeclaration",
        name,
        type,
        initializer,
        span
      };
    }
    parseVarDeclaration() {
      const span = this.span();
      this.advance();
      const name = this.expect("Identifier" /* Identifier */, "Expected identifier").value;
      this.expect("Assign" /* Assign */, "Expected '='");
      const initializer = this.parseExpression();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "VariableDeclaration", name, initializer, span };
    }
    parseTypeParams() {
      const typeParams = [];
      if (this.check("Less" /* Less */)) {
        this.advance();
        typeParams.push(
          this.expect("Identifier" /* Identifier */, "Expected type parameter").value
        );
        while (this.match("Comma" /* Comma */)) {
          typeParams.push(
            this.expect("Identifier" /* Identifier */, "Expected type parameter").value
          );
        }
        this.expect("Greater" /* Greater */, "Expected '>'");
      }
      return typeParams;
    }
    parseFunctionRest(name, returnType, span, typeParams = []) {
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      const params = this.parseParameterList();
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      const body = this.parseBlock();
      return {
        kind: "FunctionDeclaration",
        name,
        typeParams,
        params,
        returnType,
        body,
        span
      };
    }
    parseParameterList() {
      const params = [];
      if (!this.check("RightParen" /* RightParen */)) {
        params.push(this.parseParameter());
        while (this.match("Comma" /* Comma */)) {
          params.push(this.parseParameter());
        }
      }
      return params;
    }
    parseParameter() {
      const span = this.span();
      if (this.isTypeStart() && this.lookAhead(1) === "Identifier" /* Identifier */) {
        const type = this.parseTypeAnnotation();
        const name2 = this.expect(
          "Identifier" /* Identifier */,
          "Expected parameter name"
        ).value;
        let defaultValue2;
        if (this.match("Assign" /* Assign */)) {
          defaultValue2 = this.parseExpression();
        }
        return { name: name2, type, defaultValue: defaultValue2, span };
      }
      const name = this.expect(
        "Identifier" /* Identifier */,
        "Expected parameter name"
      ).value;
      let defaultValue;
      if (this.match("Assign" /* Assign */)) {
        defaultValue = this.parseExpression();
      }
      return { name, defaultValue, span };
    }
    parseBlock() {
      const span = this.span();
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const body = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        const before = this.pos;
        const diagsBefore = this.diagnostics.length;
        const stmt = this.parseStatement();
        if (this.diagnostics.length > diagsBefore && this.pos === before) {
          this.synchronize();
          continue;
        }
        body.push(stmt);
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "BlockStatement", body, span };
    }
    parseReturnStatement() {
      const span = this.span();
      this.advance();
      let value;
      if (!this.check("Semicolon" /* Semicolon */)) {
        value = this.parseExpression();
      }
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "ReturnStatement", value, span };
    }
    parseBreakStatement() {
      const span = this.span();
      this.advance();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "BreakStatement", span };
    }
    parseContinueStatement() {
      const span = this.span();
      this.advance();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "ContinueStatement", span };
    }
    parseIfStatement() {
      const span = this.span();
      this.advance();
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      const condition = this.parseExpression();
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      const consequent = this.parseBlock();
      let alternate;
      if (this.match("Else" /* Else */)) {
        if (this.check("If" /* If */)) {
          alternate = this.parseIfStatement();
        } else {
          alternate = this.parseBlock();
        }
      }
      return { kind: "IfStatement", condition, consequent, alternate, span };
    }
    parseWhileStatement() {
      const span = this.span();
      this.advance();
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      const condition = this.parseExpression();
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      const body = this.parseBlock();
      return { kind: "WhileStatement", condition, body, span };
    }
    parseForStatement() {
      const span = this.span();
      this.advance();
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      if (this.peekType() === "Identifier" /* Identifier */ && this.lookAhead(1) === "In" /* In */) {
        const variable = this.advance().value;
        this.advance();
        const iterable = this.parseExpression();
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        const body2 = this.parseBlock();
        return { kind: "ForInStatement", variable, iterable, body: body2, span };
      }
      let init;
      if (!this.check("Semicolon" /* Semicolon */)) {
        if (this.peekType() === "Var" /* Var */) {
          init = this.parseVarDeclaration();
        } else if (this.isTypeStart() && this.lookAhead(1) === "Identifier" /* Identifier */ && this.lookAhead(2) === "Assign" /* Assign */) {
          init = this.parseTypedDeclaration();
        } else {
          init = this.parseExpressionStatement();
        }
      } else {
        this.advance();
      }
      let condition;
      if (!this.check("Semicolon" /* Semicolon */)) {
        condition = this.parseExpression();
      }
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      let update;
      if (!this.check("RightParen" /* RightParen */)) {
        update = this.parseExpression();
      }
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      const body = this.parseBlock();
      return { kind: "ForStatement", init, condition, update, body, span };
    }
    parseTakeStatement() {
      const span = this.span();
      this.advance();
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const names = [];
      if (!this.check("RightBrace" /* RightBrace */)) {
        names.push(
          this.expect("Identifier" /* Identifier */, "Expected identifier").value
        );
        while (this.match("Comma" /* Comma */)) {
          names.push(
            this.expect("Identifier" /* Identifier */, "Expected identifier").value
          );
        }
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      this.expect("From" /* From */, "Expected 'from'");
      const path = this.expect(
        "StringLiteral" /* StringLiteral */,
        "Expected string path"
      ).value;
      this.match("Semicolon" /* Semicolon */);
      return { kind: "TakeStatement", names, path, span };
    }
    parseLoadStatement() {
      const span = this.span();
      this.advance();
      const path = this.expect(
        "StringLiteral" /* StringLiteral */,
        "Expected string path"
      ).value;
      const name = path.split("/").pop().replace(/[^a-zA-Z0-9_]/g, "");
      this.match("Semicolon" /* Semicolon */);
      return { kind: "LoadStatement", name, path, span };
    }
    parseStructDeclaration() {
      const span = this.span();
      this.advance();
      const name = this.expect(
        "Identifier" /* Identifier */,
        "Expected struct name"
      ).value;
      const typeParams = this.parseTypeParams();
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const fields = [];
      const methods = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        if (this.isTypeStart()) {
          const fSpan = this.span();
          const type = this.parseTypeAnnotation();
          const fname = this.expect(
            "Identifier" /* Identifier */,
            "Expected field name"
          ).value;
          if (this.check("LeftParen" /* LeftParen */)) {
            methods.push(this.parseFunctionRest(fname, type, fSpan));
          } else {
            this.expect("Semicolon" /* Semicolon */, "Expected ';'");
            fields.push({ name: fname, type, span: fSpan });
          }
        } else {
          this.advance();
        }
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return {
        kind: "StructDeclaration",
        name,
        typeParams,
        fields,
        methods,
        span
      };
    }
    parseClassDeclaration() {
      const span = this.span();
      this.advance();
      const name = this.expect("Identifier" /* Identifier */, "Expected class name").value;
      const typeParams = this.parseTypeParams();
      let superClass;
      const interfaces = [];
      if (this.match("Colon" /* Colon */)) {
        const first = this.expect(
          "Identifier" /* Identifier */,
          "Expected class or interface name"
        ).value;
        if (this.match("Comma" /* Comma */)) {
          superClass = first;
          interfaces.push(
            this.expect("Identifier" /* Identifier */, "Expected interface name").value
          );
          while (this.match("Comma" /* Comma */)) {
            interfaces.push(
              this.expect("Identifier" /* Identifier */, "Expected interface name").value
            );
          }
        } else {
          superClass = first;
        }
      }
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const fields = [];
      const methods = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        if (this.isTypeStart()) {
          const fSpan = this.span();
          const type = this.parseTypeAnnotation();
          const fname = this.expect(
            "Identifier" /* Identifier */,
            "Expected field/method name"
          ).value;
          if (this.check("LeftParen" /* LeftParen */)) {
            methods.push(this.parseFunctionRest(fname, type, fSpan));
          } else {
            this.expect("Semicolon" /* Semicolon */, "Expected ';'");
            fields.push({ name: fname, type, span: fSpan });
          }
        } else {
          this.advance();
        }
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return {
        kind: "ClassDeclaration",
        name,
        typeParams,
        superClass,
        interfaces,
        fields,
        methods,
        span
      };
    }
    parseInterfaceDeclaration() {
      const span = this.span();
      this.advance();
      const name = this.expect(
        "Identifier" /* Identifier */,
        "Expected interface name"
      ).value;
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const methods = [];
      const fields = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expect("Identifier" /* Identifier */, "Expected name").value;
        if (this.check("LeftParen" /* LeftParen */)) {
          this.advance();
          const params = this.parseParameterList();
          this.expect("RightParen" /* RightParen */, "Expected ')'");
          this.expect("Semicolon" /* Semicolon */, "Expected ';'");
          methods.push({ name: fname, params, returnType: type, span: fSpan });
        } else {
          this.expect("Semicolon" /* Semicolon */, "Expected ';'");
          fields.push({ name: fname, type, span: fSpan });
        }
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "InterfaceDeclaration", name, methods, fields, span };
    }
    parseEnumDeclaration() {
      const span = this.span();
      this.advance();
      const name = this.expect("Identifier" /* Identifier */, "Expected enum name").value;
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const variants = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        const vSpan = this.span();
        const vname = this.expect(
          "Identifier" /* Identifier */,
          "Expected variant name"
        ).value;
        let value;
        let fields;
        if (this.match("Assign" /* Assign */)) {
          value = this.parseExpression();
        } else if (this.match("LeftParen" /* LeftParen */)) {
          fields = [];
          if (!this.check("RightParen" /* RightParen */)) {
            const ftype = this.parseTypeAnnotation();
            const fname = this.expect(
              "Identifier" /* Identifier */,
              "Expected field name"
            ).value;
            fields.push({ name: fname, type: ftype });
            while (this.match("Comma" /* Comma */)) {
              const ft = this.parseTypeAnnotation();
              const fn = this.expect(
                "Identifier" /* Identifier */,
                "Expected field name"
              ).value;
              fields.push({ name: fn, type: ft });
            }
          }
          this.expect("RightParen" /* RightParen */, "Expected ')'");
        }
        variants.push({ name: vname, value, fields, span: vSpan });
        this.match("Comma" /* Comma */);
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "EnumDeclaration", name, variants, span };
    }
    parseDestructureDeclaration() {
      const span = this.span();
      this.advance();
      let pattern;
      const names = [];
      if (this.match("LeftBrace" /* LeftBrace */)) {
        pattern = "object";
        if (!this.check("RightBrace" /* RightBrace */)) {
          names.push(
            this.expect("Identifier" /* Identifier */, "Expected identifier").value
          );
          while (this.match("Comma" /* Comma */)) {
            names.push(
              this.expect("Identifier" /* Identifier */, "Expected identifier").value
            );
          }
        }
        this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      } else {
        this.advance();
        pattern = "array";
        if (!this.check("RightBracket" /* RightBracket */)) {
          names.push(
            this.expect("Identifier" /* Identifier */, "Expected identifier").value
          );
          while (this.match("Comma" /* Comma */)) {
            names.push(
              this.expect("Identifier" /* Identifier */, "Expected identifier").value
            );
          }
        }
        this.expect("RightBracket" /* RightBracket */, "Expected ']'");
      }
      this.expect("Assign" /* Assign */, "Expected '='");
      const initializer = this.parseExpression();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return {
        kind: "DestructureDeclaration",
        pattern,
        names,
        initializer,
        span
      };
    }
    parseTypeAlias() {
      const span = this.span();
      this.advance();
      const name = this.expect(
        "Identifier" /* Identifier */,
        "Expected type alias name"
      ).value;
      this.expect("Assign" /* Assign */, "Expected '='");
      const type = this.parseTypeAnnotation();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "TypeAlias", name, type, span };
    }
    parseTryCatch() {
      const span = this.span();
      this.advance();
      const tryBlock = this.parseBlock();
      this.expect("Catch" /* Catch */, "Expected 'catch'");
      let catchBinding;
      if (this.match("LeftParen" /* LeftParen */)) {
        catchBinding = this.expect(
          "Identifier" /* Identifier */,
          "Expected catch binding"
        ).value;
        this.expect("RightParen" /* RightParen */, "Expected ')'");
      }
      const catchBlock = this.parseBlock();
      return {
        kind: "TryCatchStatement",
        tryBlock,
        catchBinding,
        catchBlock,
        span
      };
    }
    parseMatchStatement() {
      const span = this.span();
      this.advance();
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      const subject = this.parseExpression();
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const arms = this.parseMatchArms();
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "MatchStatement", subject, arms, span };
    }
    parseMatchArms() {
      const arms = [];
      while (!this.check("RightBrace" /* RightBrace */) && !this.isAtEnd()) {
        arms.push(this.parseMatchArm());
      }
      return arms;
    }
    parseMatchArm() {
      const span = this.span();
      const pattern = this.parseMatchPattern();
      this.expect("Arrow" /* Arrow */, "Expected '=>'");
      let body;
      if (this.check("LeftBrace" /* LeftBrace */)) {
        body = this.parseBlock();
      } else {
        body = this.parseExpression();
        this.match("Comma" /* Comma */);
      }
      return { pattern, body, span };
    }
    parseMatchPattern() {
      const span = this.span();
      if (this.match("Ok" /* Ok */)) {
        this.expect("LeftParen" /* LeftParen */, "Expected '('");
        const binding = this.expect(
          "Identifier" /* Identifier */,
          "Expected binding"
        ).value;
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "OkPattern", binding, span };
      }
      if (this.match("Err" /* Err */)) {
        this.expect("LeftParen" /* LeftParen */, "Expected '('");
        const binding = this.expect(
          "Identifier" /* Identifier */,
          "Expected binding"
        ).value;
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "ErrPattern", binding, span };
      }
      if (this.check("Identifier" /* Identifier */) && this.peek().value === "_") {
        this.advance();
        return { kind: "WildcardPattern", span };
      }
      if (this.check("IntLiteral" /* IntLiteral */) || this.check("FloatLiteral" /* FloatLiteral */) || this.check("StringLiteral" /* StringLiteral */) || this.check("BoolLiteral" /* BoolLiteral */) || this.check("NullLiteral" /* NullLiteral */)) {
        const value = this.parsePrimary();
        return { kind: "LiteralPattern", value, span };
      }
      if (this.check("Identifier" /* Identifier */)) {
        const name = this.advance().value;
        if (this.match("Dot" /* Dot */)) {
          const variant = this.expect(
            "Identifier" /* Identifier */,
            "Expected variant name"
          ).value;
          const bindings = [];
          if (this.match("LeftParen" /* LeftParen */)) {
            if (!this.check("RightParen" /* RightParen */)) {
              bindings.push(
                this.expect("Identifier" /* Identifier */, "Expected binding name").value
              );
              while (this.match("Comma" /* Comma */)) {
                bindings.push(
                  this.expect("Identifier" /* Identifier */, "Expected binding name").value
                );
              }
            }
            this.expect("RightParen" /* RightParen */, "Expected ')'");
          }
          return {
            kind: "EnumVariantPattern",
            enumName: name,
            variant,
            bindings,
            span
          };
        }
        return { kind: "IdentifierPattern", name, span };
      }
      this.diagnostics.push(
        errorDiag(`Expected match pattern`, {
          file: this.file,
          line: span.line,
          column: span.column,
          offset: span.offset
        })
      );
      this.advance();
      return { kind: "WildcardPattern", span };
    }
    parseExpressionStatement() {
      const span = this.span();
      const expression = this.parseExpression();
      this.expect("Semicolon" /* Semicolon */, "Expected ';'");
      return { kind: "ExpressionStatement", expression, span };
    }
    // --- Expressions (Pratt parser) ---
    parseExpression() {
      return this.parseAssignment();
    }
    parseAssignment() {
      const expr = this.parseTernary();
      if (this.match("Assign" /* Assign */)) {
        const value = this.parseAssignment();
        return { kind: "AssignExpr", target: expr, value, span: expr.span };
      }
      const compoundOp = this.match(
        "PlusAssign" /* PlusAssign */,
        "MinusAssign" /* MinusAssign */,
        "StarAssign" /* StarAssign */,
        "SlashAssign" /* SlashAssign */,
        "PercentAssign" /* PercentAssign */
      );
      if (compoundOp) {
        const value = this.parseAssignment();
        return {
          kind: "CompoundAssignExpr",
          operator: compoundOp.value,
          target: expr,
          value,
          span: expr.span
        };
      }
      return expr;
    }
    parseTernary() {
      const expr = this.parsePipe();
      if (this.match("Question" /* Question */)) {
        const consequent = this.parseAssignment();
        this.expect("Colon" /* Colon */, "Expected ':' in ternary expression");
        const alternate = this.parseAssignment();
        return {
          kind: "TernaryExpr",
          condition: expr,
          consequent,
          alternate,
          span: expr.span
        };
      }
      return expr;
    }
    parsePipe() {
      let left = this.parseOr();
      while (this.match("PipeArrow" /* PipeArrow */)) {
        const right = this.parseOr();
        left = { kind: "PipeExpr", left, right, span: left.span };
      }
      return left;
    }
    parseOr() {
      let left = this.parseAnd();
      while (this.match("Or" /* Or */)) {
        const right = this.parseAnd();
        left = {
          kind: "BinaryExpr",
          operator: "||",
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseAnd() {
      let left = this.parseEquality();
      while (this.match("And" /* And */)) {
        const right = this.parseEquality();
        left = {
          kind: "BinaryExpr",
          operator: "&&",
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseEquality() {
      let left = this.parseComparison();
      while (true) {
        const op = this.match("Equal" /* Equal */, "NotEqual" /* NotEqual */);
        if (!op) break;
        const right = this.parseComparison();
        left = {
          kind: "BinaryExpr",
          operator: op.value,
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseComparison() {
      let left = this.parseRange();
      while (true) {
        const op = this.match(
          "Less" /* Less */,
          "LessEqual" /* LessEqual */,
          "Greater" /* Greater */,
          "GreaterEqual" /* GreaterEqual */
        );
        if (!op) break;
        const right = this.parseAddition();
        left = {
          kind: "BinaryExpr",
          operator: op.value,
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseRange() {
      const left = this.parseAddition();
      if (this.match("DotDot" /* DotDot */)) {
        const inclusive = this.match("Assign" /* Assign */) !== null;
        const end = this.parseAddition();
        return {
          kind: "RangeExpr",
          start: left,
          end,
          inclusive,
          span: left.span
        };
      }
      return left;
    }
    parseAddition() {
      let left = this.parseMultiplication();
      while (true) {
        const op = this.match("Plus" /* Plus */, "Minus" /* Minus */);
        if (!op) break;
        const right = this.parseMultiplication();
        left = {
          kind: "BinaryExpr",
          operator: op.value,
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseMultiplication() {
      let left = this.parseUnary();
      while (true) {
        const op = this.match("Star" /* Star */, "Slash" /* Slash */, "Percent" /* Percent */);
        if (!op) break;
        const right = this.parseUnary();
        left = {
          kind: "BinaryExpr",
          operator: op.value,
          left,
          right,
          span: left.span
        };
      }
      return left;
    }
    parseUnary() {
      const span = this.span();
      if (this.match("Not" /* Not */)) {
        const operand = this.parseUnary();
        return { kind: "UnaryExpr", operator: "!", operand, span };
      }
      if (this.match("Minus" /* Minus */)) {
        const operand = this.parseUnary();
        return { kind: "UnaryExpr", operator: "-", operand, span };
      }
      if (this.match("Spread" /* Spread */)) {
        const argument = this.parseUnary();
        return { kind: "SpreadExpr", argument, span };
      }
      return this.parsePostfix();
    }
    parsePostfix() {
      let expr = this.parsePrimary();
      while (true) {
        if (this.match("LeftParen" /* LeftParen */)) {
          const args = [];
          if (!this.check("RightParen" /* RightParen */)) {
            args.push(this.parseExpression());
            while (this.match("Comma" /* Comma */)) {
              args.push(this.parseExpression());
            }
          }
          this.expect("RightParen" /* RightParen */, "Expected ')'");
          expr = { kind: "CallExpr", callee: expr, args, span: expr.span };
        } else if (this.match("Dot" /* Dot */)) {
          const property = this.expect(
            "Identifier" /* Identifier */,
            "Expected property name"
          ).value;
          expr = {
            kind: "MemberExpr",
            object: expr,
            property,
            optional: false,
            span: expr.span
          };
        } else if (this.match("QuestionDot" /* QuestionDot */)) {
          const property = this.expect(
            "Identifier" /* Identifier */,
            "Expected property name"
          ).value;
          expr = {
            kind: "MemberExpr",
            object: expr,
            property,
            optional: true,
            span: expr.span
          };
        } else if (this.match("LeftBracket" /* LeftBracket */)) {
          const index = this.parseExpression();
          this.expect("RightBracket" /* RightBracket */, "Expected ']'");
          expr = { kind: "IndexExpr", object: expr, index, span: expr.span };
        } else if (this.match("PlusPlus" /* PlusPlus */)) {
          expr = {
            kind: "UpdateExpr",
            operator: "++",
            argument: expr,
            prefix: false,
            span: expr.span
          };
        } else if (this.match("MinusMinus" /* MinusMinus */)) {
          expr = {
            kind: "UpdateExpr",
            operator: "--",
            argument: expr,
            prefix: false,
            span: expr.span
          };
        } else {
          break;
        }
      }
      return expr;
    }
    parsePrimary() {
      const span = this.span();
      const tok = this.peek();
      if (this.match("IntLiteral" /* IntLiteral */)) {
        return { kind: "IntLiteral", value: parseInt(tok.value, 10), span };
      }
      if (this.match("FloatLiteral" /* FloatLiteral */)) {
        return { kind: "FloatLiteral", value: parseFloat(tok.value), span };
      }
      if (this.match("StringLiteral" /* StringLiteral */)) {
        return { kind: "StringLiteral", value: tok.value, span };
      }
      if (this.check("StringInterpStart" /* StringInterpStart */)) {
        return this.parseStringInterpolation();
      }
      if (this.match("BoolLiteral" /* BoolLiteral */)) {
        return { kind: "BoolLiteral", value: tok.value === "true", span };
      }
      if (this.match("NullLiteral" /* NullLiteral */)) {
        return { kind: "NullLiteral", span };
      }
      if (this.match("This" /* This */)) {
        return { kind: "ThisExpr", span };
      }
      if (this.check("Ok" /* Ok */)) {
        this.advance();
        this.expect("LeftParen" /* LeftParen */, "Expected '('");
        const value = this.parseExpression();
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "OkExpr", value, span };
      }
      if (this.check("Err" /* Err */)) {
        this.advance();
        this.expect("LeftParen" /* LeftParen */, "Expected '('");
        const value = this.parseExpression();
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "ErrExpr", value, span };
      }
      if (this.check("Match" /* Match */)) {
        return this.parseMatchExpression();
      }
      if (this.match("New" /* New */)) {
        const callee = this.parsePrimary();
        this.expect("LeftParen" /* LeftParen */, "Expected '('");
        const args = [];
        if (!this.check("RightParen" /* RightParen */)) {
          args.push(this.parseExpression());
          while (this.match("Comma" /* Comma */)) {
            args.push(this.parseExpression());
          }
        }
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "NewExpr", callee, args, span };
      }
      if (this.match("LeftBracket" /* LeftBracket */)) {
        const elements = [];
        if (!this.check("RightBracket" /* RightBracket */)) {
          elements.push(this.parseExpression());
          while (this.match("Comma" /* Comma */)) {
            if (this.check("RightBracket" /* RightBracket */)) break;
            elements.push(this.parseExpression());
          }
        }
        this.expect("RightBracket" /* RightBracket */, "Expected ']'");
        return { kind: "ArrayLiteral", elements, span };
      }
      if (this.check("LeftParen" /* LeftParen */)) {
        return this.parseParenOrArrow();
      }
      if (this.match("Identifier" /* Identifier */)) {
        return { kind: "Identifier", name: tok.value, span };
      }
      if (this.check("LeftBrace" /* LeftBrace */)) {
        return this.parseMapLiteral();
      }
      this.diagnostics.push(
        errorDiag(`Unexpected token '${tok.value}'`, {
          file: this.file,
          line: tok.line,
          column: tok.column,
          offset: tok.offset
        })
      );
      this.advance();
      return { kind: "Identifier", name: "__error__", span };
    }
    parseMapLiteral() {
      const span = this.span();
      this.advance();
      const entries = [];
      if (!this.check("RightBrace" /* RightBrace */)) {
        const key = this.parseExpression();
        this.expect("Colon" /* Colon */, "Expected ':'");
        const value = this.parseExpression();
        entries.push({ key, value });
        while (this.match("Comma" /* Comma */)) {
          if (this.check("RightBrace" /* RightBrace */)) break;
          const k = this.parseExpression();
          this.expect("Colon" /* Colon */, "Expected ':'");
          const v = this.parseExpression();
          entries.push({ key: k, value: v });
        }
      }
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "MapLiteral", entries, span };
    }
    parseMatchExpression() {
      const span = this.span();
      this.advance();
      this.expect("LeftParen" /* LeftParen */, "Expected '('");
      const subject = this.parseExpression();
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      this.expect("LeftBrace" /* LeftBrace */, "Expected '{'");
      const arms = this.parseMatchArms();
      this.expect("RightBrace" /* RightBrace */, "Expected '}'");
      return { kind: "MatchExpr", subject, arms, span };
    }
    parseParenOrArrow() {
      const saved = this.pos;
      if (this.tryParseArrowFunction()) {
        return this.tryParseArrowFunction();
      }
      this.pos = saved;
      const arrowResult = this.speculativeArrowParse();
      if (arrowResult) return arrowResult;
      const span = this.span();
      this.advance();
      const first = this.parseExpression();
      if (this.match("Comma" /* Comma */)) {
        const elements = [first];
        elements.push(this.parseExpression());
        while (this.match("Comma" /* Comma */)) {
          elements.push(this.parseExpression());
        }
        this.expect("RightParen" /* RightParen */, "Expected ')'");
        return { kind: "TupleLiteral", elements, span };
      }
      this.expect("RightParen" /* RightParen */, "Expected ')'");
      return first;
    }
    tryParseArrowFunction() {
      let depth = 0;
      let i = this.pos;
      while (i < this.tokens.length) {
        const t = this.tokens[i].type;
        if (t === "LeftParen" /* LeftParen */) depth++;
        else if (t === "RightParen" /* RightParen */) {
          depth--;
          if (depth === 0) {
            if (i + 1 < this.tokens.length && this.tokens[i + 1].type === "Arrow" /* Arrow */) {
              return null;
            }
            return null;
          }
        }
        i++;
      }
      return null;
    }
    speculativeArrowParse() {
      const saved = this.pos;
      const savedDiags = this.diagnostics.length;
      let depth = 0;
      let i = this.pos;
      while (i < this.tokens.length) {
        const t = this.tokens[i].type;
        if (t === "LeftParen" /* LeftParen */) depth++;
        else if (t === "RightParen" /* RightParen */) {
          depth--;
          if (depth === 0) {
            if (i + 1 < this.tokens.length && this.tokens[i + 1].type === "Arrow" /* Arrow */) {
              const span = this.span();
              this.advance();
              const params = this.parseArrowParams();
              this.expect("RightParen" /* RightParen */, "Expected ')'");
              this.expect("Arrow" /* Arrow */, "Expected '=>'");
              let body;
              if (this.check("LeftBrace" /* LeftBrace */)) {
                body = this.parseBlock();
              } else {
                body = this.parseExpression();
              }
              return { kind: "ArrowFunction", params, body, span };
            }
            break;
          }
        }
        i++;
      }
      this.pos = saved;
      this.diagnostics.length = savedDiags;
      return null;
    }
    parseArrowParams() {
      const params = [];
      if (!this.check("RightParen" /* RightParen */)) {
        params.push(this.parseArrowParam());
        while (this.match("Comma" /* Comma */)) {
          params.push(this.parseArrowParam());
        }
      }
      return params;
    }
    parseArrowParam() {
      const span = this.span();
      if (this.isTypeStart() && this.lookAhead(1) === "Identifier" /* Identifier */) {
        const type = this.parseTypeAnnotation();
        const name2 = this.expect(
          "Identifier" /* Identifier */,
          "Expected parameter name"
        ).value;
        return { name: name2, type, span };
      }
      const name = this.expect(
        "Identifier" /* Identifier */,
        "Expected parameter name"
      ).value;
      return { name, span };
    }
    parseStringInterpolation() {
      const span = this.span();
      const parts = [];
      const startTok = this.advance();
      if (startTok.value) parts.push(startTok.value);
      parts.push(this.parseExpression());
      while (this.check("StringInterpMiddle" /* StringInterpMiddle */)) {
        const mid = this.advance();
        if (mid.value) parts.push(mid.value);
        parts.push(this.parseExpression());
      }
      if (this.check("StringInterpEnd" /* StringInterpEnd */)) {
        const end = this.advance();
        if (end.value) parts.push(end.value);
      } else {
        this.expect(
          "StringInterpEnd" /* StringInterpEnd */,
          "Expected end of interpolated string"
        );
      }
      return { kind: "StringInterpolation", parts, span };
    }
  };

  // src/checker/environment.ts
  var TypeEnvironment = class {
    constructor() {
      __publicField(this, "scopes", [/* @__PURE__ */ new Map()]);
      __publicField(this, "typeRegistry", /* @__PURE__ */ new Map());
    }
    enterScope() {
      this.scopes.push(/* @__PURE__ */ new Map());
    }
    exitScope() {
      if (this.scopes.length > 1) {
        this.scopes.pop();
      }
    }
    define(name, type) {
      this.scopes[this.scopes.length - 1].set(name, type);
    }
    lookup(name) {
      for (let i = this.scopes.length - 1; i >= 0; i--) {
        const t = this.scopes[i].get(name);
        if (t !== void 0) return t;
      }
      return void 0;
    }
    isDefined(name) {
      return this.lookup(name) !== void 0;
    }
    registerType(name, type) {
      this.typeRegistry.set(name, type);
    }
    lookupType(name) {
      return this.typeRegistry.get(name);
    }
    /** Returns all variable names visible in the current scope chain. */
    allNames() {
      const names = /* @__PURE__ */ new Set();
      for (let i = this.scopes.length - 1; i >= 0; i--) {
        for (const key of this.scopes[i].keys()) {
          names.add(key);
        }
      }
      return [...names];
    }
    /** Returns all registered type names. */
    allTypeNames() {
      return [...this.typeRegistry.keys()];
    }
  };

  // src/checker/types.ts
  var NK_INT = { tag: "int" };
  var NK_FLOAT = { tag: "float" };
  var NK_STRING = { tag: "string" };
  var NK_BOOL = { tag: "bool" };
  var NK_VOID = { tag: "void" };
  var NK_NULL = { tag: "null" };
  var NK_ANY = { tag: "any" };
  function typeToString(t) {
    switch (t.tag) {
      case "int":
        return "int";
      case "float":
        return "float";
      case "string":
        return "string";
      case "bool":
        return "bool";
      case "void":
        return "void";
      case "null":
        return "null";
      case "any":
        return "any";
      case "array":
        return `${typeToString(t.elementType)}[]`;
      case "map":
        return `map<${typeToString(t.keyType)}, ${typeToString(t.valueType)}>`;
      case "function": {
        const params = t.params.map(typeToString).join(", ");
        return `(${params}) => ${typeToString(t.returnType)}`;
      }
      case "struct":
        return t.name;
      case "class":
        return t.name;
      case "interface":
        return t.name;
      case "result":
        return `Result<${typeToString(t.okType)}, ${typeToString(t.errType)}>`;
      case "nullable":
        return `${typeToString(t.innerType)}?`;
      case "enum":
        return t.name;
      case "tuple": {
        const elems = t.elements.map(typeToString).join(", ");
        return `(${elems})`;
      }
    }
  }
  function isAssignable(target, source) {
    if (target.tag === "any" || source.tag === "any") return true;
    if (target.tag === source.tag) {
      if (target.tag === "array" && source.tag === "array") {
        return isAssignable(target.elementType, source.elementType);
      }
      if (target.tag === "map" && source.tag === "map") {
        return isAssignable(target.keyType, source.keyType) && isAssignable(target.valueType, source.valueType);
      }
      if (target.tag === "nullable" && source.tag === "nullable") {
        return isAssignable(target.innerType, source.innerType);
      }
      if (target.tag === "result" && source.tag === "result") {
        return isAssignable(target.okType, source.okType) && isAssignable(target.errType, source.errType);
      }
      if (target.tag === "struct" && source.tag === "struct")
        return target.name === source.name;
      if (target.tag === "class" && source.tag === "class")
        return target.name === source.name;
      if (target.tag === "enum" && source.tag === "enum")
        return target.name === source.name;
      if (target.tag === "tuple" && source.tag === "tuple") {
        if (target.elements.length !== source.elements.length) return false;
        return target.elements.every(
          (te, i) => isAssignable(te, source.elements[i])
        );
      }
      return true;
    }
    if (target.tag === "float" && source.tag === "int") return true;
    if (target.tag === "nullable" && source.tag === "null") return true;
    if (target.tag === "nullable") return isAssignable(target.innerType, source);
    return false;
  }

  // src/checker/checker.ts
  var TypeChecker = class {
    constructor(file = "<stdin>") {
      __publicField(this, "diagnostics", []);
      __publicField(this, "typeMap", /* @__PURE__ */ new Map());
      __publicField(this, "symbolMap", /* @__PURE__ */ new Map());
      __publicField(this, "env", new TypeEnvironment());
      __publicField(this, "file");
      __publicField(this, "currentReturnType");
      this.file = file;
      this.registerStdlib();
    }
    check(program) {
      for (const stmt of program.body) {
        this.checkStatement(stmt);
      }
    }
    registerStdlib() {
      this.env.define("print", {
        tag: "function",
        params: [NK_ANY],
        returnType: NK_VOID
      });
      this.env.define("http", NK_ANY);
      this.env.define("json", NK_ANY);
      this.env.define("math", NK_ANY);
    }
    error(message, node, hint) {
      this.diagnostics.push(
        errorDiag(
          message,
          {
            file: this.file,
            line: node.span.line,
            column: node.span.column,
            offset: node.span.offset
          },
          hint
        )
      );
    }
    warn(message, node, hint) {
      this.diagnostics.push(
        warnDiag(
          message,
          {
            file: this.file,
            line: node.span.line,
            column: node.span.column,
            offset: node.span.offset
          },
          hint
        )
      );
    }
    /** Find the closest matching name for a "did you mean?" suggestion. */
    suggestName(name) {
      const candidates = this.env.allNames();
      return findClosest(name, candidates);
    }
    /** Find the closest matching type name. */
    suggestType(name) {
      const builtins = ["int", "float", "string", "bool", "void"];
      const registered = this.env.allTypeNames();
      return findClosest(name, [...builtins, ...registered]);
    }
    recordType(expr, type) {
      this.typeMap.set(expr.span.offset, type);
      return type;
    }
    recordSymbol(name, type, offset) {
      let entries = this.symbolMap.get(name);
      if (!entries) {
        entries = [];
        this.symbolMap.set(name, entries);
      }
      entries.push({ type, offset });
    }
    // --- Resolve type annotations ---
    resolveType(ann) {
      switch (ann.kind) {
        case "NamedType":
          return this.resolveNamedType(ann.name);
        case "ArrayType":
          return { tag: "array", elementType: this.resolveType(ann.elementType) };
        case "NullableType":
          return { tag: "nullable", innerType: this.resolveType(ann.innerType) };
        case "GenericType":
          if (ann.name === "Result" && ann.typeArgs.length === 2) {
            return {
              tag: "result",
              okType: this.resolveType(ann.typeArgs[0]),
              errType: this.resolveType(ann.typeArgs[1])
            };
          }
          if (ann.name === "map" && ann.typeArgs.length === 2) {
            return {
              tag: "map",
              keyType: this.resolveType(ann.typeArgs[0]),
              valueType: this.resolveType(ann.typeArgs[1])
            };
          }
          return NK_ANY;
        case "FunctionType": {
          const params = ann.params.map((p) => this.resolveType(p));
          const returnType = this.resolveType(ann.returnType);
          return { tag: "function", params, returnType };
        }
        case "TupleType": {
          const elements = ann.elements.map((e) => this.resolveType(e));
          return { tag: "tuple", elements };
        }
      }
    }
    resolveNamedType(name) {
      switch (name) {
        case "int":
          return NK_INT;
        case "float":
          return NK_FLOAT;
        case "string":
          return NK_STRING;
        case "bool":
          return NK_BOOL;
        case "void":
          return NK_VOID;
        default: {
          const registered = this.env.lookupType(name);
          if (registered) return registered;
          return NK_ANY;
        }
      }
    }
    // --- Statements ---
    checkStatement(stmt) {
      switch (stmt.kind) {
        case "VariableDeclaration": {
          const initType = this.checkExpression(stmt.initializer);
          if (stmt.type) {
            const declaredType = this.resolveType(stmt.type);
            if (!isAssignable(declaredType, initType)) {
              const hint = typeMismatchHint(declaredType, initType);
              this.error(
                `Type '${typeToString(initType)}' is not assignable to type '${typeToString(declaredType)}'`,
                stmt,
                hint
              );
            }
            this.env.define(stmt.name, declaredType);
            this.recordSymbol(stmt.name, declaredType, stmt.span.offset);
          } else {
            this.env.define(stmt.name, initType);
            this.recordSymbol(stmt.name, initType, stmt.span.offset);
          }
          break;
        }
        case "FunctionDeclaration": {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp, NK_ANY);
          }
          const paramTypes = stmt.params.map(
            (p) => p.type ? this.resolveType(p.type) : NK_ANY
          );
          const returnType = stmt.returnType ? this.resolveType(stmt.returnType) : NK_VOID;
          const fnType = {
            tag: "function",
            params: paramTypes,
            returnType
          };
          this.env.exitScope();
          this.env.define(stmt.name, fnType);
          this.recordSymbol(stmt.name, fnType, stmt.span.offset);
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp, NK_ANY);
          }
          for (let i = 0; i < stmt.params.length; i++) {
            this.env.define(stmt.params[i].name, paramTypes[i]);
          }
          const prevReturn = this.currentReturnType;
          this.currentReturnType = returnType;
          this.checkStatement(stmt.body);
          this.currentReturnType = prevReturn;
          this.env.exitScope();
          break;
        }
        case "ReturnStatement": {
          if (stmt.value) {
            const valType = this.checkExpression(stmt.value);
            if (this.currentReturnType && !isAssignable(this.currentReturnType, valType)) {
              const hint = typeMismatchHint(this.currentReturnType, valType);
              this.error(
                `Return type '${typeToString(valType)}' is not assignable to '${typeToString(this.currentReturnType)}'`,
                stmt,
                hint
              );
            }
          }
          break;
        }
        case "IfStatement":
          this.checkExpression(stmt.condition);
          this.checkStatement(stmt.consequent);
          if (stmt.alternate) this.checkStatement(stmt.alternate);
          break;
        case "WhileStatement":
          this.checkExpression(stmt.condition);
          this.checkStatement(stmt.body);
          break;
        case "ForStatement":
          this.env.enterScope();
          if (stmt.init) this.checkStatement(stmt.init);
          if (stmt.condition) this.checkExpression(stmt.condition);
          if (stmt.update) this.checkExpression(stmt.update);
          this.checkStatement(stmt.body);
          this.env.exitScope();
          break;
        case "ForInStatement": {
          this.env.enterScope();
          const iterableType = this.checkExpression(stmt.iterable);
          let elemType = NK_ANY;
          if (iterableType.tag === "array") {
            elemType = iterableType.elementType;
          }
          this.env.define(stmt.variable, elemType);
          this.checkStatement(stmt.body);
          this.env.exitScope();
          break;
        }
        case "BlockStatement":
          this.env.enterScope();
          for (const s of stmt.body) this.checkStatement(s);
          this.env.exitScope();
          break;
        case "ExpressionStatement":
          this.checkExpression(stmt.expression);
          break;
        case "StructDeclaration": {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp, NK_ANY);
          }
          const fields = /* @__PURE__ */ new Map();
          for (const f of stmt.fields) {
            fields.set(f.name, this.resolveType(f.type));
          }
          const methods = /* @__PURE__ */ new Map();
          for (const m of stmt.methods) {
            const paramTypes = m.params.map(
              (p) => p.type ? this.resolveType(p.type) : NK_ANY
            );
            const retType = m.returnType ? this.resolveType(m.returnType) : NK_VOID;
            methods.set(m.name, {
              tag: "function",
              params: paramTypes,
              returnType: retType
            });
          }
          const structType = {
            tag: "struct",
            name: stmt.name,
            fields,
            methods
          };
          this.env.exitScope();
          this.env.define(stmt.name, structType);
          this.env.registerType(stmt.name, structType);
          this.recordSymbol(stmt.name, structType, stmt.span.offset);
          for (const m of stmt.methods) {
            this.env.enterScope();
            for (const tp of stmt.typeParams) {
              this.env.registerType(tp, NK_ANY);
            }
            this.env.define("this", structType);
            for (const p of m.params) {
              this.env.define(p.name, p.type ? this.resolveType(p.type) : NK_ANY);
            }
            const prevReturn = this.currentReturnType;
            this.currentReturnType = m.returnType ? this.resolveType(m.returnType) : NK_VOID;
            this.checkStatement(m.body);
            this.currentReturnType = prevReturn;
            this.env.exitScope();
          }
          break;
        }
        case "ClassDeclaration": {
          this.env.enterScope();
          for (const tp of stmt.typeParams) {
            this.env.registerType(tp, NK_ANY);
          }
          const fields = /* @__PURE__ */ new Map();
          for (const f of stmt.fields) {
            fields.set(f.name, this.resolveType(f.type));
          }
          const methods = /* @__PURE__ */ new Map();
          for (const m of stmt.methods) {
            const paramTypes = m.params.map(
              (p) => p.type ? this.resolveType(p.type) : NK_ANY
            );
            const retType = m.returnType ? this.resolveType(m.returnType) : NK_VOID;
            methods.set(m.name, {
              tag: "function",
              params: paramTypes,
              returnType: retType
            });
          }
          const classType = {
            tag: "class",
            name: stmt.name,
            superClass: stmt.superClass,
            fields,
            methods
          };
          this.env.exitScope();
          this.env.define(stmt.name, classType);
          this.env.registerType(stmt.name, classType);
          this.recordSymbol(stmt.name, classType, stmt.span.offset);
          for (const m of stmt.methods) {
            this.env.enterScope();
            for (const tp of stmt.typeParams) {
              this.env.registerType(tp, NK_ANY);
            }
            this.env.define("this", classType);
            for (const p of m.params) {
              this.env.define(p.name, p.type ? this.resolveType(p.type) : NK_ANY);
            }
            const prevReturn = this.currentReturnType;
            this.currentReturnType = m.returnType ? this.resolveType(m.returnType) : NK_VOID;
            this.checkStatement(m.body);
            this.currentReturnType = prevReturn;
            this.env.exitScope();
          }
          break;
        }
        case "InterfaceDeclaration": {
          const methods = /* @__PURE__ */ new Map();
          for (const m of stmt.methods) {
            const paramTypes = m.params.map(
              (p) => p.type ? this.resolveType(p.type) : NK_ANY
            );
            const retType = m.returnType ? this.resolveType(m.returnType) : NK_VOID;
            methods.set(m.name, {
              tag: "function",
              params: paramTypes,
              returnType: retType
            });
          }
          const ifaceFields = /* @__PURE__ */ new Map();
          for (const f of stmt.fields) {
            ifaceFields.set(f.name, this.resolveType(f.type));
          }
          const ifaceType = {
            tag: "interface",
            name: stmt.name,
            methods,
            fields: ifaceFields
          };
          this.env.define(stmt.name, ifaceType);
          this.env.registerType(stmt.name, ifaceType);
          this.recordSymbol(stmt.name, ifaceType, stmt.span.offset);
          break;
        }
        case "EnumDeclaration": {
          const variantFields = /* @__PURE__ */ new Map();
          for (const v of stmt.variants) {
            if (v.fields && v.fields.length > 0) {
              variantFields.set(
                v.name,
                v.fields.map((f) => this.resolveType(f.type))
              );
            }
          }
          const enumType = {
            tag: "enum",
            name: stmt.name,
            variants: stmt.variants.map((v) => v.name),
            variantFields
          };
          this.env.define(stmt.name, enumType);
          this.env.registerType(stmt.name, enumType);
          this.recordSymbol(stmt.name, enumType, stmt.span.offset);
          break;
        }
        case "TypeAlias": {
          const aliasedType = this.resolveType(stmt.type);
          this.env.registerType(stmt.name, aliasedType);
          break;
        }
        case "TakeStatement":
          for (const name of stmt.names) {
            this.env.define(name, NK_ANY);
          }
          break;
        case "LoadStatement":
          this.env.define(stmt.name, NK_ANY);
          break;
        case "TryCatchStatement":
          this.checkStatement(stmt.tryBlock);
          this.env.enterScope();
          if (stmt.catchBinding) {
            this.env.define(stmt.catchBinding, NK_ANY);
          }
          this.checkStatement(stmt.catchBlock);
          this.env.exitScope();
          break;
        case "MatchStatement":
          this.checkExpression(stmt.subject);
          for (const arm of stmt.arms) {
            this.env.enterScope();
            this.bindMatchPattern(arm.pattern);
            if (arm.body.kind === "BlockStatement") {
              this.checkStatement(arm.body);
            } else {
              this.checkExpression(arm.body);
            }
            this.env.exitScope();
          }
          break;
        case "DestructureDeclaration": {
          const initType = this.checkExpression(stmt.initializer);
          for (const name of stmt.names) {
            if (stmt.pattern === "array" && initType.tag === "array") {
              this.env.define(name, initType.elementType);
            } else if (stmt.pattern === "object" && (initType.tag === "struct" || initType.tag === "class")) {
              const fieldType = initType.fields.get(name);
              this.env.define(name, fieldType ?? NK_ANY);
            } else {
              this.env.define(name, NK_ANY);
            }
          }
          break;
        }
        case "BreakStatement":
        case "ContinueStatement":
          break;
      }
    }
    bindMatchPattern(pattern) {
      if ("binding" in pattern && pattern.binding) {
        this.env.define(pattern.binding, NK_ANY);
      }
      if (pattern.kind === "IdentifierPattern" && "name" in pattern && pattern.name) {
        this.env.define(pattern.name, NK_ANY);
      }
      if (pattern.kind === "EnumVariantPattern" && "bindings" in pattern && pattern.bindings) {
        for (const b of pattern.bindings) {
          this.env.define(b, NK_ANY);
        }
      }
    }
    // --- Expressions ---
    checkExpression(expr) {
      const type = this.checkExpressionInner(expr);
      return this.recordType(expr, type);
    }
    checkExpressionInner(expr) {
      switch (expr.kind) {
        case "IntLiteral":
          return NK_INT;
        case "FloatLiteral":
          return NK_FLOAT;
        case "StringLiteral":
          return NK_STRING;
        case "BoolLiteral":
          return NK_BOOL;
        case "NullLiteral":
          return NK_NULL;
        case "Identifier": {
          const t = this.env.lookup(expr.name);
          if (!t) {
            const suggestion = this.suggestName(expr.name);
            this.error(
              `Undefined variable '${expr.name}'`,
              expr,
              suggestion ? `Did you mean '${suggestion}'?` : void 0
            );
            return NK_ANY;
          }
          return t;
        }
        case "BinaryExpr": {
          const left = this.checkExpression(expr.left);
          const right = this.checkExpression(expr.right);
          if (expr.operator === "+" || expr.operator === "-" || expr.operator === "*" || expr.operator === "/" || expr.operator === "%") {
            if (left.tag === "string" && expr.operator === "+") return NK_STRING;
            if (isNumeric(left) && isNumeric(right)) {
              return left.tag === "float" || right.tag === "float" ? NK_FLOAT : NK_INT;
            }
            if (left.tag !== "any" && right.tag !== "any") {
              let hint;
              if (expr.operator === "+" && (left.tag === "string" || right.tag === "string")) {
                hint = 'Use string interpolation: "${value}" to concatenate mixed types';
              }
              this.error(
                `Operator '${expr.operator}' cannot be applied to '${typeToString(left)}' and '${typeToString(right)}'`,
                expr,
                hint
              );
            }
            return NK_ANY;
          }
          if (expr.operator === "==" || expr.operator === "!=" || expr.operator === "<" || expr.operator === "<=" || expr.operator === ">" || expr.operator === ">=") {
            return NK_BOOL;
          }
          if (expr.operator === "&&" || expr.operator === "||") {
            return NK_BOOL;
          }
          return NK_ANY;
        }
        case "UnaryExpr": {
          const operand = this.checkExpression(expr.operand);
          if (expr.operator === "!") return NK_BOOL;
          if (expr.operator === "-") {
            if (isNumeric(operand)) return operand;
            return NK_ANY;
          }
          return NK_ANY;
        }
        case "CallExpr": {
          const calleeType = this.checkExpression(expr.callee);
          for (const arg of expr.args) {
            this.checkExpression(arg);
          }
          if (calleeType.tag === "function") {
            if (expr.args.length !== calleeType.params.length) {
              if (!(expr.callee.kind === "Identifier" && expr.callee.name === "print")) {
                const fnName = expr.callee.kind === "Identifier" ? expr.callee.name : "function";
                const paramStr = calleeType.params.map((p) => typeToString(p)).join(", ");
                this.error(
                  `Expected ${calleeType.params.length} arguments, got ${expr.args.length}`,
                  expr,
                  `'${fnName}' expects (${paramStr})`
                );
              }
            }
            return calleeType.returnType;
          }
          return NK_ANY;
        }
        case "MemberExpr": {
          const objType = this.checkExpression(expr.object);
          if (objType.tag === "struct" || objType.tag === "class") {
            const fieldType = objType.fields.get(expr.property);
            if (fieldType) return fieldType;
            const methodType = objType.methods.get(expr.property);
            if (methodType) return methodType;
          }
          if (objType.tag === "array") {
            const elem = objType.elementType;
            switch (expr.property) {
              case "length":
                return NK_INT;
              case "push":
              case "pop":
              case "shift":
              case "unshift":
                return { tag: "function", params: [elem], returnType: NK_INT };
              case "map":
              case "filter":
              case "forEach":
                return {
                  tag: "function",
                  params: [NK_ANY],
                  returnType: { tag: "array", elementType: NK_ANY }
                };
              case "includes":
                return { tag: "function", params: [elem], returnType: NK_BOOL };
              case "indexOf":
                return { tag: "function", params: [elem], returnType: NK_INT };
              case "slice":
              case "concat":
                return { tag: "function", params: [NK_INT], returnType: objType };
              case "join":
                return {
                  tag: "function",
                  params: [NK_STRING],
                  returnType: NK_STRING
                };
            }
          }
          if (objType.tag === "string") {
            switch (expr.property) {
              case "length":
                return NK_INT;
              case "includes":
              case "startsWith":
              case "endsWith":
                return {
                  tag: "function",
                  params: [NK_STRING],
                  returnType: NK_BOOL
                };
              case "indexOf":
              case "lastIndexOf":
                return {
                  tag: "function",
                  params: [NK_STRING],
                  returnType: NK_INT
                };
              case "toLowerCase":
              case "toUpperCase":
              case "trim":
              case "trimStart":
              case "trimEnd":
                return {
                  tag: "function",
                  params: [],
                  returnType: NK_STRING
                };
              case "slice":
              case "substring":
              case "replace":
              case "replaceAll":
                return {
                  tag: "function",
                  params: [NK_STRING],
                  returnType: NK_STRING
                };
              case "split":
                return {
                  tag: "function",
                  params: [NK_STRING],
                  returnType: { tag: "array", elementType: NK_STRING }
                };
              case "charAt":
                return {
                  tag: "function",
                  params: [NK_INT],
                  returnType: NK_STRING
                };
            }
          }
          if (objType.tag === "enum") {
            if (objType.variants.includes(expr.property)) {
              const fields = objType.variantFields.get(expr.property);
              if (fields && fields.length > 0) {
                return {
                  tag: "function",
                  params: fields,
                  returnType: objType
                };
              }
              return objType;
            }
          }
          if (objType.tag === "map") {
            const val = objType.valueType;
            switch (expr.property) {
              case "size":
                return NK_INT;
              case "has":
                return {
                  tag: "function",
                  params: [objType.keyType],
                  returnType: NK_BOOL
                };
              case "get":
                return {
                  tag: "function",
                  params: [objType.keyType],
                  returnType: val
                };
              case "set":
                return {
                  tag: "function",
                  params: [objType.keyType, val],
                  returnType: NK_VOID
                };
              case "delete":
                return {
                  tag: "function",
                  params: [objType.keyType],
                  returnType: NK_BOOL
                };
              case "keys":
                return {
                  tag: "function",
                  params: [],
                  returnType: { tag: "array", elementType: objType.keyType }
                };
              case "values":
                return {
                  tag: "function",
                  params: [],
                  returnType: { tag: "array", elementType: val }
                };
              case "clear":
                return { tag: "function", params: [], returnType: NK_VOID };
            }
          }
          return NK_ANY;
        }
        case "IndexExpr": {
          const objType2 = this.checkExpression(expr.object);
          this.checkExpression(expr.index);
          if (objType2.tag === "array") return objType2.elementType;
          if (objType2.tag === "string") return NK_STRING;
          if (objType2.tag === "map") return objType2.valueType;
          return NK_ANY;
        }
        case "AssignExpr": {
          const targetType = this.checkExpression(expr.target);
          const valueType = this.checkExpression(expr.value);
          if (targetType.tag !== "any" && !isAssignable(targetType, valueType)) {
            const hint = typeMismatchHint(targetType, valueType);
            this.error(
              `Type '${typeToString(valueType)}' is not assignable to type '${typeToString(targetType)}'`,
              expr,
              hint
            );
          }
          return targetType;
        }
        case "ArrowFunction": {
          const paramTypes = expr.params.map(
            (p) => p.type ? this.resolveType(p.type) : NK_ANY
          );
          this.env.enterScope();
          for (let i = 0; i < expr.params.length; i++) {
            this.env.define(expr.params[i].name, paramTypes[i]);
          }
          let retType;
          if (expr.body.kind === "BlockStatement") {
            this.checkStatement(expr.body);
            retType = NK_VOID;
          } else {
            retType = this.checkExpression(expr.body);
          }
          this.env.exitScope();
          return { tag: "function", params: paramTypes, returnType: retType };
        }
        case "NewExpr": {
          const calleeType = this.checkExpression(expr.callee);
          for (const arg of expr.args) {
            this.checkExpression(arg);
          }
          if (calleeType.tag === "struct" || calleeType.tag === "class") {
            return calleeType;
          }
          return NK_ANY;
        }
        case "ThisExpr": {
          const thisType = this.env.lookup("this");
          if (!thisType) {
            this.error(
              "'this' used outside of a class or struct",
              expr,
              "'this' is only available inside struct or class methods"
            );
            return NK_ANY;
          }
          return thisType;
        }
        case "ArrayLiteral": {
          if (expr.elements.length === 0)
            return { tag: "array", elementType: NK_ANY };
          const elemType = this.checkExpression(expr.elements[0]);
          for (let i = 1; i < expr.elements.length; i++) {
            this.checkExpression(expr.elements[i]);
          }
          return { tag: "array", elementType: elemType };
        }
        case "MapLiteral": {
          if (expr.entries.length === 0)
            return { tag: "map", keyType: NK_ANY, valueType: NK_ANY };
          const keyType = this.checkExpression(expr.entries[0].key);
          const valueType = this.checkExpression(expr.entries[0].value);
          for (let i = 1; i < expr.entries.length; i++) {
            this.checkExpression(expr.entries[i].key);
            this.checkExpression(expr.entries[i].value);
          }
          return { tag: "map", keyType, valueType };
        }
        case "OkExpr": {
          const valType = this.checkExpression(expr.value);
          return { tag: "result", okType: valType, errType: NK_ANY };
        }
        case "ErrExpr": {
          const valType = this.checkExpression(expr.value);
          return { tag: "result", okType: NK_ANY, errType: valType };
        }
        case "MatchExpr": {
          this.checkExpression(expr.subject);
          let resultType = NK_ANY;
          for (const arm of expr.arms) {
            this.env.enterScope();
            this.bindMatchPattern(arm.pattern);
            if (arm.body.kind === "BlockStatement") {
              this.checkStatement(arm.body);
            } else {
              resultType = this.checkExpression(arm.body);
            }
            this.env.exitScope();
          }
          return resultType;
        }
        case "StringInterpolation": {
          for (const part of expr.parts) {
            if (typeof part !== "string") {
              this.checkExpression(part);
            }
          }
          return NK_STRING;
        }
        case "CompoundAssignExpr": {
          const targetType = this.checkExpression(expr.target);
          this.checkExpression(expr.value);
          return targetType;
        }
        case "UpdateExpr":
          return this.checkExpression(expr.argument);
        case "TernaryExpr": {
          this.checkExpression(expr.condition);
          const consType = this.checkExpression(expr.consequent);
          this.checkExpression(expr.alternate);
          return consType;
        }
        case "SpreadExpr":
          return this.checkExpression(expr.argument);
        case "PipeExpr": {
          this.checkExpression(expr.left);
          const pipeRight = this.checkExpression(expr.right);
          if (pipeRight.tag === "function") {
            return pipeRight.returnType;
          }
          return NK_ANY;
        }
        case "RangeExpr": {
          this.checkExpression(expr.start);
          this.checkExpression(expr.end);
          return { tag: "array", elementType: NK_INT };
        }
        case "TupleLiteral": {
          const elements = expr.elements.map((e) => this.checkExpression(e));
          return { tag: "tuple", elements };
        }
      }
    }
  };
  function isNumeric(t) {
    return t.tag === "int" || t.tag === "float";
  }
  function editDistance(a, b) {
    const la = a.length;
    const lb = b.length;
    const dp = Array.from(
      { length: la + 1 },
      () => Array(lb + 1).fill(0)
    );
    for (let i = 0; i <= la; i++) dp[i][0] = i;
    for (let j = 0; j <= lb; j++) dp[0][j] = j;
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[la][lb];
  }
  function findClosest(name, candidates) {
    let best;
    let bestDist = 4;
    for (const c of candidates) {
      if (c === name) continue;
      const d = editDistance(name.toLowerCase(), c.toLowerCase());
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }
  function typeMismatchHint(expected, actual) {
    if (expected.tag === "int" && actual.tag === "float") {
      return "Implicit float-to-int conversion is not allowed; use an explicit cast";
    }
    if (expected.tag === "string" && (actual.tag === "int" || actual.tag === "float")) {
      return 'Use string interpolation: "${value}" to convert numbers to strings';
    }
    if ((expected.tag === "int" || expected.tag === "float") && actual.tag === "string") {
      return "Strings cannot be implicitly converted to numbers";
    }
    if (expected.tag !== "nullable" && actual.tag === "nullable") {
      return `Use a null check before assigning a nullable value to '${typeToString(expected)}'`;
    }
    if (expected.tag === "bool" && actual.tag !== "bool") {
      return "Use a comparison operator (==, !=, <, >) to produce a bool value";
    }
    return void 0;
  }

  // src/codegen/js-runtime.ts
  var NK_RUNTIME = `
function __nk_Ok(value) { return { __tag: "Ok", value }; }
function __nk_Err(value) { return { __tag: "Err", value }; }
`.trim();
  var NK_HTTP_RUNTIME = `
const __nk_http = {
  async get(url) {
    const res = await fetch(url);
    const body = await res.text();
    return { status: res.status, body };
  },
  async post(url, data) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.text();
    return { status: res.status, body };
  }
};
`.trim();
  var NK_JSON_RUNTIME = `
const __nk_json = {
  encode(value) { return JSON.stringify(value); },
  decode(str) { return JSON.parse(str); }
};
`.trim();
  var NK_RANGE_RUNTIME = `
function __nk_range(start, end, inclusive) {
  const arr = [];
  const stop = inclusive ? end + 1 : end;
  for (let i = start; i < stop; i++) arr.push(i);
  return arr;
}
`.trim();

  // src/codegen/codegen.ts
  var CodeGenerator = class {
    constructor() {
      __publicField(this, "output", []);
      __publicField(this, "indent", 0);
      __publicField(this, "usesResult", false);
      __publicField(this, "usesHttp", false);
      __publicField(this, "usesJson", false);
      __publicField(this, "usesRange", false);
      __publicField(this, "asyncFunctions", /* @__PURE__ */ new Set());
    }
    generate(program) {
      this.detectFeatures(program);
      const preamble = [];
      if (this.usesResult) preamble.push(NK_RUNTIME);
      if (this.usesHttp) preamble.push(NK_HTTP_RUNTIME);
      if (this.usesJson) preamble.push(NK_JSON_RUNTIME);
      if (this.usesRange) preamble.push(NK_RANGE_RUNTIME);
      for (const stmt of program.body) {
        this.emitStatement(stmt);
      }
      const code = this.output.join("\n");
      if (preamble.length > 0) {
        return preamble.join("\n\n") + "\n\n" + code;
      }
      return code;
    }
    detectFeatures(program) {
      const source = JSON.stringify(program);
      if (source.includes('"OkExpr"') || source.includes('"ErrExpr"') || source.includes('"MatchExpr"') || source.includes('"MatchStatement"')) {
        this.usesResult = true;
      }
      if (source.includes('"http"')) {
        this.usesHttp = true;
      }
      if (source.includes('"json"')) {
        this.usesJson = true;
      }
      if (source.includes('"RangeExpr"')) {
        this.usesRange = true;
      }
      this.detectAsync(program);
    }
    detectAsync(program) {
      const asyncCallees = /* @__PURE__ */ new Set(["http"]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const stmt of program.body) {
          if (stmt.kind === "FunctionDeclaration") {
            if (!this.asyncFunctions.has(stmt.name)) {
              if (this.bodyCallsAsync(stmt.body, asyncCallees)) {
                this.asyncFunctions.add(stmt.name);
                asyncCallees.add(stmt.name);
                changed = true;
              }
            }
          }
        }
      }
    }
    bodyCallsAsync(block, asyncCallees) {
      for (const stmt of block.body) {
        if (this.stmtCallsAsync(stmt, asyncCallees)) return true;
      }
      return false;
    }
    stmtCallsAsync(stmt, asyncCallees) {
      switch (stmt.kind) {
        case "ExpressionStatement":
          return this.exprCallsAsync(stmt.expression, asyncCallees);
        case "VariableDeclaration":
          return this.exprCallsAsync(stmt.initializer, asyncCallees);
        case "DestructureDeclaration":
          return this.exprCallsAsync(stmt.initializer, asyncCallees);
        case "ReturnStatement":
          return stmt.value ? this.exprCallsAsync(stmt.value, asyncCallees) : false;
        case "IfStatement":
          return this.exprCallsAsync(stmt.condition, asyncCallees) || this.bodyCallsAsync(stmt.consequent, asyncCallees) || (stmt.alternate ? this.stmtCallsAsync(stmt.alternate, asyncCallees) : false);
        case "WhileStatement":
          return this.bodyCallsAsync(stmt.body, asyncCallees);
        case "ForStatement":
          return this.bodyCallsAsync(stmt.body, asyncCallees);
        case "ForInStatement":
          return this.bodyCallsAsync(stmt.body, asyncCallees);
        case "BlockStatement":
          return this.bodyCallsAsync(stmt, asyncCallees);
        case "TryCatchStatement":
          return this.bodyCallsAsync(stmt.tryBlock, asyncCallees) || this.bodyCallsAsync(stmt.catchBlock, asyncCallees);
        default:
          return false;
      }
    }
    exprCallsAsync(expr, asyncCallees) {
      switch (expr.kind) {
        case "CallExpr": {
          if (expr.callee.kind === "Identifier" && asyncCallees.has(expr.callee.name))
            return true;
          if (expr.callee.kind === "MemberExpr" && expr.callee.object.kind === "Identifier" && asyncCallees.has(expr.callee.object.name))
            return true;
          return this.exprCallsAsync(expr.callee, asyncCallees) || expr.args.some((a) => this.exprCallsAsync(a, asyncCallees));
        }
        case "BinaryExpr":
          return this.exprCallsAsync(expr.left, asyncCallees) || this.exprCallsAsync(expr.right, asyncCallees);
        case "UnaryExpr":
          return this.exprCallsAsync(expr.operand, asyncCallees);
        case "AssignExpr":
          return this.exprCallsAsync(expr.value, asyncCallees);
        case "CompoundAssignExpr":
          return this.exprCallsAsync(expr.value, asyncCallees);
        case "TernaryExpr":
          return this.exprCallsAsync(expr.condition, asyncCallees) || this.exprCallsAsync(expr.consequent, asyncCallees) || this.exprCallsAsync(expr.alternate, asyncCallees);
        case "MemberExpr":
          return this.exprCallsAsync(expr.object, asyncCallees);
        case "IndexExpr":
          return this.exprCallsAsync(expr.object, asyncCallees) || this.exprCallsAsync(expr.index, asyncCallees);
        case "SpreadExpr":
          return this.exprCallsAsync(expr.argument, asyncCallees);
        case "PipeExpr":
          return this.exprCallsAsync(expr.left, asyncCallees) || this.exprCallsAsync(expr.right, asyncCallees);
        case "RangeExpr":
          return this.exprCallsAsync(expr.start, asyncCallees) || this.exprCallsAsync(expr.end, asyncCallees);
        case "TupleLiteral":
          return expr.elements.some((e) => this.exprCallsAsync(e, asyncCallees));
        default:
          return false;
      }
    }
    genParams(params) {
      return params.map(
        (p) => p.defaultValue ? `${p.name} = ${this.genExpr(p.defaultValue)}` : p.name
      ).join(", ");
    }
    emit(text) {
      this.output.push("  ".repeat(this.indent) + text);
    }
    // --- Statements ---
    emitStatement(stmt) {
      switch (stmt.kind) {
        case "VariableDeclaration":
          this.emit(`let ${stmt.name} = ${this.genExpr(stmt.initializer)};`);
          break;
        case "FunctionDeclaration": {
          const isAsync = this.asyncFunctions.has(stmt.name);
          const prefix = isAsync ? "async " : "";
          const params = this.genParams(stmt.params);
          this.emit(`${prefix}function ${stmt.name}(${params}) {`);
          this.indent++;
          this.emitBlock(stmt.body);
          this.indent--;
          this.emit("}");
          break;
        }
        case "ReturnStatement":
          if (stmt.value) {
            this.emit(`return ${this.genExpr(stmt.value)};`);
          } else {
            this.emit("return;");
          }
          break;
        case "IfStatement":
          this.emit(`if (${this.genExpr(stmt.condition)}) {`);
          this.indent++;
          this.emitBlock(stmt.consequent);
          this.indent--;
          if (stmt.alternate) {
            if (stmt.alternate.kind === "IfStatement") {
              this.emit(`} else ${this.genIfInline(stmt.alternate)}`);
            } else {
              this.emit("} else {");
              this.indent++;
              this.emitBlock(stmt.alternate);
              this.indent--;
              this.emit("}");
            }
          } else {
            this.emit("}");
          }
          break;
        case "WhileStatement":
          this.emit(`while (${this.genExpr(stmt.condition)}) {`);
          this.indent++;
          this.emitBlock(stmt.body);
          this.indent--;
          this.emit("}");
          break;
        case "ForStatement": {
          const init = stmt.init ? stmt.init.kind === "VariableDeclaration" ? `let ${stmt.init.name} = ${this.genExpr(stmt.init.initializer)}` : this.genExpr(stmt.init.expression) : "";
          const cond = stmt.condition ? this.genExpr(stmt.condition) : "";
          const update = stmt.update ? this.genExpr(stmt.update) : "";
          this.emit(`for (${init}; ${cond}; ${update}) {`);
          this.indent++;
          this.emitBlock(stmt.body);
          this.indent--;
          this.emit("}");
          break;
        }
        case "ForInStatement":
          this.emit(
            `for (const ${stmt.variable} of ${this.genExpr(stmt.iterable)}) {`
          );
          this.indent++;
          this.emitBlock(stmt.body);
          this.indent--;
          this.emit("}");
          break;
        case "BlockStatement":
          this.emit("{");
          this.indent++;
          this.emitBlock(stmt);
          this.indent--;
          this.emit("}");
          break;
        case "ExpressionStatement":
          this.emit(`${this.genExpr(stmt.expression)};`);
          break;
        case "StructDeclaration": {
          const fieldNames = stmt.fields.map((f) => f.name);
          this.emit(`class ${stmt.name} {`);
          this.indent++;
          this.emit(`constructor(${fieldNames.join(", ")}) {`);
          this.indent++;
          for (const f of fieldNames) {
            this.emit(`this.${f} = ${f};`);
          }
          this.indent--;
          this.emit("}");
          for (const method of stmt.methods) {
            const params = this.genParams(method.params);
            this.emit(`${method.name}(${params}) {`);
            this.indent++;
            this.emitBlock(method.body);
            this.indent--;
            this.emit("}");
          }
          this.indent--;
          this.emit("}");
          break;
        }
        case "ClassDeclaration": {
          const ext = stmt.superClass ? ` extends ${stmt.superClass}` : "";
          this.emit(`class ${stmt.name}${ext} {`);
          this.indent++;
          if (stmt.fields.length > 0) {
            const fieldNames = stmt.fields.map((f) => f.name);
            this.emit(`constructor(${fieldNames.join(", ")}) {`);
            this.indent++;
            if (stmt.superClass) this.emit("super();");
            for (const f of fieldNames) {
              this.emit(`this.${f} = ${f};`);
            }
            this.indent--;
            this.emit("}");
          }
          for (const method of stmt.methods) {
            const params = this.genParams(method.params);
            this.emit(`${method.name}(${params}) {`);
            this.indent++;
            this.emitBlock(method.body);
            this.indent--;
            this.emit("}");
          }
          this.indent--;
          this.emit("}");
          break;
        }
        case "InterfaceDeclaration":
        case "TypeAlias":
          break;
        case "EnumDeclaration": {
          const hasADT = stmt.variants.some(
            (v) => v.fields && v.fields.length > 0
          );
          if (hasADT) {
            const entries = stmt.variants.map((v) => {
              if (v.fields && v.fields.length > 0) {
                const params = v.fields.map((f) => f.name).join(", ");
                const obj = v.fields.map((f) => f.name).concat([`__tag: "${v.name}"`]).join(", ");
                return `${v.name}: (${params}) => ({ ${obj} })`;
              }
              return `${v.name}: Object.freeze({ __tag: "${v.name}" })`;
            });
            this.emit(
              `const ${stmt.name} = Object.freeze({ ${entries.join(", ")} });`
            );
          } else {
            const entries = stmt.variants.map((v, i) => {
              const val = v.value ? this.genExpr(v.value) : String(i);
              return `${v.name}: ${val}`;
            });
            this.emit(
              `const ${stmt.name} = Object.freeze({ ${entries.join(", ")} });`
            );
          }
          break;
        }
        case "TakeStatement": {
          const names = stmt.names.join(", ");
          let path = stmt.path;
          if (path.startsWith("./") || path.startsWith("../")) {
            path = path.endsWith(".js") ? path : path + ".js";
          }
          this.emit(`import { ${names} } from "${path}";`);
          break;
        }
        case "LoadStatement":
          this.emit(`import ${stmt.name} from "${stmt.path}";`);
          break;
        case "TryCatchStatement":
          this.emit("try {");
          this.indent++;
          this.emitBlock(stmt.tryBlock);
          this.indent--;
          if (stmt.catchBinding) {
            this.emit(`} catch (${stmt.catchBinding}) {`);
          } else {
            this.emit("} catch {");
          }
          this.indent++;
          this.emitBlock(stmt.catchBlock);
          this.indent--;
          this.emit("}");
          break;
        case "MatchStatement":
          this.emitMatch(stmt.subject, stmt.arms);
          break;
        case "DestructureDeclaration": {
          const names = stmt.names.join(", ");
          const init = this.genExpr(stmt.initializer);
          if (stmt.pattern === "object") {
            this.emit(`const { ${names} } = ${init};`);
          } else {
            this.emit(`const [${names}] = ${init};`);
          }
          break;
        }
        case "BreakStatement":
          this.emit("break;");
          break;
        case "ContinueStatement":
          this.emit("continue;");
          break;
      }
    }
    emitBlock(block) {
      for (const stmt of block.body) {
        this.emitStatement(stmt);
      }
    }
    genIfInline(stmt) {
      if (stmt.kind !== "IfStatement") return "";
      let code = `if (${this.genExpr(stmt.condition)}) {
`;
      this.indent++;
      const saved = this.output.length;
      this.emitBlock(stmt.consequent);
      const inner = this.output.splice(saved).join("\n");
      this.indent--;
      code += inner + "\n" + "  ".repeat(this.indent);
      if (stmt.alternate) {
        if (stmt.alternate.kind === "IfStatement") {
          code += `} else ${this.genIfInline(stmt.alternate)}`;
        } else {
          code += "} else {\n";
          this.indent++;
          const saved2 = this.output.length;
          this.emitBlock(stmt.alternate);
          const inner2 = this.output.splice(saved2).join("\n");
          this.indent--;
          code += inner2 + "\n" + "  ".repeat(this.indent) + "}";
        }
      } else {
        code += "}";
      }
      return code;
    }
    emitMatch(subject, arms) {
      const subjectCode = this.genExpr(subject);
      const tempVar = `__match_${subject.span.offset}`;
      this.emit(`const ${tempVar} = ${subjectCode};`);
      for (let i = 0; i < arms.length; i++) {
        const arm = arms[i];
        const prefix = i === 0 ? "if" : "} else if";
        const { condition, binding } = this.genMatchCondition(
          tempVar,
          arm.pattern
        );
        if (arm.pattern.kind === "WildcardPattern") {
          if (i === 0) {
            this.emit("{");
          } else {
            this.emit("} else {");
          }
        } else {
          this.emit(`${prefix} (${condition}) {`);
        }
        this.indent++;
        if (binding) {
          this.emit(`const ${binding.name} = ${binding.value};`);
        }
        if (arm.pattern.kind === "EnumVariantPattern" && arm.pattern.bindings.length > 0) {
          for (const b of arm.pattern.bindings) {
            this.emit(`const ${b} = ${tempVar}.${b};`);
          }
        }
        if (arm.body.kind === "BlockStatement") {
          this.emitBlock(arm.body);
        } else {
          this.emit(`${this.genExpr(arm.body)};`);
        }
        this.indent--;
      }
      if (arms.length > 0) {
        this.emit("}");
      }
    }
    genMatchCondition(tempVar, pattern) {
      switch (pattern.kind) {
        case "OkPattern":
          return {
            condition: `${tempVar}.__tag === "Ok"`,
            binding: { name: pattern.binding, value: `${tempVar}.value` }
          };
        case "ErrPattern":
          return {
            condition: `${tempVar}.__tag === "Err"`,
            binding: { name: pattern.binding, value: `${tempVar}.value` }
          };
        case "LiteralPattern":
          return { condition: `${tempVar} === ${this.genExpr(pattern.value)}` };
        case "IdentifierPattern":
          return {
            condition: `true`,
            binding: { name: pattern.name, value: tempVar }
          };
        case "EnumVariantPattern":
          return {
            condition: `${tempVar}.__tag === "${pattern.variant}"`
          };
        case "WildcardPattern":
          return { condition: "true" };
      }
    }
    // --- Expressions ---
    genExpr(expr) {
      switch (expr.kind) {
        case "IntLiteral":
        case "FloatLiteral":
          return String(expr.value);
        case "StringLiteral":
          return JSON.stringify(expr.value);
        case "BoolLiteral":
          return String(expr.value);
        case "NullLiteral":
          return "null";
        case "Identifier":
          return this.mapIdentifier(expr.name);
        case "BinaryExpr":
          return `(${this.genExpr(expr.left)} ${expr.operator} ${this.genExpr(expr.right)})`;
        case "UnaryExpr":
          return `${expr.operator}${this.genExpr(expr.operand)}`;
        case "CallExpr": {
          const callee = this.genExpr(expr.callee);
          const args = expr.args.map((a) => this.genExpr(a)).join(", ");
          const needsAwait = this.isAsyncCall(expr.callee);
          const prefix = needsAwait ? "await " : "";
          return `${prefix}${callee}(${args})`;
        }
        case "MemberExpr": {
          const obj = this.genExpr(expr.object);
          const op = expr.optional ? "?." : ".";
          return `${obj}${op}${expr.property}`;
        }
        case "IndexExpr":
          return `${this.genExpr(expr.object)}[${this.genExpr(expr.index)}]`;
        case "AssignExpr":
          return `${this.genExpr(expr.target)} = ${this.genExpr(expr.value)}`;
        case "ArrowFunction": {
          const params = this.genParams(expr.params);
          if (expr.body.kind === "BlockStatement") {
            const saved = this.output.length;
            this.indent++;
            this.emitBlock(expr.body);
            const inner = this.output.splice(saved).join("\n");
            this.indent--;
            return `(${params}) => {
${inner}
${"  ".repeat(this.indent)}}`;
          }
          return `(${params}) => ${this.genExpr(expr.body)}`;
        }
        case "NewExpr": {
          const callee = this.genExpr(expr.callee);
          const args = expr.args.map((a) => this.genExpr(a)).join(", ");
          return `new ${callee}(${args})`;
        }
        case "ThisExpr":
          return "this";
        case "ArrayLiteral": {
          const elements = expr.elements.map((e) => this.genExpr(e)).join(", ");
          return `[${elements}]`;
        }
        case "MapLiteral": {
          if (expr.entries.length === 0) return "new Map()";
          const pairs = expr.entries.map((e) => `[${this.genExpr(e.key)}, ${this.genExpr(e.value)}]`).join(", ");
          return `new Map([${pairs}])`;
        }
        case "OkExpr":
          return `__nk_Ok(${this.genExpr(expr.value)})`;
        case "ErrExpr":
          return `__nk_Err(${this.genExpr(expr.value)})`;
        case "MatchExpr":
          return this.genMatchExpr(expr);
        case "StringInterpolation": {
          let tpl = "`";
          for (const part of expr.parts) {
            if (typeof part === "string") {
              tpl += part.replace(/`/g, "\\`").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
            } else {
              tpl += `\${${this.genExpr(part)}}`;
            }
          }
          tpl += "`";
          return tpl;
        }
        case "CompoundAssignExpr":
          return `${this.genExpr(expr.target)} ${expr.operator} ${this.genExpr(expr.value)}`;
        case "UpdateExpr":
          return expr.prefix ? `${expr.operator}${this.genExpr(expr.argument)}` : `${this.genExpr(expr.argument)}${expr.operator}`;
        case "TernaryExpr":
          return `(${this.genExpr(expr.condition)} ? ${this.genExpr(expr.consequent)} : ${this.genExpr(expr.alternate)})`;
        case "SpreadExpr":
          return `...${this.genExpr(expr.argument)}`;
        case "PipeExpr":
          return `${this.genExpr(expr.right)}(${this.genExpr(expr.left)})`;
        case "RangeExpr":
          return `__nk_range(${this.genExpr(expr.start)}, ${this.genExpr(expr.end)}, ${expr.inclusive})`;
        case "TupleLiteral": {
          const elements = expr.elements.map((e) => this.genExpr(e)).join(", ");
          return `[${elements}]`;
        }
      }
    }
    genMatchExpr(expr) {
      const subject = this.genExpr(expr.subject);
      let code = `(() => { const __m = ${subject}; `;
      for (let i = 0; i < expr.arms.length; i++) {
        const arm = expr.arms[i];
        const { condition, binding } = this.genMatchCondition("__m", arm.pattern);
        if (arm.pattern.kind === "WildcardPattern") {
          if (i > 0) code += " else { ";
          else code += "{ ";
        } else {
          code += i === 0 ? `if (${condition}) { ` : ` else if (${condition}) { `;
        }
        if (binding) {
          code += `const ${binding.name} = ${binding.value}; `;
        }
        if (arm.pattern.kind === "EnumVariantPattern" && arm.pattern.bindings.length > 0) {
          for (const b of arm.pattern.bindings) {
            code += `const ${b} = __m.${b}; `;
          }
        }
        if (arm.body.kind === "BlockStatement") {
          const saved = this.output.length;
          this.emitBlock(arm.body);
          const inner = this.output.splice(saved).join("; ");
          code += inner;
        } else {
          code += `return ${this.genExpr(arm.body)};`;
        }
        code += " }";
      }
      code += " })()";
      return code;
    }
    mapIdentifier(name) {
      switch (name) {
        case "print":
          return "console.log";
        case "http":
          return "__nk_http";
        case "json":
          return "__nk_json";
        case "math":
          return "Math";
        default:
          return name;
      }
    }
    isAsyncCall(callee) {
      if (callee.kind === "Identifier") {
        return this.asyncFunctions.has(callee.name);
      }
      if (callee.kind === "MemberExpr") {
        if (callee.object.kind === "Identifier") {
          const objName = callee.object.name;
          if (objName === "http") return true;
          return this.asyncFunctions.has(objName);
        }
      }
      return false;
    }
  };

  // src/browser.ts
  function compile(source, file = "<playground>", options = {}) {
    const diagnostics = [];
    const lexer = new Lexer(source, file);
    const tokens = lexer.tokenize();
    diagnostics.push(...lexer.diagnostics);
    if (diagnostics.some((d) => d.severity === "error")) {
      return { success: false, diagnostics };
    }
    const parser = new Parser(tokens, file);
    const ast = parser.parse();
    diagnostics.push(...parser.diagnostics);
    if (diagnostics.some((d) => d.severity === "error")) {
      return { success: false, ast, diagnostics };
    }
    if (!options.noCheck) {
      const checker = new TypeChecker(file);
      checker.check(ast);
      diagnostics.push(...checker.diagnostics);
      if (diagnostics.some((d) => d.severity === "error")) {
        return { success: false, ast, diagnostics };
      }
    }
    const codegen = new CodeGenerator();
    const js = codegen.generate(ast);
    return { success: true, js, ast, diagnostics };
  }
  globalThis.nk = { compile };
})();
