export enum TokenType {
  // Literals
  IntLiteral = "IntLiteral",
  FloatLiteral = "FloatLiteral",
  StringLiteral = "StringLiteral",
  BoolLiteral = "BoolLiteral",
  NullLiteral = "NullLiteral",

  // Identifier
  Identifier = "Identifier",

  // Type keywords
  Int = "Int",
  Float = "Float",
  String = "String",
  Bool = "Bool",
  Void = "Void",
  Var = "Var",
  Type = "Type",

  // Structure keywords
  Struct = "Struct",
  Class = "Class",
  Interface = "Interface",
  Enum = "Enum",
  New = "New",
  This = "This",

  // Control flow
  If = "If",
  Else = "Else",
  For = "For",
  While = "While",
  Return = "Return",
  Match = "Match",
  Break = "Break",
  Continue = "Continue",
  In = "In",
  Is = "Is",
  Await = "Await",

  // Error handling
  Try = "Try",
  Catch = "Catch",
  Ok = "Ok",
  Err = "Err",
  Result = "Result",

  // Const
  Const = "Const",

  // Module
  Take = "Take",
  From = "From",
  Load = "Load",
  Declare = "Declare",
  Module = "Module",

  // Operators
  Plus = "Plus",
  Minus = "Minus",
  Star = "Star",
  Slash = "Slash",
  Percent = "Percent",
  Assign = "Assign",
  Equal = "Equal",
  NotEqual = "NotEqual",
  Less = "Less",
  LessEqual = "LessEqual",
  Greater = "Greater",
  GreaterEqual = "GreaterEqual",
  And = "And",
  Or = "Or",
  Not = "Not",
  PlusPlus = "PlusPlus",
  MinusMinus = "MinusMinus",
  PlusAssign = "PlusAssign",
  MinusAssign = "MinusAssign",
  StarAssign = "StarAssign",
  SlashAssign = "SlashAssign",
  PercentAssign = "PercentAssign",
  Arrow = "Arrow",
  PipeArrow = "PipeArrow",
  Bar = "Bar",
  DotDot = "DotDot",
  Dot = "Dot",
  Spread = "Spread",
  QuestionDot = "QuestionDot",
  QuestionQuestion = "QuestionQuestion",
  Question = "Question",

  // Delimiters
  LeftParen = "LeftParen",
  RightParen = "RightParen",
  LeftBrace = "LeftBrace",
  RightBrace = "RightBrace",
  LeftBracket = "LeftBracket",
  RightBracket = "RightBracket",
  Comma = "Comma",
  Colon = "Colon",
  Semicolon = "Semicolon",

  // String interpolation
  StringInterpStart = "StringInterpStart", // opening " ... ${
  StringInterpMiddle = "StringInterpMiddle", // } ... ${
  StringInterpEnd = "StringInterpEnd", // } ... "

  // Additional keywords
  Throw = "Throw",
  Do = "Do",
  As = "As",
  Finally = "Finally",
  Never = "Never",
  Defer = "Defer",
  Extend = "Extend",
  Operator = "Operator",
  Get = "Get",
  Set = "Set",
  Spawn = "Spawn",
  Join = "Join",
  Chan = "Chan",
  All = "All",
  Race = "Race",

  // Additional operators
  Ampersand = "Ampersand",
  At = "At",

  // Doc comment
  DocComment = "DocComment",

  // Special
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  offset: number;
}

export function token(
  type: TokenType,
  value: string,
  line: number,
  column: number,
  offset: number,
): Token {
  return { type, value, line, column, offset };
}
