// Public API
export { Lexer } from "./lexer/lexer.js";
export { TokenType } from "./lexer/token.js";
export type { Token } from "./lexer/token.js";
export { Parser } from "./parser/parser.js";
export { CodeGenerator } from "./codegen/codegen.js";
export { TypeChecker } from "./checker/checker.js";
export { compile } from "./compiler.js";
export type { CompileResult, CompileOptions } from "./compiler.js";

// CLI entry point
import { cli } from "./cli.js";
cli(process.argv.slice(2));
