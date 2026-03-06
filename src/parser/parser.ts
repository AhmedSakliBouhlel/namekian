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
} from "./ast.js";

const TYPE_KEYWORDS = new Set([
  TokenType.Int,
  TokenType.Float,
  TokenType.String,
  TokenType.Bool,
  TokenType.Void,
  TokenType.Var,
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
    // type ident
    if (this.lookAhead(1) === TokenType.Identifier) return true;
    // type? ident (nullable)
    if (
      this.lookAhead(1) === TokenType.Question &&
      this.lookAhead(2) === TokenType.Identifier
    )
      return true;
    // type[] ident (array)
    if (
      this.lookAhead(1) === TokenType.LeftBracket &&
      this.lookAhead(2) === TokenType.RightBracket &&
      this.lookAhead(3) === TokenType.Identifier
    )
      return true;
    // type<...> ident (generic) — scan for matching >
    if (this.lookAhead(1) === TokenType.Less) {
      let depth = 1;
      let i = 2;
      while (depth > 0 && this.lookAhead(i) !== TokenType.EOF) {
        if (this.lookAhead(i) === TokenType.Less) depth++;
        else if (this.lookAhead(i) === TokenType.Greater) depth--;
        i++;
      }
      // After > could be ? or [] then ident, or just ident
      const next = this.lookAhead(i);
      if (next === TokenType.Identifier) return true;
      if (
        next === TokenType.Question &&
        this.lookAhead(i + 1) === TokenType.Identifier
      )
        return true;
    }
    return false;
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
      t === TokenType.Result
    );
  }

  private parseTypeAnnotation(): TypeAnnotation {
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
    if (t === TokenType.Struct) return this.parseStructDeclaration();
    if (t === TokenType.Class) return this.parseClassDeclaration();
    if (t === TokenType.Interface) return this.parseInterfaceDeclaration();
    if (t === TokenType.Enum) return this.parseEnumDeclaration();
    if (t === TokenType.Try) return this.parseTryCatch();
    if (t === TokenType.Match) return this.parseMatchStatement();
    if (t === TokenType.Declare) return this.parseDeclareModule();

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
      return this.parseTypedDeclaration();
    }

    // Tuple type declaration: (type, type) name = ...
    if (this.check(TokenType.LeftParen) && this.looksLikeTupleTypeDecl()) {
      return this.parseTypedDeclaration();
    }

    return this.parseExpressionStatement();
  }

  private parseTypedDeclaration(): Statement {
    const span = this.span();
    const type = this.parseTypeAnnotation();
    const name = this.expect(TokenType.Identifier, "Expected identifier").value;

    // Function: type name<T>(...) or type name(...)
    const typeParams = this.parseTypeParams();
    if (this.check(TokenType.LeftParen)) {
      return this.parseFunctionRest(name, type, span, typeParams);
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

  private parseTypeParams(): string[] {
    const typeParams: string[] = [];
    if (this.check(TokenType.Less)) {
      this.advance(); // <
      typeParams.push(
        this.expect(TokenType.Identifier, "Expected type parameter").value,
      );
      while (this.match(TokenType.Comma)) {
        typeParams.push(
          this.expect(TokenType.Identifier, "Expected type parameter").value,
        );
      }
      this.expect(TokenType.Greater, "Expected '>'");
    }
    return typeParams;
  }

  private parseFunctionRest(
    name: string,
    returnType: TypeAnnotation,
    span: SourceSpan,
    typeParams: string[] = [],
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
      return { name, type, defaultValue, span };
    }
    const name = this.expect(
      TokenType.Identifier,
      "Expected parameter name",
    ).value;
    let defaultValue: Expression | undefined;
    if (this.match(TokenType.Assign)) {
      defaultValue = this.parseExpression();
    }
    return { name, defaultValue, span };
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
    const names: string[] = [];
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
      const name = this.expect(
        TokenType.Identifier,
        "Expected identifier",
      ).value;
      if (this.check(TokenType.LeftParen)) {
        // Function signature: returnType name(params);
        this.advance(); // (
        const params: Parameter[] = [];
        while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
          const pSpan = this.span();
          const pType = this.parseTypeAnnotation();
          const pName = this.expect(
            TokenType.Identifier,
            "Expected parameter name",
          ).value;
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

  private parseStructDeclaration(): Statement {
    const span = this.span();
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
      if (this.isTypeStart()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expect(
          TokenType.Identifier,
          "Expected field name",
        ).value;
        if (this.check(TokenType.LeftParen)) {
          methods.push(this.parseFunctionRest(fname, type, fSpan));
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
      span,
    };
  }

  private parseClassDeclaration(): Statement {
    const span = this.span();
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
      if (this.isTypeStart()) {
        const fSpan = this.span();
        const type = this.parseTypeAnnotation();
        const fname = this.expect(
          TokenType.Identifier,
          "Expected field/method name",
        ).value;
        if (this.check(TokenType.LeftParen)) {
          methods.push(this.parseFunctionRest(fname, type, fSpan));
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

  private parseEnumDeclaration(): Statement {
    const span = this.span();
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
    return { kind: "EnumDeclaration", name, variants, span };
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
    this.expect(TokenType.Catch, "Expected 'catch'");
    let catchBinding: string | undefined;
    if (this.match(TokenType.LeftParen)) {
      catchBinding = this.expect(
        TokenType.Identifier,
        "Expected catch binding",
      ).value;
      this.expect(TokenType.RightParen, "Expected ')'");
    }
    const catchBlock = this.parseBlock();
    return {
      kind: "TryCatchStatement",
      tryBlock,
      catchBinding,
      catchBlock,
      span,
    };
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
    this.expect(TokenType.Arrow, "Expected '=>'");
    let body: Expression | BlockStatement;
    if (this.check(TokenType.LeftBrace)) {
      body = this.parseBlock();
    } else {
      body = this.parseExpression();
      this.match(TokenType.Comma);
    }
    return { pattern, body, span };
  }

  private parseMatchPattern(): MatchPattern {
    const span = this.span();

    if (this.match(TokenType.Ok)) {
      this.expect(TokenType.LeftParen, "Expected '('");
      const binding = this.expect(
        TokenType.Identifier,
        "Expected binding",
      ).value;
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "OkPattern", binding, span };
    }

    if (this.match(TokenType.Err)) {
      this.expect(TokenType.LeftParen, "Expected '('");
      const binding = this.expect(
        TokenType.Identifier,
        "Expected binding",
      ).value;
      this.expect(TokenType.RightParen, "Expected ')'");
      return { kind: "ErrPattern", binding, span };
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
      // EnumVariantPattern: Enum.Variant or Enum.Variant(bindings)
      if (this.match(TokenType.Dot)) {
        const variant = this.expect(
          TokenType.Identifier,
          "Expected variant name",
        ).value;
        const bindings: string[] = [];
        if (this.match(TokenType.LeftParen)) {
          if (!this.check(TokenType.RightParen)) {
            bindings.push(
              this.expect(TokenType.Identifier, "Expected binding name").value,
            );
            while (this.match(TokenType.Comma)) {
              bindings.push(
                this.expect(TokenType.Identifier, "Expected binding name")
                  .value,
              );
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
          args.push(this.parseExpression());
          while (this.match(TokenType.Comma)) {
            args.push(this.parseExpression());
          }
        }
        this.expect(TokenType.RightParen, "Expected ')'");
        expr = { kind: "CallExpr", callee: expr, args, span: expr.span };
      } else if (this.match(TokenType.Dot)) {
        const property = this.expect(
          TokenType.Identifier,
          "Expected property name",
        ).value;
        expr = {
          kind: "MemberExpr",
          object: expr,
          property,
          optional: false,
          span: expr.span,
        };
      } else if (this.match(TokenType.QuestionDot)) {
        const property = this.expect(
          TokenType.Identifier,
          "Expected property name",
        ).value;
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
