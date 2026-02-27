import { Program, Statement, SourceSpan } from "../parser/ast.js";

export interface SymbolEntry {
  name: string;
  kind: string;
  span: SourceSpan;
}

/**
 * Walk the AST and collect all top-level and nested declarations.
 * Returns a map from name → definition location.
 */
export function buildSymbolIndex(program: Program): Map<string, SymbolEntry> {
  const symbols = new Map<string, SymbolEntry>();

  function visitStmt(stmt: Statement): void {
    switch (stmt.kind) {
      case "FunctionDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "function",
          span: stmt.span,
        });
        visitStmt(stmt.body);
        break;
      case "VariableDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "variable",
          span: stmt.span,
        });
        break;
      case "StructDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "struct",
          span: stmt.span,
        });
        for (const m of stmt.methods) visitStmt(m as unknown as Statement);
        break;
      case "ClassDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "class",
          span: stmt.span,
        });
        for (const m of stmt.methods) visitStmt(m as unknown as Statement);
        break;
      case "InterfaceDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "interface",
          span: stmt.span,
        });
        break;
      case "EnumDeclaration":
        symbols.set(stmt.name, {
          name: stmt.name,
          kind: "enum",
          span: stmt.span,
        });
        break;
      case "BlockStatement":
        for (const s of stmt.body) visitStmt(s);
        break;
      case "IfStatement":
        visitStmt(stmt.consequent);
        if (stmt.alternate) visitStmt(stmt.alternate);
        break;
      case "WhileStatement":
        visitStmt(stmt.body);
        break;
      case "ForStatement":
        if (stmt.init) visitStmt(stmt.init);
        visitStmt(stmt.body);
        break;
      case "ForInStatement":
        visitStmt(stmt.body);
        break;
      case "TryCatchStatement":
        visitStmt(stmt.tryBlock);
        visitStmt(stmt.catchBlock);
        break;
    }
  }

  for (const stmt of program.body) {
    visitStmt(stmt);
  }

  return symbols;
}
