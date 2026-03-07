import { Token, TokenType } from "../lexer/token.js";
import { Diagnostic, errorDiag } from "../errors/diagnostic.js";
import {
  Program,
  Statement,
  Expression,
  TypeAnnotation,
  Parameter,
  BlockStatement,
  VariableDeclaration,
  FunctionDeclaration,
  MatchArm,
  MatchPattern,
  StructField,
  EnumVariant,
  InterfaceMethod,
  SourceSpan,
  DeclareItem,
  DeclareModuleStatement,
  TypeParam,
} from "./ast.js";

const TYPE_KEYWORDS = new Set([
  TokenType.Int,
  TokenType.Float,
  TokenType.String,
  TokenType.Bool,
  TokenType.Void,
  TokenType.Var,
  TokenType.Never,
]);

export class Parser {
  private tokens: Token[];
  private pos = 0;
  readonly diagnostics: Diagnostic[] = [];
  private file: string;

  constructor(tokens: Token[], file = "<stdin>") {
    this.tokens = tokens;
    this.file = file;
  }

  parse(): Program {
    const span = this.span();
    const body: Statement[] = [];
    while (!this.isAtEnd()) {
      const before = this.pos;
      const diagsBefore = this.diagnostics.length;
      const stmt = this.parseStatement();
      // If parseStatement produced errors and didn't advance, synchronize
      if (this.diagnostics.length > diagsBefore && this.pos === before) {
        this.synchronize();
        continue;
      }
      body.push(stmt);
    }
    return { kind: "Program", body, span };
  }

  // --- Helpers ---

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private peekType(): TokenType {
    return this.tokens[this.pos].type;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (!this.isAtEnd()) this.pos++;
    return tok;
  }

  private isAtEnd(): boolean {
    return this.peekType() === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    return this.peekType() === type;
  }

  private match(...types: TokenType[]): Token | null {
    for (const type of types) {
      if (this.check(type)) {
        return this.advance();
      }
    }
    return null;
  }

  private expect(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    const tok = this.peek();
    this.diagnostics.push(
      errorDiag(`${message}, got '${tok.value}' (${tok.type})`, {
        file: this.file,
        line: tok.line,
        column: tok.column,
        offset: tok.offset,
      }),
    );
    // Advance past the bad token to prevent getting stuck
    if (!this.isAtEnd()) this.advance();
    return tok;
  }

  /** Accept an Identifier token or a contextual keyword that can be used as a name. */
  private expectIdentifierOrKeyword(): string {
    const tok = this.peek();
    if (tok.type === TokenType.Identifier) return this.advance().value;
    // Contextual keywords that can appear as names
    const contextual: TokenType[] = [
      TokenType.Get,
      TokenType.Set,
      TokenType.All,
      TokenType.Race,
      TokenType.Chan,
      TokenType.Spawn,
      TokenType.Join,
      TokenType.Defer,
      TokenType.Extend,
      TokenType.Operator,
      TokenType.Never,
    ];
    if (contextual.includes(tok.type)) return this.advance().value;
    return this.expect(TokenType.Identifier, "Expected identifier").value;
  }

  private span(): SourceSpan {
    const tok = this.peek();
    return { line: tok.line, column: tok.column, offset: tok.offset };
  }

  /**
   * Skip tokens until we reach a statement boundary — a semicolon, closing
   * brace, or a token that starts a new statement. This allows the parser
   * to recover from errors and continue producing diagnostics.
   */
  private synchronize(): void {
    while (!this.isAtEnd()) {
      // Just consumed a semicolon — next token starts a fresh statement
      if (this.peek().type === TokenType.Semicolon) {
        this.advance();
        return;
      }
      // These tokens reliably start new statements
      switch (this.peekType()) {
        case TokenType.If:
        case TokenType.While:
        case TokenType.For:
        case TokenType.Return:
        case TokenType.Break:
        case TokenType.Continue:
        case TokenType.Struct:
        case TokenType.Class:
        case TokenType.Interface:
        case TokenType.Enum:
        case TokenType.Take:
        case TokenType.Load:
        case TokenType.Try:
        case TokenType.Match:
        case TokenType.Var:
        case TokenType.Const:
        case TokenType.Type:
        case TokenType.Throw:
        case TokenType.Do:
          return;
        case TokenType.RightBrace:
          // Don't consume — let the caller handle the closing brace
          return;
      }
      this.advance();
    }
  }

  private lookAhead(offset: number): TokenType {
    const idx = this.pos + offset;
    if (idx < this.tokens.length) return this.tokens[idx].type;
    return TokenType.EOF;
  }

  private looksLikeTypedDecl(): boolean {
    // Scan ahead past the initial type and any suffixes
    let i = this.skipTypeAhead(0);
    // Check for union: | type | type ...
    while (this.lookAhead(i) === TokenType.Bar) {
      i++; // skip |
      i = this.skipTypeAhead(i);
    }
    return this.lookAhead(i) === TokenType.Identifier;
  }

  /** Starting at offset `i` (relative to current pos), skip a single type + suffixes.
   *  Returns the offset after the type. */
  private skipTypeAhead(i: number): number {
    const tok = this.lookAhead(i);
    // Generic: type<...>
    if (
      (tok === TokenType.Identifier ||
        tok === TokenType.Result ||
        TYPE_KEYWORDS.has(tok)) &&
      this.lookAhead(i + 1) === TokenType.Less
    ) {
      i += 2; // skip name and <
      let depth = 1;
      while (depth > 0 && this.lookAhead(i) !== TokenType.EOF) {
        if (this.lookAhead(i) === TokenType.Less) depth++;
        else if (this.lookAhead(i) === TokenType.Greater) depth--;
        i++;
      }
    } else if (
      tok === TokenType.Identifier ||
      tok === TokenType.Result ||
      TYPE_KEYWORDS.has(tok)
    ) {
      i++; // skip simple type name
    } else {
      return i; // not a type token
    }
    // Array suffix: []
    while (
      this.lookAhead(i) === TokenType.LeftBracket &&
      this.lookAhead(i + 1) === TokenType.RightBracket
    ) {
      i += 2;
    }
    // Nullable suffix: ?
    if (this.lookAhead(i) === TokenType.Question) {
      i++;
    }
    return i;
  }

  private looksLikeTupleTypeDecl(): boolean {
    // Check for (type, type) ident pattern
    let i = 1; // skip (
    let depth = 1;
    while (depth > 0 && this.lookAhead(i) !== TokenType.EOF) {
      if (this.lookAhead(i) === TokenType.LeftParen) depth++;
      else if (this.lookAhead(i) === TokenType.RightParen) depth--;
      i++;
    }
    // After matching ), next token should be an identifier
    return this.lookAhead(i) === TokenType.Identifier;
  }

  // --- Type annotations ---

  private isTypeStart(): boolean {
    const t = this.peekType();
    return (
      TYPE_KEYWORDS.has(t) ||
      t === TokenType.Identifier ||
      t === TokenType.Result ||
      t === TokenType.Never ||
      t === TokenType.StringLiteral ||
      t === TokenType.IntLiteral ||
      t === TokenType.FloatLiteral ||
      t === TokenType.BoolLiteral
    );
  }

  private parseTypeAnnotation(): TypeAnnotation {
    let type = this.parseSingleType();

    // Union type: T | U | V
    if (this.check(TokenType.Bar)) {
      const types: TypeAnnotation[] = [type];
      while (this.match(TokenType.Bar)) {
        types.push(this.parseSingleType());
      }
      type = { kind: "UnionType", types, span: type.span };
    }

    return type;
  }

  private parseSingleType(): TypeAnnotation {
    let type = this.parsePrimaryType();

    // Array suffix
    while (
      this.check(TokenType.LeftBracket) &&
      this.lookAhead(1) === TokenType.RightBracket
    ) {
      this.advance(); // [
      this.advance(); // ]
      type = { kind: "ArrayType", elementType: type, span: type.span };
    }

    // Nullable suffix
    if (this.match(TokenType.Question)) {
      type = { kind: "NullableType", innerType: type, span: type.span };
    }

    // Intersection type: T & U & V (binds tighter than |)
    if (this.check(TokenType.Ampersand)) {
      const types: TypeAnnotation[] = [type];
      while (this.match(TokenType.Ampersand)) {
        let next = this.parsePrimaryType();
        // Apply array/nullable suffixes to the next component too
        while (
          this.check(TokenType.LeftBracket) &&
          this.lookAhead(1) === TokenType.RightBracket
        ) {
          this.advance();
          this.advance();
          next = { kind: "ArrayType", elementType: next, span: next.span };
        }
        if (this.match(TokenType.Question)) {
          next = { kind: "NullableType", innerType: next, span: next.span };
        }
        types.push(next);
      }
      type = { kind: "IntersectionType", types, span: type.span };
    }

    return type;
  }

  private parsePrimaryType(): TypeAnnotation {
    const tok = this.peek();
    const span = this.span();

    if (this.match(TokenType.Int))
      return { kind: "NamedType", name: "int", span };
    if (this.match(TokenType.Float))
      return { kind: "NamedType", name: "float", span };
    if (this.match(TokenType.String))
      return { kind: "NamedType", name: "string", span };
    if (this.match(TokenType.Bool))
      return { kind: "NamedType", name: "bool", span };
    if (this.match(TokenType.Void))
      return { kind: "NamedType", name: "void", span };
    if (this.match(TokenType.Never))
      return { kind: "NamedType", name: "never", span };

    // Literal types: "foo", 42, 3.14, true/false
    if (this.check(TokenType.StringLiteral)) {
      const value = this.advance().value;
      return { kind: "LiteralType", value, span };
    }
    if (this.check(TokenType.IntLiteral)) {
      const value = parseInt(this.advance().value, 10);
      return { kind: "LiteralType", value, span };
    }
    if (this.check(TokenType.FloatLiteral)) {
      const value = parseFloat(this.advance().value);
      return { kind: "LiteralType", value, span };
    }
    if (this.check(TokenType.BoolLiteral)) {
      const value = this.advance().value === "true";
      return { kind: "LiteralType", value, span };
    }

    // Tuple type: (type, type, ...)
    if (this.check(TokenType.LeftParen)) {
      const saved = this.pos;
      const savedDiags = this.diagnostics.length;
      this.advance(); // (
      const first = this.parseTypeAnnotation();
      if (this.check(TokenType.Comma)) {
        const elements: TypeAnnotation[] = [first];
        while (this.match(TokenType.Comma)) {
          elements.push(this.parseTypeAnnotation());
        }
        this.expect(TokenType.RightParen, "Expected ')'");
        return { kind: "TupleType", elements, span };
      }
      // Not a tuple type — restore
      this.pos = saved;
      this.diagnostics.length = savedDiags;
    }

    if (this.check(TokenType.Result) || this.check(TokenType.Identifier)) {
      const name = this.advance().value;

      if (this.match(TokenType.Less)) {
        const typeArgs: TypeAnnotation[] = [];
        if (!this.check(TokenType.Greater)) {
          typeArgs.push(this.parseTypeAnnotation());
          while (this.match(TokenType.Comma)) {
            typeArgs.push(this.parseTypeAnnotation());
          }
        }
        this.expect(TokenType.Greater, "Expected '>'");
        return { kind: "GenericType", name, typeArgs, span };
      }

      return { kind: "NamedType", name, span };
    }

    this.diagnostics.push(
      errorDiag(`Expected type, got '${tok.value}'`, {
        file: this.file,
        line: tok.line,
        column: tok.column,
        offset: tok.offset,
      }),
    );
    this.advance();
    return { kind: "NamedType", name: "unknown", span };
  }

  // --- Statements ---

  private parseStatement(): Statement {
    // Collect doc comments — they attach to the next declaration
    let pendingDocComment: string | undefined;
    while (this.check(TokenType.DocComment)) {
      const dc = this.advance().value;
      pendingDocComment = pendingDocComment
        ? pendingDocComment + "\n" + dc
        : dc;
    }

    const t = this.peekType();

    if (t === TokenType.Take) return this.parseTakeStatement();
    if (t === TokenType.Load) return this.parseLoadStatement();
    if (t === TokenType.If) return this.parseIfStatement();
    if (t === TokenType.While) return this.parseWhileStatement();
    if (t === TokenType.For) return this.parseForStatement();
    if (t === TokenType.Return) return this.parseReturnStatement();
    if (t === TokenType.Break) return this.parseBreakStatement();
    if (t === TokenType.Continue) return this.parseContinueStatement();
    if (t === TokenType.LeftBrace) return this.parseBlock();
    if (t === TokenType.Struct)
      return this.parseStructDeclaration(pendingDocComment);
    if (t === TokenType.Class)
      return this.parseClassDeclaration(pendingDocComment);
    if (t === TokenType.Interface) return this.parseInterfaceDeclaration();
    if (t === TokenType.Enum)
      return this.parseEnumDeclaration(pendingDocComment);
    if (t === TokenType.Try) return this.parseTryCatch();
    if (t === TokenType.Match) return this.parseMatchStatement();
    if (t === TokenType.Declare) return this.parseDeclareModule();
    if (t === TokenType.Defer) return this.parseDeferStatement();
    if (t === TokenType.Extend) return this.parseExtensionDeclaration();
    if (t === TokenType.Throw) return this.parseThrowStatement();
    if (t === TokenType.Do) return this.parseDoWhileStatement();

    // type Name = Type;
    if (t === TokenType.Type && this.lookAhead(1) === TokenType.Identifier) {
      return this.parseTypeAlias();
    }

    // var { ... } = expr; or var [ ... ] = expr;
    if (
      t === TokenType.Var &&
      (this.lookAhead(1) === TokenType.LeftBrace ||
        this.lookAhead(1) === TokenType.LeftBracket)
    ) {
      return this.parseDestructureDeclaration();
    }

    // var (a, b) = expr; — tuple destructuring
    if (
      t === TokenType.Var &&
      this.lookAhead(1) === TokenType.LeftParen &&
      this.looksLikeTupleDestructure()
    ) {
      return this.parseTupleDestructure();
    }

    // const name = ...
    if (t === TokenType.Const) return this.parseConstDeclaration();

    // var name = ... (must come before typed declaration check)
    if (t === TokenType.Var) return this.parseVarDeclaration();

    // Variable or function declaration: type name ...
    // Handles: type ident, type? ident, type[] ident, type<...> ident, Result<...> ident
    if (this.isTypeStart() && this.looksLikeTypedDecl()) {
      return this.parseTypedDeclaration(pendingDocComment);
    }

    // Tuple type declaration: (type, type) name = ...
    if (this.check(TokenType.LeftParen) && this.looksLikeTupleTypeDecl()) {
      return this.parseTypedDeclaration(pendingDocComment);
    }

    // Function with inferred return type: name(...) { ... }
    if (
      t === TokenType.Identifier &&
      this.lookAhead(1) === TokenType.LeftParen &&
      this.looksLikeInferredFunction()
    ) {
      return this.parseInferredFunction(pendingDocComment);
    }

    return this.parseExpressionStatement();
  }

  private parseTypedDeclaration(docComment?: string): Statement {
    const span = this.span();
    const type = this.parseTypeAnnotation();
    const name = this.expect(TokenType.Identifier, "Expected identifier").value;

    // Function: type name<T>(...) or type name(...)
    const typeParams = this.parseTypeParams();
    if (this.check(TokenType.LeftParen)) {
      return this.parseFunctionRest(name, type, span, typeParams, docComment);
    }

    // Variable: type name = expr;
    this.expect(TokenType.Assign, "Expected '='");
    const initializer = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "VariableDeclaration",
      name,
      type,
      initializer,
      mutable: true,
      span,
    } as VariableDeclaration;
  }

  private parseVarDeclaration(): VariableDeclaration {
    const span = this.span();
    this.advance(); // var
    const name = this.expect(TokenType.Identifier, "Expected identifier").value;
    this.expect(TokenType.Assign, "Expected '='");
    const initializer = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "VariableDeclaration",
      name,
      initializer,
      mutable: true,
      span,
    };
  }

  private parseConstDeclaration(): VariableDeclaration {
    const span = this.span();
    this.advance(); // const
    const name = this.expect(TokenType.Identifier, "Expected identifier").value;
    this.expect(TokenType.Assign, "Expected '='");
    const initializer = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "VariableDeclaration",
      name,
      initializer,
      mutable: false,
      span,
    };
  }

  private parseTypeParams(): TypeParam[] {
    const typeParams: TypeParam[] = [];
    if (this.check(TokenType.Less)) {
      this.advance(); // <
      typeParams.push(this.parseTypeParam());
      while (this.match(TokenType.Comma)) {
        typeParams.push(this.parseTypeParam());
      }
      this.expect(TokenType.Greater, "Expected '>'");
    }
    return typeParams;
  }

  private parseTypeParam(): TypeParam {
    const name = this.expect(
      TokenType.Identifier,
      "Expected type parameter",
    ).value;
    let constraint: TypeAnnotation | undefined;
    if (this.match(TokenType.Colon)) {
      constraint = this.parseTypeAnnotation();
    }
    return { name, constraint };
  }

  private parseFunctionRest(
    name: string,
    returnType: TypeAnnotation,
    span: SourceSpan,
    typeParams: TypeParam[] = [],
    docComment?: string,
  ): FunctionDeclaration {
    this.expect(TokenType.LeftParen, "Expected '('");
    const params = this.parseParameterList();
    this.expect(TokenType.RightParen, "Expected ')'");
    const body = this.parseBlock();
    return {
      kind: "FunctionDeclaration",
      name,
      typeParams,
      params,
      returnType,
      body,
      docComment,
      span,
    };
  }

  private parseParameterList(): Parameter[] {
    const params: Parameter[] = [];
    if (!this.check(TokenType.RightParen)) {
      params.push(this.parseParameter());
      while (this.match(TokenType.Comma)) {
        params.push(this.parseParameter());
      }
    }
    return params;
  }

  private parseParameter(): Parameter {
    const span = this.span();
    // Variadic: ...type name
    const isRest = !!this.match(TokenType.Spread);
    if (this.isTypeStart() && this.lookAhead(1) === TokenType.Identifier) {
      const type = this.parseTypeAnnotation();
      const name = this.expect(
        TokenType.Identifier,
        "Expected parameter name",
      ).value;
      let defaultValue: Expression | undefined;
      if (this.match(TokenType.Assign)) {
        defaultValue = this.parseExpression();
      }
      return { name, type, defaultValue, rest: isRest || undefined, span };
    }
    const name = this.expect(
      TokenType.Identifier,
      "Expected parameter name",
    ).value;
    let defaultValue: Expression | undefined;
    if (this.match(TokenType.Assign)) {
      defaultValue = this.parseExpression();
    }
    return { name, defaultValue, rest: isRest || undefined, span };
  }

  private parseBlock(): BlockStatement {
    const span = this.span();
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const body: Statement[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const before = this.pos;
      const diagsBefore = this.diagnostics.length;
      const stmt = this.parseStatement();
      if (this.diagnostics.length > diagsBefore && this.pos === before) {
        this.synchronize();
        continue;
      }
      body.push(stmt);
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "BlockStatement", body, span };
  }

  private parseReturnStatement(): Statement {
    const span = this.span();
    this.advance(); // return
    let value: Expression | undefined;
    if (!this.check(TokenType.Semicolon)) {
      value = this.parseExpression();
    }
    this.expect(TokenType.Semicolon, "Expected ';'");
    return { kind: "ReturnStatement", value, span };
  }

  private parseBreakStatement(): Statement {
    const span = this.span();
    this.advance();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return { kind: "BreakStatement", span };
  }

  private parseContinueStatement(): Statement {
    const span = this.span();
    this.advance();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return { kind: "ContinueStatement", span };
  }

  private parseIfStatement(): Statement {
    const span = this.span();
    this.advance(); // if
    this.expect(TokenType.LeftParen, "Expected '('");
    const condition = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    const consequent = this.parseBlock();
    let alternate: BlockStatement | import("./ast.js").IfStatement | undefined;
    if (this.match(TokenType.Else)) {
      if (this.check(TokenType.If)) {
        alternate = this.parseIfStatement() as import("./ast.js").IfStatement;
      } else {
        alternate = this.parseBlock();
      }
    }
    return { kind: "IfStatement", condition, consequent, alternate, span };
  }

  private parseWhileStatement(): Statement {
    const span = this.span();
    this.advance(); // while
    this.expect(TokenType.LeftParen, "Expected '('");
    const condition = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    const body = this.parseBlock();
    return { kind: "WhileStatement", condition, body, span };
  }

  private parseForStatement(): Statement {
    const span = this.span();
    this.advance(); // for
    this.expect(TokenType.LeftParen, "Expected '('");

    // Check for `for (ident in expr)` pattern
    if (
      this.peekType() === TokenType.Identifier &&
      this.lookAhead(1) === TokenType.In
    ) {
      const variable = this.advance().value; // ident
      this.advance(); // in
      const iterable = this.parseExpression();
      this.expect(TokenType.RightParen, "Expected ')'");
      const body = this.parseBlock();
      return { kind: "ForInStatement", variable, iterable, body, span };
    }

    let init:
      | VariableDeclaration
      | import("./ast.js").ExpressionStatement
      | undefined;
    if (!this.check(TokenType.Semicolon)) {
      if (this.peekType() === TokenType.Var) {
        init = this.parseVarDeclaration();
      } else if (
        this.isTypeStart() &&
        this.lookAhead(1) === TokenType.Identifier &&
        this.lookAhead(2) === TokenType.Assign
      ) {
        init = this.parseTypedDeclaration() as VariableDeclaration;
      } else {
        init =
          this.parseExpressionStatement() as import("./ast.js").ExpressionStatement;
      }
    } else {
      this.advance(); // ;
    }

    let condition: Expression | undefined;
    if (!this.check(TokenType.Semicolon)) {
      condition = this.parseExpression();
    }
    this.expect(TokenType.Semicolon, "Expected ';'");

    let update: Expression | undefined;
    if (!this.check(TokenType.RightParen)) {
      update = this.parseExpression();
    }
    this.expect(TokenType.RightParen, "Expected ')'");
    const body = this.parseBlock();
    return { kind: "ForStatement", init, condition, update, body, span };
  }

  private parseTakeStatement(): Statement {
    const span = this.span();
    this.advance(); // take
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const names: { name: string; alias?: string }[] = [];
    if (!this.check(TokenType.RightBrace)) {
      const name = this.expect(
        TokenType.Identifier,
        "Expected identifier",
      ).value;
      let alias: string | undefined;
      if (this.match(TokenType.As)) {
        alias = this.expect(TokenType.Identifier, "Expected alias name").value;
      }
      names.push({ name, alias });
      while (this.match(TokenType.Comma)) {
        const n = this.expect(
          TokenType.Identifier,
          "Expected identifier",
        ).value;
        let a: string | undefined;
        if (this.match(TokenType.As)) {
          a = this.expect(TokenType.Identifier, "Expected alias name").value;
        }
        names.push({ name: n, alias: a });
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    this.expect(TokenType.From, "Expected 'from'");
    const path = this.expect(
      TokenType.StringLiteral,
      "Expected string path",
    ).value;
    this.match(TokenType.Semicolon);
    return { kind: "TakeStatement", names, path, span };
  }

  private parseLoadStatement(): Statement {
    const span = this.span();
    this.advance(); // load
    const path = this.expect(
      TokenType.StringLiteral,
      "Expected string path",
    ).value;
    // Extract package name from path for the binding
    const name = path
      .split("/")
      .pop()!
      .replace(/[^a-zA-Z0-9_]/g, "");
    this.match(TokenType.Semicolon);
    return { kind: "LoadStatement", name, path, span };
  }

  private parseDeclareModule(): DeclareModuleStatement {
    const span = this.span();
    this.advance(); // declare
    this.expect(TokenType.Module, "Expected 'module'");
    const moduleName = this.expect(
      TokenType.StringLiteral,
      "Expected module name string",
    ).value;
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const declarations: DeclareItem[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const declSpan = this.span();
      const type = this.parseTypeAnnotation();
      const name = this.expectIdentifierOrKeyword();
      if (this.check(TokenType.LeftParen)) {
        // Function signature: returnType name(params);
        this.advance(); // (
        const params: Parameter[] = [];
        while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
          const pSpan = this.span();
          const pType = this.parseTypeAnnotation();
          const pName = this.expectIdentifierOrKeyword();
          params.push({ name: pName, type: pType, span: pSpan });
          if (!this.match(TokenType.Comma)) break;
        }
        this.expect(TokenType.RightParen, "Expected ')'");
        this.expect(TokenType.Semicolon, "Expected ';'");
        declarations.push({
          kind: "DeclareFunctionSignature",
          name,
          params,
          returnType: type,
          span: declSpan,
        });
      } else {
        // Variable declaration: type name;
        this.expect(TokenType.Semicolon, "Expected ';'");
        declarations.push({
          kind: "DeclareVariableStatement",
          name,
          type,
          span: declSpan,
        });
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "DeclareModuleStatement", moduleName, declarations, span };
  }

  private parseOperatorMethod(): FunctionDeclaration {
    const span = this.span();
    // operator +(Type name) { ... } → method named __op_plus etc.
    const opTok = this.peek();
    let opName: string;
    if (this.match(TokenType.Plus)) opName = "__op_plus";
    else if (this.match(TokenType.Minus)) opName = "__op_minus";
    else if (this.match(TokenType.Star)) opName = "__op_star";
    else if (this.match(TokenType.Slash)) opName = "__op_slash";
    else if (this.match(TokenType.Percent)) opName = "__op_percent";
    else if (this.match(TokenType.Equal)) opName = "__op_eq";
    else if (this.match(TokenType.NotEqual)) opName = "__op_neq";
    else if (this.match(TokenType.Less)) opName = "__op_lt";
    else if (this.match(TokenType.LessEqual)) opName = "__op_lte";
    else if (this.match(TokenType.Greater)) opName = "__op_gt";
    else if (this.match(TokenType.GreaterEqual)) opName = "__op_gte";
    else {
      this.diagnostics.push(
        errorDiag(`Expected operator after 'operator', got '${opTok.value}'`, {
          file: this.file,
          line: opTok.line,
          column: opTok.column,
          offset: opTok.offset,
        }),
      );
      this.advance();
      opName = "__op_unknown";
    }
    // Parse return type (optional — may be inferred)
    let returnType: TypeAnnotation | undefined;
    if (this.isTypeStart() && this.lookAhead(1) !== TokenType.LeftParen) {
      returnType = this.parseTypeAnnotation();
    }
    this.expect(TokenType.LeftParen, "Expected '('");
    const params = this.parseParameterList();
    this.expect(TokenType.RightParen, "Expected ')'");
    const body = this.parseBlock();
    return {
      kind: "FunctionDeclaration",
      name: opName,
      typeParams: [],
      params,
      returnType,
      body,
      span,
    };
  }

  private parseStructDeclaration(pendingDoc?: string): Statement {
    const span = this.span();
    // Collect leading doc comments (may also come from parseStatement)
    let docComment: string | undefined = pendingDoc;
    while (this.check(TokenType.DocComment)) {
      const dc = this.advance().value;
      docComment = docComment ? docComment + "\n" + dc : dc;
    }
    this.advance(); // struct
    const name = this.expect(
      TokenType.Identifier,
      "Expected struct name",
    ).value;
    const typeParams = this.parseTypeParams();
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const fields: StructField[] = [];
    const methods: FunctionDeclaration[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Collect member doc comments
      let memberDocComment: string | undefined;
      while (this.check(TokenType.DocComment)) {
        const dc = this.advance().value;
        memberDocComment = memberDocComment ? memberDocComment + "\n" + dc : dc;
      }
      // Check for operator method
      if (this.check(TokenType.Operator)) {
        this.advance(); // operator
        const opMethod = this.parseOperatorMethod();
        methods.push({ ...opMethod, docComment: memberDocComment });
        continue;
      }
      // Check for accessor modifier
      let accessor: "get" | "set" | undefined;
      if (this.check(TokenType.Get) || this.check(TokenType.Set)) {
        // Peek ahead: if next-next token is '(' → accessor method (set name(params))
        // If next token is a type start and next-next-next is name → getter (get type name())
        const isSetKw = this.check(TokenType.Set);
        if (
          this.lookAhead(1) === TokenType.Identifier &&
          this.lookAhead(2) === TokenType.LeftParen &&
          isSetKw
        ) {
          // set name(params) { }
          accessor = "set";
          this.advance(); // set
          const fSpan = this.span();
          const fname = this.advance().value; // name
          const dummyType: TypeAnnotation = {
            kind: "NamedType",
            name: "void",
            span: fSpan,
          };
          const method = this.parseFunctionRest(fname, dummyType, fSpan);
          methods.push({ ...method, accessor, docComment: memberDocComment });
          continue;
        }
        accessor = this.check(TokenType.Get) ? "get" : "set";
        this.advance();
      }
      if (this.isTypeStart()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expectIdentifierOrKeyword();
        if (this.check(TokenType.LeftParen)) {
          const method = this.parseFunctionRest(fname, type, fSpan);
          methods.push({ ...method, accessor, docComment: memberDocComment });
        } else {
          this.expect(TokenType.Semicolon, "Expected ';'");
          fields.push({ name: fname, type, span: fSpan });
        }
      } else {
        this.advance(); // skip unexpected token
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return {
      kind: "StructDeclaration",
      name,
      typeParams,
      fields,
      methods,
      docComment,
      span,
    };
  }

  private parseClassDeclaration(pendingDoc?: string): Statement {
    const span = this.span();
    // Collect leading doc comments (may also come from parseStatement)
    let docComment: string | undefined = pendingDoc;
    while (this.check(TokenType.DocComment)) {
      const dc = this.advance().value;
      docComment = docComment ? docComment + "\n" + dc : dc;
    }
    this.advance(); // class
    const name = this.expect(TokenType.Identifier, "Expected class name").value;
    const typeParams = this.parseTypeParams();
    let superClass: string | undefined;
    const interfaces: string[] = [];

    if (this.match(TokenType.Colon)) {
      // First could be superclass or interface
      const first = this.expect(
        TokenType.Identifier,
        "Expected class or interface name",
      ).value;
      // Heuristic: if followed by comma, it's an interface list. Otherwise check next.
      if (this.match(TokenType.Comma)) {
        superClass = first;
        // Rest are interfaces
        interfaces.push(
          this.expect(TokenType.Identifier, "Expected interface name").value,
        );
        while (this.match(TokenType.Comma)) {
          interfaces.push(
            this.expect(TokenType.Identifier, "Expected interface name").value,
          );
        }
      } else {
        superClass = first;
      }
    }

    this.expect(TokenType.LeftBrace, "Expected '{'");
    const fields: StructField[] = [];
    const methods: FunctionDeclaration[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Collect member doc comments
      let memberDocComment: string | undefined;
      while (this.check(TokenType.DocComment)) {
        const dc = this.advance().value;
        memberDocComment = memberDocComment ? memberDocComment + "\n" + dc : dc;
      }
      // Check for operator method
      if (this.check(TokenType.Operator)) {
        this.advance(); // operator
        const opMethod = this.parseOperatorMethod();
        methods.push({ ...opMethod, docComment: memberDocComment });
        continue;
      }
      // Check for accessor modifier
      let accessor: "get" | "set" | undefined;
      if (this.check(TokenType.Get) || this.check(TokenType.Set)) {
        const isSetKw = this.check(TokenType.Set);
        if (
          this.lookAhead(1) === TokenType.Identifier &&
          this.lookAhead(2) === TokenType.LeftParen &&
          isSetKw
        ) {
          accessor = "set";
          this.advance(); // set
          const fSpan = this.span();
          const fname = this.advance().value;
          const dummyType: TypeAnnotation = {
            kind: "NamedType",
            name: "void",
            span: fSpan,
          };
          const method = this.parseFunctionRest(fname, dummyType, fSpan);
          methods.push({ ...method, accessor, docComment: memberDocComment });
          continue;
        }
        accessor = this.check(TokenType.Get) ? "get" : "set";
        this.advance();
      }
      if (this.isTypeStart()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expectIdentifierOrKeyword();
        if (this.check(TokenType.LeftParen)) {
          const method = this.parseFunctionRest(fname, type, fSpan);
          methods.push({ ...method, accessor, docComment: memberDocComment });
        } else {
          this.expect(TokenType.Semicolon, "Expected ';'");
          fields.push({ name: fname, type, span: fSpan });
        }
      } else {
        this.advance();
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return {
      kind: "ClassDeclaration",
      name,
      typeParams,
      superClass,
      interfaces,
      fields,
      methods,
      docComment,
      span,
    };
  }

  private parseInterfaceDeclaration(): Statement {
    const span = this.span();
    this.advance(); // interface
    const name = this.expect(
      TokenType.Identifier,
      "Expected interface name",
    ).value;
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const methods: InterfaceMethod[] = [];
    const fields: StructField[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const fSpan = this.span();
      const type = this.parseTypeAnnotation();
      const fname = this.expect(TokenType.Identifier, "Expected name").value;
      if (this.check(TokenType.LeftParen)) {
        this.advance(); // (
        const params = this.parseParameterList();
        this.expect(TokenType.RightParen, "Expected ')'");
        this.expect(TokenType.Semicolon, "Expected ';'");
        methods.push({ name: fname, params, returnType: type, span: fSpan });
      } else {
        this.expect(TokenType.Semicolon, "Expected ';'");
        fields.push({ name: fname, type, span: fSpan });
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "InterfaceDeclaration", name, methods, fields, span };
  }

  private parseEnumDeclaration(pendingDoc?: string): Statement {
    const span = this.span();
    // Collect leading doc comments (may also come from parseStatement)
    let docComment: string | undefined = pendingDoc;
    while (this.check(TokenType.DocComment)) {
      const dc = this.advance().value;
      docComment = docComment ? docComment + "\n" + dc : dc;
    }
    this.advance(); // enum
    const name = this.expect(TokenType.Identifier, "Expected enum name").value;
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const variants: EnumVariant[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const vSpan = this.span();
      const vname = this.expect(
        TokenType.Identifier,
        "Expected variant name",
      ).value;
      let value: Expression | undefined;
      let fields: { name: string; type: TypeAnnotation }[] | undefined;
      if (this.match(TokenType.Assign)) {
        value = this.parseExpression();
      } else if (this.match(TokenType.LeftParen)) {
        // Associated data: Variant(type name, type name, ...)
        fields = [];
        if (!this.check(TokenType.RightParen)) {
          const ftype = this.parseTypeAnnotation();
          const fname = this.expect(
            TokenType.Identifier,
            "Expected field name",
          ).value;
          fields.push({ name: fname, type: ftype });
          while (this.match(TokenType.Comma)) {
            const ft = this.parseTypeAnnotation();
            const fn = this.expect(
              TokenType.Identifier,
              "Expected field name",
            ).value;
            fields.push({ name: fn, type: ft });
          }
        }
        this.expect(TokenType.RightParen, "Expected ')'");
      }
      variants.push({ name: vname, value, fields, span: vSpan });
      this.match(TokenType.Comma);
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "EnumDeclaration", name, variants, docComment, span };
  }

  private parseDestructureDeclaration(): Statement {
    const span = this.span();
    this.advance(); // var

    let pattern: "object" | "array";
    const names: string[] = [];

    if (this.match(TokenType.LeftBrace)) {
      pattern = "object";
      if (!this.check(TokenType.RightBrace)) {
        names.push(
          this.expect(TokenType.Identifier, "Expected identifier").value,
        );
        while (this.match(TokenType.Comma)) {
          names.push(
            this.expect(TokenType.Identifier, "Expected identifier").value,
          );
        }
      }
      this.expect(TokenType.RightBrace, "Expected '}'");
    } else {
      this.advance(); // [
      pattern = "array";
      if (!this.check(TokenType.RightBracket)) {
        names.push(
          this.expect(TokenType.Identifier, "Expected identifier").value,
        );
        while (this.match(TokenType.Comma)) {
          names.push(
            this.expect(TokenType.Identifier, "Expected identifier").value,
          );
        }
      }
      this.expect(TokenType.RightBracket, "Expected ']'");
    }

    this.expect(TokenType.Assign, "Expected '='");
    const initializer = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "DestructureDeclaration",
      pattern,
      names,
      initializer,
      span,
    };
  }

  private looksLikeTupleDestructure(): boolean {
    // var (ident, ident, ...) = ...
    // Check: skip 'var', '(', then ident, comma pattern, then ')', '='
    let i = 2; // skip var and (
    if (this.lookAhead(i) !== TokenType.Identifier) return false;
    i++;
    while (this.lookAhead(i) === TokenType.Comma) {
      i++;
      if (this.lookAhead(i) !== TokenType.Identifier) return false;
      i++;
    }
    return (
      this.lookAhead(i) === TokenType.RightParen &&
      this.lookAhead(i + 1) === TokenType.Assign
    );
  }

  private parseTupleDestructure(): Statement {
    const span = this.span();
    this.advance(); // var
    this.advance(); // (
    const names: string[] = [];
    names.push(this.expect(TokenType.Identifier, "Expected identifier").value);
    while (this.match(TokenType.Comma)) {
      names.push(
        this.expect(TokenType.Identifier, "Expected identifier").value,
      );
    }
    this.expect(TokenType.RightParen, "Expected ')'");
    this.expect(TokenType.Assign, "Expected '='");
    const initializer = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "DestructureDeclaration",
      pattern: "tuple" as const,
      names,
      initializer,
      span,
    };
  }

  private parseTypeAlias(): Statement {
    const span = this.span();
    this.advance(); // type
    const name = this.expect(
      TokenType.Identifier,
      "Expected type alias name",
    ).value;
    this.expect(TokenType.Assign, "Expected '='");
    const type = this.parseTypeAnnotation();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return { kind: "TypeAlias", name, type, span };
  }

  private parseTryCatch(): Statement {
    const span = this.span();
    this.advance(); // try
    const tryBlock = this.parseBlock();
    let catchBinding: string | undefined;
    let catchBlock: import("./ast.js").BlockStatement | undefined;
    let finallyBlock: import("./ast.js").BlockStatement | undefined;
    if (this.match(TokenType.Catch)) {
      if (this.match(TokenType.LeftParen)) {
        catchBinding = this.expect(
          TokenType.Identifier,
          "Expected catch binding",
        ).value;
        this.expect(TokenType.RightParen, "Expected ')'");
      }
      catchBlock = this.parseBlock();
    }
    if (this.match(TokenType.Finally)) {
      finallyBlock = this.parseBlock();
    }
    if (!catchBlock && !finallyBlock) {
      this.diagnostics.push(
        errorDiag("Expected 'catch' or 'finally'", {
          file: this.file,
          line: span.line,
          column: span.column,
          offset: span.offset,
        }),
      );
    }
    return {
      kind: "TryCatchStatement",
      tryBlock,
      catchBinding,
      catchBlock,
      finallyBlock,
      span,
    };
  }

  private parseDeferStatement(): Statement {
    const span = this.span();
    this.advance(); // defer
    const body = this.parseBlock();
    return { kind: "DeferStatement", body, span };
  }

  private parseThrowStatement(): Statement {
    const span = this.span();
    this.advance(); // throw
    const argument = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return {
      kind: "ThrowStatement",
      argument,
      span,
    } as import("./ast.js").ThrowStatement;
  }

  private parseDoWhileStatement(): Statement {
    const span = this.span();
    this.advance(); // do
    const body = this.parseBlock();
    this.expect(TokenType.While, "Expected 'while'");
    this.expect(TokenType.LeftParen, "Expected '('");
    const condition = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    this.match(TokenType.Semicolon);
    return {
      kind: "DoWhileStatement",
      body,
      condition,
      span,
    } as import("./ast.js").DoWhileStatement;
  }

  private parseExtensionDeclaration(): Statement {
    const span = this.span();
    this.advance(); // extend
    const targetType = this.parseTypeAnnotation();
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const methods: FunctionDeclaration[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Collect doc comments
      let docComment: string | undefined;
      while (this.check(TokenType.DocComment)) {
        const dc = this.advance().value;
        docComment = docComment ? docComment + "\n" + dc : dc;
      }
      // Check for accessor modifier
      let accessor: "get" | "set" | undefined;
      if (this.check(TokenType.Get)) {
        accessor = "get";
        this.advance();
      } else if (this.check(TokenType.Set)) {
        accessor = "set";
        this.advance();
      }
      if (this.isTypeStart()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expect(
          TokenType.Identifier,
          "Expected method name",
        ).value;
        if (this.check(TokenType.LeftParen)) {
          const method = this.parseFunctionRest(fname, type, fSpan);
          methods.push({ ...method, accessor, docComment });
        } else {
          this.advance(); // skip unexpected token
        }
      } else {
        this.advance();
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "ExtensionDeclaration", targetType, methods, span };
  }

  private parseMatchStatement(): Statement {
    const span = this.span();
    this.advance(); // match
    this.expect(TokenType.LeftParen, "Expected '('");
    const subject = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const arms = this.parseMatchArms();
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "MatchStatement", subject, arms, span };
  }

  private parseMatchArms(): MatchArm[] {
    const arms: MatchArm[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      arms.push(this.parseMatchArm());
    }
    return arms;
  }

  private parseMatchArm(): MatchArm {
    const span = this.span();
    const pattern = this.parseMatchPattern();
    let guard: Expression | undefined;
    if (this.match(TokenType.If)) {
      guard = this.parseExpression();
    }
    this.expect(TokenType.Arrow, "Expected '=>'");
    let body: Expression | BlockStatement;
    if (this.check(TokenType.LeftBrace)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
      this.match(TokenType.Comma);
    }
    return { pattern, guard, body, span };
  }

  private parseMatchPattern(): MatchPattern {
    const span = this.span();

    if (this.match(TokenType.Ok)) {
      this.expect(TokenType.LeftParen, "Expected '('");
      const inner = this.parseMatchPattern();
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "OkPattern", inner, span };
    }

    if (this.match(TokenType.Err)) {
      this.expect(TokenType.LeftParen, "Expected '('");
      const inner = this.parseMatchPattern();
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "ErrPattern", inner, span };
    }

    // Tuple pattern: (pat, pat, ...)
    if (this.check(TokenType.LeftParen)) {
      this.advance(); // (
      const elements: MatchPattern[] = [];
      if (!this.check(TokenType.RightParen)) {
        elements.push(this.parseMatchPattern());
        while (this.match(TokenType.Comma)) {
          if (this.check(TokenType.RightParen)) break;
          elements.push(this.parseMatchPattern());
        }
      }
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "TuplePattern", elements, span };
    }

    if (this.check(TokenType.Identifier) && this.peek().value === "_") {
      this.advance();
      return { kind: "WildcardPattern", span };
    }

    if (
      this.check(TokenType.IntLiteral) ||
      this.check(TokenType.FloatLiteral) ||
      this.check(TokenType.StringLiteral) ||
      this.check(TokenType.BoolLiteral) ||
      this.check(TokenType.NullLiteral)
    ) {
      const value = this.parsePrimary();
      return { kind: "LiteralPattern", value, span };
    }

    if (this.check(TokenType.Identifier)) {
      const name = this.advance().value;

      // Binding pattern: name @ pattern
      if (this.match(TokenType.At)) {
        const inner = this.parseMatchPattern();
        return { kind: "BindingPattern", name, pattern: inner, span };
      }

      // EnumVariantPattern: Enum.Variant or Enum.Variant(bindings)
      if (this.match(TokenType.Dot)) {
        const variant = this.expect(
          TokenType.Identifier,
          "Expected variant name",
        ).value;
        const bindings: MatchPattern[] = [];
        if (this.match(TokenType.LeftParen)) {
          if (!this.check(TokenType.RightParen)) {
            bindings.push(this.parseMatchPattern());
            while (this.match(TokenType.Comma)) {
              if (this.check(TokenType.RightParen)) break;
              bindings.push(this.parseMatchPattern());
            }
          }
          this.expect(TokenType.RightParen, "Expected ')'");
        }
        return {
          kind: "EnumVariantPattern",
          enumName: name,
          variant,
          bindings,
          span,
        };
      }
      return { kind: "IdentifierPattern", name, span };
    }

    this.diagnostics.push(
      errorDiag(`Expected match pattern`, {
        file: this.file,
        line: span.line,
        column: span.column,
        offset: span.offset,
      }),
    );
    this.advance();
    return { kind: "WildcardPattern", span };
  }

  private looksLikeInferredFunction(): boolean {
    // Scan: Identifier, (, balanced params, ), {
    let i = 1; // skip the identifier (already confirmed at pos+0)
    if (this.lookAhead(i) !== TokenType.LeftParen) return false;
    i++; // skip (
    let depth = 1;
    while (depth > 0 && this.lookAhead(i) !== TokenType.EOF) {
      const t = this.lookAhead(i);
      if (t === TokenType.LeftParen) depth++;
      else if (t === TokenType.RightParen) depth--;
      i++;
    }
    // After ), expect {
    return this.lookAhead(i) === TokenType.LeftBrace;
  }

  private parseInferredFunction(docComment?: string): FunctionDeclaration {
    const span = this.span();
    const name = this.advance().value; // identifier
    const typeParams = this.parseTypeParams();
    this.expect(TokenType.LeftParen, "Expected '('");
    const params = this.parseParameterList();
    this.expect(TokenType.RightParen, "Expected ')'");
    const body = this.parseBlock();
    return {
      kind: "FunctionDeclaration",
      name,
      typeParams,
      params,
      returnType: undefined,
      body,
      docComment,
      span,
    };
  }

  private parseExpressionStatement(): Statement {
    const span = this.span();
    const expression = this.parseExpression();
    this.expect(TokenType.Semicolon, "Expected ';'");
    return { kind: "ExpressionStatement", expression, span };
  }

  // --- Expressions (Pratt parser) ---

  private parseExpression(): Expression {
    return this.parseAssignment();
  }

  private parseAssignment(): Expression {
    const expr = this.parseTernary();

    if (this.match(TokenType.Assign)) {
      const value = this.parseAssignment();
      return { kind: "AssignExpr", target: expr, value, span: expr.span };
    }

    const compoundOp = this.match(
      TokenType.PlusAssign,
      TokenType.MinusAssign,
      TokenType.StarAssign,
      TokenType.SlashAssign,
      TokenType.PercentAssign,
    );
    if (compoundOp) {
      const value = this.parseAssignment();
      return {
        kind: "CompoundAssignExpr",
        operator: compoundOp.value as "+=" | "-=" | "*=" | "/=" | "%=",
        target: expr,
        value,
        span: expr.span,
      };
    }

    return expr;
  }

  private parseTernary(): Expression {
    const expr = this.parsePipe();

    if (this.match(TokenType.Question)) {
      const consequent = this.parseAssignment();
      this.expect(TokenType.Colon, "Expected ':' in ternary expression");
      const alternate = this.parseAssignment();
      return {
        kind: "TernaryExpr",
        condition: expr,
        consequent,
        alternate,
        span: expr.span,
      };
    }

    return expr;
  }

  private parsePipe(): Expression {
    let left = this.parseNullCoalesce();
    while (this.match(TokenType.PipeArrow)) {
      const right = this.parseNullCoalesce();
      left = { kind: "PipeExpr", left, right, span: left.span };
    }
    return left;
  }

  private parseNullCoalesce(): Expression {
    let left = this.parseOr();
    while (this.match(TokenType.QuestionQuestion)) {
      const right = this.parseOr();
      left = { kind: "NullCoalesceExpr", left, right, span: left.span };
    }
    return left;
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (this.match(TokenType.Or)) {
      const right = this.parseAnd();
      left = {
        kind: "BinaryExpr",
        operator: "||",
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();
    while (this.match(TokenType.And)) {
      const right = this.parseEquality();
      left = {
        kind: "BinaryExpr",
        operator: "&&",
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();
    while (true) {
      // Type guard: expr is Type
      if (this.check(TokenType.Is)) {
        this.advance(); // is
        const guardType = this.parseTypeAnnotation();
        left = {
          kind: "TypeGuardExpr",
          expression: left,
          guardType,
          span: left.span,
        };
        continue;
      }
      const op = this.match(TokenType.Equal, TokenType.NotEqual);
      if (!op) break;
      const right = this.parseComparison();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseRange();
    while (true) {
      const op = this.match(
        TokenType.Less,
        TokenType.LessEqual,
        TokenType.Greater,
        TokenType.GreaterEqual,
      );
      if (!op) break;
      const right = this.parseAddition();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseRange(): Expression {
    const left = this.parseAddition();
    if (this.match(TokenType.DotDot)) {
      const inclusive = this.match(TokenType.Assign) !== null;
      const end = this.parseAddition();
      return {
        kind: "RangeExpr",
        start: left,
        end,
        inclusive,
        span: left.span,
      };
    }
    return left;
  }

  private parseAddition(): Expression {
    let left = this.parseMultiplication();
    while (true) {
      const op = this.match(TokenType.Plus, TokenType.Minus);
      if (!op) break;
      const right = this.parseMultiplication();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseMultiplication(): Expression {
    let left = this.parseUnary();
    while (true) {
      const op = this.match(TokenType.Star, TokenType.Slash, TokenType.Percent);
      if (!op) break;
      const right = this.parseUnary();
      left = {
        kind: "BinaryExpr",
        operator: op.value,
        left,
        right,
        span: left.span,
      };
    }
    return left;
  }

  private parseUnary(): Expression {
    const span = this.span();
    if (this.match(TokenType.Await)) {
      // await all [...] or await race [...]
      if (this.check(TokenType.All)) {
        this.advance(); // all
        this.expect(TokenType.LeftBracket, "Expected '['");
        const expressions: Expression[] = [];
        if (!this.check(TokenType.RightBracket)) {
          expressions.push(this.parseExpression());
          while (this.match(TokenType.Comma)) {
            if (this.check(TokenType.RightBracket)) break;
            expressions.push(this.parseExpression());
          }
        }
        this.expect(TokenType.RightBracket, "Expected ']'");
        return { kind: "AwaitAllExpr", expressions, span };
      }
      if (this.check(TokenType.Race)) {
        this.advance(); // race
        this.expect(TokenType.LeftBracket, "Expected '['");
        const expressions: Expression[] = [];
        if (!this.check(TokenType.RightBracket)) {
          expressions.push(this.parseExpression());
          while (this.match(TokenType.Comma)) {
            if (this.check(TokenType.RightBracket)) break;
            expressions.push(this.parseExpression());
          }
        }
        this.expect(TokenType.RightBracket, "Expected ']'");
        return { kind: "AwaitRaceExpr", expressions, span };
      }
      const argument = this.parseUnary();
      return { kind: "AwaitExpr", argument, span };
    }
    if (this.match(TokenType.Spawn)) {
      const expression = this.parseUnary();
      return { kind: "SpawnExpr", expression, span };
    }
    if (this.match(TokenType.Join)) {
      // join expr — parse as await wrapping a call expression
      const argument = this.parseUnary();
      return { kind: "AwaitExpr", argument, span };
    }
    if (this.match(TokenType.Not)) {
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", operator: "!", operand, span };
    }
    if (this.match(TokenType.Minus)) {
      const operand = this.parseUnary();
      return { kind: "UnaryExpr", operator: "-", operand, span };
    }
    if (this.match(TokenType.Spread)) {
      const argument = this.parseUnary();
      return { kind: "SpreadExpr", argument, span };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LeftParen)) {
        // Call expression
        const args: Expression[] = [];
        if (!this.check(TokenType.RightParen)) {
          args.push(this.parseCallArgument());
          while (this.match(TokenType.Comma)) {
            if (this.check(TokenType.RightParen)) break;
            args.push(this.parseCallArgument());
          }
        }
        this.expect(TokenType.RightParen, "Expected ')'");
        expr = { kind: "CallExpr", callee: expr, args, span: expr.span };
      } else if (this.match(TokenType.Dot)) {
        const property = this.expectIdentifierOrKeyword();
        expr = {
          kind: "MemberExpr",
          object: expr,
          property,
          optional: false,
          span: expr.span,
        };
      } else if (this.match(TokenType.QuestionDot)) {
        const property = this.expectIdentifierOrKeyword();
        expr = {
          kind: "MemberExpr",
          object: expr,
          property,
          optional: true,
          span: expr.span,
        };
      } else if (this.match(TokenType.LeftBracket)) {
        const index = this.parseExpression();
        this.expect(TokenType.RightBracket, "Expected ']'");
        expr = { kind: "IndexExpr", object: expr, index, span: expr.span };
      } else if (this.check(TokenType.Question)) {
        // Postfix ? for Result unwrap — disambiguate from ternary
        const after = this.lookAhead(1);
        if (
          after === TokenType.Semicolon ||
          after === TokenType.RightParen ||
          after === TokenType.RightBrace ||
          after === TokenType.RightBracket ||
          after === TokenType.Comma ||
          after === TokenType.Dot ||
          after === TokenType.EOF
        ) {
          this.advance(); // consume ?
          expr = {
            kind: "ResultUnwrapExpr",
            expression: expr,
            span: expr.span,
          };
        } else {
          break; // let parseTernary handle it
        }
      } else if (this.match(TokenType.PlusPlus)) {
        expr = {
          kind: "UpdateExpr",
          operator: "++",
          argument: expr,
          prefix: false,
          span: expr.span,
        };
      } else if (this.match(TokenType.MinusMinus)) {
        expr = {
          kind: "UpdateExpr",
          operator: "--",
          argument: expr,
          prefix: false,
          span: expr.span,
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parseCallArgument(): Expression {
    // Named argument: name: value  (speculative lookahead)
    if (
      this.check(TokenType.Identifier) &&
      this.lookAhead(1) === TokenType.Colon
    ) {
      const span = this.span();
      const name = this.advance().value; // identifier
      this.advance(); // :
      const value = this.parseExpression();
      return { kind: "NamedArgExpr", name, value, span };
    }
    return this.parseExpression();
  }

  private parsePrimary(): Expression {
    const span = this.span();
    const tok = this.peek();

    // Numeric literals
    if (this.match(TokenType.IntLiteral)) {
      return { kind: "IntLiteral", value: parseInt(tok.value, 10), span };
    }
    if (this.match(TokenType.FloatLiteral)) {
      return { kind: "FloatLiteral", value: parseFloat(tok.value), span };
    }
    if (this.match(TokenType.StringLiteral)) {
      return { kind: "StringLiteral", value: tok.value, span };
    }
    if (this.check(TokenType.StringInterpStart)) {
      return this.parseStringInterpolation();
    }
    if (this.match(TokenType.BoolLiteral)) {
      return { kind: "BoolLiteral", value: tok.value === "true", span };
    }
    if (this.match(TokenType.NullLiteral)) {
      return { kind: "NullLiteral", span };
    }
    if (this.match(TokenType.This)) {
      return { kind: "ThisExpr", span };
    }

    // Ok(expr) / Err(expr)
    if (this.check(TokenType.Ok)) {
      this.advance();
      this.expect(TokenType.LeftParen, "Expected '('");
      const value = this.parseExpression();
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "OkExpr", value, span };
    }
    if (this.check(TokenType.Err)) {
      this.advance();
      this.expect(TokenType.LeftParen, "Expected '('");
      const value = this.parseExpression();
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "ErrExpr", value, span };
    }

    // chan<Type>(capacity)
    if (this.check(TokenType.Chan)) {
      this.advance(); // chan
      this.expect(TokenType.Less, "Expected '<'");
      const elementType = this.parseTypeAnnotation();
      this.expect(TokenType.Greater, "Expected '>'");
      this.expect(TokenType.LeftParen, "Expected '('");
      const capacity = this.parseExpression();
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "ChanExpr", elementType, capacity, span };
    }

    // match expression (when used in expression position)
    if (this.check(TokenType.Match)) {
      return this.parseMatchExpression();
    }

    // new Expr(args)
    if (this.match(TokenType.New)) {
      const callee = this.parsePrimary();
      this.expect(TokenType.LeftParen, "Expected '('");
      const args: Expression[] = [];
      if (!this.check(TokenType.RightParen)) {
        args.push(this.parseExpression());
        while (this.match(TokenType.Comma)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "NewExpr", callee, args, span };
    }

    // Array literal or comprehension
    if (this.match(TokenType.LeftBracket)) {
      const elements: Expression[] = [];
      if (!this.check(TokenType.RightBracket)) {
        elements.push(this.parseExpression());
        // Check for array comprehension: [expr for (x in iter)]
        if (this.check(TokenType.For)) {
          return this.parseArrayComprehension(elements[0], span);
        }
        while (this.match(TokenType.Comma)) {
          if (this.check(TokenType.RightBracket)) break;
          elements.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RightBracket, "Expected ']'");
      return { kind: "ArrayLiteral", elements, span };
    }

    // Parenthesized expression or arrow function
    if (this.check(TokenType.LeftParen)) {
      return this.parseParenOrArrow();
    }

    // Identifier
    if (this.match(TokenType.Identifier)) {
      return { kind: "Identifier", name: tok.value, span };
    }

    // Map literal: { key: value, ... }
    if (this.check(TokenType.LeftBrace)) {
      return this.parseMapLiteral();
    }

    this.diagnostics.push(
      errorDiag(`Unexpected token '${tok.value}'`, {
        file: this.file,
        line: tok.line,
        column: tok.column,
        offset: tok.offset,
      }),
    );
    this.advance();
    return { kind: "Identifier", name: "__error__", span };
  }

  private parseArrayComprehension(
    body: Expression,
    span: import("./ast.js").SourceSpan,
  ): Expression {
    this.advance(); // for
    this.expect(TokenType.LeftParen, "Expected '('");
    const variable = this.expect(
      TokenType.Identifier,
      "Expected variable name",
    ).value;
    this.expect(TokenType.In, "Expected 'in'");
    const iterable = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    let condition: Expression | undefined;
    if (this.match(TokenType.If)) {
      this.expect(TokenType.LeftParen, "Expected '('");
      condition = this.parseExpression();
      this.expect(TokenType.RightParen, "Expected ')'");
    }
    this.expect(TokenType.RightBracket, "Expected ']'");
    return {
      kind: "ArrayComprehension",
      body,
      variable,
      iterable,
      condition,
      span,
    };
  }

  private parseMapLiteral(): Expression {
    const span = this.span();
    this.advance(); // {
    const entries: { key: Expression; value: Expression }[] = [];
    if (!this.check(TokenType.RightBrace)) {
      const key = this.parseExpression();
      this.expect(TokenType.Colon, "Expected ':'");
      const value = this.parseExpression();
      entries.push({ key, value });
      while (this.match(TokenType.Comma)) {
        if (this.check(TokenType.RightBrace)) break;
        const k = this.parseExpression();
        this.expect(TokenType.Colon, "Expected ':'");
        const v = this.parseExpression();
        entries.push({ key: k, value: v });
      }
    }
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "MapLiteral", entries, span };
  }

  private parseMatchExpression(): Expression {
    const span = this.span();
    this.advance(); // match
    this.expect(TokenType.LeftParen, "Expected '('");
    const subject = this.parseExpression();
    this.expect(TokenType.RightParen, "Expected ')'");
    this.expect(TokenType.LeftBrace, "Expected '{'");
    const arms = this.parseMatchArms();
    this.expect(TokenType.RightBrace, "Expected '}'");
    return { kind: "MatchExpr", subject, arms, span };
  }

  private parseParenOrArrow(): Expression {
    // Try to detect arrow function: (params) => ...
    const saved = this.pos;
    if (this.tryParseArrowFunction()) {
      return this.tryParseArrowFunction()!;
    }
    // Restore and parse as grouped expression
    this.pos = saved;

    // Actually do the speculative parse properly
    const arrowResult = this.speculativeArrowParse();
    if (arrowResult) return arrowResult;

    // Parenthesized expression or tuple literal
    const span = this.span();
    this.advance(); // (
    const first = this.parseExpression();
    if (this.match(TokenType.Comma)) {
      // Tuple literal: (expr, expr, ...)
      const elements: Expression[] = [first];
      elements.push(this.parseExpression());
      while (this.match(TokenType.Comma)) {
        elements.push(this.parseExpression());
      }
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "TupleLiteral", elements, span };
    }
    this.expect(TokenType.RightParen, "Expected ')'");
    return first;
  }

  private tryParseArrowFunction(): Expression | null {
    // Quick lookahead: scan for ) => pattern
    let depth = 0;
    let i = this.pos;
    while (i < this.tokens.length) {
      const t = this.tokens[i].type;
      if (t === TokenType.LeftParen) depth++;
      else if (t === TokenType.RightParen) {
        depth--;
        if (depth === 0) {
          if (
            i + 1 < this.tokens.length &&
            this.tokens[i + 1].type === TokenType.Arrow
          ) {
            return null; // Signal to speculativeArrowParse
          }
          return null;
        }
      }
      i++;
    }
    return null;
  }

  private speculativeArrowParse(): Expression | null {
    const saved = this.pos;
    const savedDiags = this.diagnostics.length;

    // Check if it looks like (params) =>
    let depth = 0;
    let i = this.pos;
    while (i < this.tokens.length) {
      const t = this.tokens[i].type;
      if (t === TokenType.LeftParen) depth++;
      else if (t === TokenType.RightParen) {
        depth--;
        if (depth === 0) {
          if (
            i + 1 < this.tokens.length &&
            this.tokens[i + 1].type === TokenType.Arrow
          ) {
            // It's an arrow function
            const span = this.span();
            this.advance(); // (
            const params = this.parseArrowParams();
            this.expect(TokenType.RightParen, "Expected ')'");
            this.expect(TokenType.Arrow, "Expected '=>'");
            let body: Expression | BlockStatement;
            if (this.check(TokenType.LeftBrace)) {
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

  private parseArrowParams(): Parameter[] {
    const params: Parameter[] = [];
    if (!this.check(TokenType.RightParen)) {
      params.push(this.parseArrowParam());
      while (this.match(TokenType.Comma)) {
        params.push(this.parseArrowParam());
      }
    }
    return params;
  }

  private parseArrowParam(): Parameter {
    const span = this.span();
    // Could be: type name, or just name
    if (this.isTypeStart() && this.lookAhead(1) === TokenType.Identifier) {
      const type = this.parseTypeAnnotation();
      const name = this.expect(
        TokenType.Identifier,
        "Expected parameter name",
      ).value;
      return { name, type, span };
    }
    const name = this.expect(
      TokenType.Identifier,
      "Expected parameter name",
    ).value;
    return { name, span };
  }

  private parseStringInterpolation(): Expression {
    const span = this.span();
    const parts: (string | Expression)[] = [];

    // First part: StringInterpStart "text before ${"
    const startTok = this.advance();
    if (startTok.value) parts.push(startTok.value);

    // Parse expression inside ${...}
    parts.push(this.parseExpression());

    // Continue: either StringInterpMiddle (more ${) or StringInterpEnd (closing ")
    while (this.check(TokenType.StringInterpMiddle)) {
      const mid = this.advance();
      if (mid.value) parts.push(mid.value);
      parts.push(this.parseExpression());
    }

    if (this.check(TokenType.StringInterpEnd)) {
      const end = this.advance();
      if (end.value) parts.push(end.value);
    } else {
      this.expect(
        TokenType.StringInterpEnd,
        "Expected end of interpolated string",
      );
    }

    return { kind: "StringInterpolation", parts, span };
  }
}
