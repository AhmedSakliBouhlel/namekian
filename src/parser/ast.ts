export interface SourceSpan {
  line: number;
  column: number;
  offset: number;
}

// Type annotations
export type TypeAnnotation =
  | NamedType
  | ArrayType
  | NullableType
  | GenericType
  | FunctionType
  | TupleType;

export interface NamedType {
  kind: "NamedType";
  name: string;
  span: SourceSpan;
}

export interface ArrayType {
  kind: "ArrayType";
  elementType: TypeAnnotation;
  span: SourceSpan;
}

export interface NullableType {
  kind: "NullableType";
  innerType: TypeAnnotation;
  span: SourceSpan;
}

export interface GenericType {
  kind: "GenericType";
  name: string;
  typeArgs: TypeAnnotation[];
  span: SourceSpan;
}

export interface FunctionType {
  kind: "FunctionType";
  params: TypeAnnotation[];
  returnType: TypeAnnotation;
  span: SourceSpan;
}

export interface TupleType {
  kind: "TupleType";
  elements: TypeAnnotation[];
  span: SourceSpan;
}

// Expressions
export type Expression =
  | IntLiteralExpr
  | FloatLiteralExpr
  | StringLiteralExpr
  | BoolLiteralExpr
  | NullLiteralExpr
  | IdentifierExpr
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | MemberExpr
  | IndexExpr
  | AssignExpr
  | ArrowFunctionExpr
  | NewExpr
  | ThisExpr
  | ArrayLiteralExpr
  | MapLiteralExpr
  | OkExpr
  | ErrExpr
  | MatchExpr
  | StringInterpolationExpr
  | CompoundAssignExpr
  | UpdateExpr
  | TernaryExpr
  | SpreadExpr
  | PipeExpr
  | RangeExpr
  | TupleLiteralExpr;

export interface IntLiteralExpr {
  kind: "IntLiteral";
  value: number;
  span: SourceSpan;
}

export interface FloatLiteralExpr {
  kind: "FloatLiteral";
  value: number;
  span: SourceSpan;
}

export interface StringLiteralExpr {
  kind: "StringLiteral";
  value: string;
  span: SourceSpan;
}

export interface StringInterpolationExpr {
  kind: "StringInterpolation";
  parts: (string | Expression)[];
  span: SourceSpan;
}

export interface BoolLiteralExpr {
  kind: "BoolLiteral";
  value: boolean;
  span: SourceSpan;
}

export interface NullLiteralExpr {
  kind: "NullLiteral";
  span: SourceSpan;
}

export interface IdentifierExpr {
  kind: "Identifier";
  name: string;
  span: SourceSpan;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  operator: string;
  left: Expression;
  right: Expression;
  span: SourceSpan;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  operator: string;
  operand: Expression;
  span: SourceSpan;
}

export interface CallExpr {
  kind: "CallExpr";
  callee: Expression;
  args: Expression[];
  span: SourceSpan;
}

export interface MemberExpr {
  kind: "MemberExpr";
  object: Expression;
  property: string;
  optional: boolean;
  span: SourceSpan;
}

export interface IndexExpr {
  kind: "IndexExpr";
  object: Expression;
  index: Expression;
  span: SourceSpan;
}

export interface AssignExpr {
  kind: "AssignExpr";
  target: Expression;
  value: Expression;
  span: SourceSpan;
}

export interface CompoundAssignExpr {
  kind: "CompoundAssignExpr";
  operator: "+=" | "-=" | "*=" | "/=" | "%=";
  target: Expression;
  value: Expression;
  span: SourceSpan;
}

export interface UpdateExpr {
  kind: "UpdateExpr";
  operator: "++" | "--";
  argument: Expression;
  prefix: boolean;
  span: SourceSpan;
}

export interface TernaryExpr {
  kind: "TernaryExpr";
  condition: Expression;
  consequent: Expression;
  alternate: Expression;
  span: SourceSpan;
}

export interface SpreadExpr {
  kind: "SpreadExpr";
  argument: Expression;
  span: SourceSpan;
}

export interface PipeExpr {
  kind: "PipeExpr";
  left: Expression;
  right: Expression;
  span: SourceSpan;
}

export interface RangeExpr {
  kind: "RangeExpr";
  start: Expression;
  end: Expression;
  inclusive: boolean;
  span: SourceSpan;
}

export interface TupleLiteralExpr {
  kind: "TupleLiteral";
  elements: Expression[];
  span: SourceSpan;
}

export interface ArrowFunctionExpr {
  kind: "ArrowFunction";
  params: Parameter[];
  returnType?: TypeAnnotation;
  body: Expression | BlockStatement;
  span: SourceSpan;
}

export interface NewExpr {
  kind: "NewExpr";
  callee: Expression;
  args: Expression[];
  span: SourceSpan;
}

export interface ThisExpr {
  kind: "ThisExpr";
  span: SourceSpan;
}

export interface ArrayLiteralExpr {
  kind: "ArrayLiteral";
  elements: Expression[];
  span: SourceSpan;
}

export interface MapLiteralExpr {
  kind: "MapLiteral";
  entries: { key: Expression; value: Expression }[];
  span: SourceSpan;
}

export interface OkExpr {
  kind: "OkExpr";
  value: Expression;
  span: SourceSpan;
}

export interface ErrExpr {
  kind: "ErrExpr";
  value: Expression;
  span: SourceSpan;
}

export interface MatchExpr {
  kind: "MatchExpr";
  subject: Expression;
  arms: MatchArm[];
  span: SourceSpan;
}

export interface MatchArm {
  pattern: MatchPattern;
  body: Expression | BlockStatement;
  span: SourceSpan;
}

export type MatchPattern =
  | { kind: "OkPattern"; binding: string; span: SourceSpan }
  | { kind: "ErrPattern"; binding: string; span: SourceSpan }
  | { kind: "LiteralPattern"; value: Expression; span: SourceSpan }
  | { kind: "WildcardPattern"; span: SourceSpan }
  | { kind: "IdentifierPattern"; name: string; span: SourceSpan }
  | {
      kind: "EnumVariantPattern";
      enumName: string;
      variant: string;
      bindings: string[];
      span: SourceSpan;
    };

// Parameters
export interface Parameter {
  name: string;
  type?: TypeAnnotation;
  defaultValue?: Expression;
  span: SourceSpan;
}

// Statements
export type Statement =
  | VariableDeclaration
  | FunctionDeclaration
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | ForStatement
  | ForInStatement
  | BlockStatement
  | ExpressionStatement
  | StructDeclaration
  | ClassDeclaration
  | InterfaceDeclaration
  | EnumDeclaration
  | TakeStatement
  | LoadStatement
  | TryCatchStatement
  | BreakStatement
  | ContinueStatement
  | MatchStatement
  | TypeAliasStatement
  | DestructureDeclaration;

export interface VariableDeclaration {
  kind: "VariableDeclaration";
  name: string;
  type?: TypeAnnotation;
  initializer: Expression;
  span: SourceSpan;
}

export interface FunctionDeclaration {
  kind: "FunctionDeclaration";
  name: string;
  typeParams: string[];
  params: Parameter[];
  returnType?: TypeAnnotation;
  body: BlockStatement;
  span: SourceSpan;
}

export interface ReturnStatement {
  kind: "ReturnStatement";
  value?: Expression;
  span: SourceSpan;
}

export interface IfStatement {
  kind: "IfStatement";
  condition: Expression;
  consequent: BlockStatement;
  alternate?: BlockStatement | IfStatement;
  span: SourceSpan;
}

export interface WhileStatement {
  kind: "WhileStatement";
  condition: Expression;
  body: BlockStatement;
  span: SourceSpan;
}

export interface ForStatement {
  kind: "ForStatement";
  init?: VariableDeclaration | ExpressionStatement;
  condition?: Expression;
  update?: Expression;
  body: BlockStatement;
  span: SourceSpan;
}

export interface ForInStatement {
  kind: "ForInStatement";
  variable: string;
  iterable: Expression;
  body: BlockStatement;
  span: SourceSpan;
}

export interface BlockStatement {
  kind: "BlockStatement";
  body: Statement[];
  span: SourceSpan;
}

export interface ExpressionStatement {
  kind: "ExpressionStatement";
  expression: Expression;
  span: SourceSpan;
}

export interface StructField {
  name: string;
  type: TypeAnnotation;
  span: SourceSpan;
}

export interface StructDeclaration {
  kind: "StructDeclaration";
  name: string;
  typeParams: string[];
  fields: StructField[];
  methods: FunctionDeclaration[];
  span: SourceSpan;
}

export interface ClassDeclaration {
  kind: "ClassDeclaration";
  name: string;
  typeParams: string[];
  superClass?: string;
  interfaces: string[];
  fields: StructField[];
  methods: FunctionDeclaration[];
  span: SourceSpan;
}

export interface InterfaceMethod {
  name: string;
  params: Parameter[];
  returnType?: TypeAnnotation;
  span: SourceSpan;
}

export interface InterfaceDeclaration {
  kind: "InterfaceDeclaration";
  name: string;
  methods: InterfaceMethod[];
  fields: StructField[];
  span: SourceSpan;
}

export interface EnumVariant {
  name: string;
  value?: Expression;
  fields?: { name: string; type: TypeAnnotation }[];
  span: SourceSpan;
}

export interface EnumDeclaration {
  kind: "EnumDeclaration";
  name: string;
  variants: EnumVariant[];
  span: SourceSpan;
}

export interface TakeStatement {
  kind: "TakeStatement";
  names: string[];
  path: string;
  span: SourceSpan;
}

export interface LoadStatement {
  kind: "LoadStatement";
  name: string;
  path: string;
  span: SourceSpan;
}

export interface TryCatchStatement {
  kind: "TryCatchStatement";
  tryBlock: BlockStatement;
  catchBinding?: string;
  catchBlock: BlockStatement;
  span: SourceSpan;
}

export interface BreakStatement {
  kind: "BreakStatement";
  span: SourceSpan;
}

export interface ContinueStatement {
  kind: "ContinueStatement";
  span: SourceSpan;
}

export interface MatchStatement {
  kind: "MatchStatement";
  subject: Expression;
  arms: MatchArm[];
  span: SourceSpan;
}

export interface DestructureDeclaration {
  kind: "DestructureDeclaration";
  pattern: "object" | "array";
  names: string[];
  initializer: Expression;
  span: SourceSpan;
}

export interface TypeAliasStatement {
  kind: "TypeAlias";
  name: string;
  type: TypeAnnotation;
  span: SourceSpan;
}

// Program
export interface Program {
  kind: "Program";
  body: Statement[];
  span: SourceSpan;
}
