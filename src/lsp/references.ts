import { Program, Statement, Expression } from "../parser/ast.js";
import { findNodeAtOffset } from "./hover.js";

export interface ReferenceLocation {
  offset: number;
  line: number;
  column: number;
}

export function getReferences(
  ast: Program,
  _source: string,
  offset: number,
  uri: string,
): { uri: string; offset: number; line: number; column: number }[] {
  const node = findNodeAtOffset(ast, offset);
  if (!node || node.kind !== "Identifier") return [];

  const targetName = node.name;
  const results: {
    uri: string;
    offset: number;
    line: number;
    column: number;
  }[] = [];

  function visitExpr(expr: Expression): void {
    if (expr.kind === "Identifier" && expr.name === targetName) {
      results.push({
        uri,
        offset: expr.span.offset,
        line: expr.span.line,
        column: expr.span.column,
      });
    }

    switch (expr.kind) {
      case "BinaryExpr":
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case "UnaryExpr":
        visitExpr(expr.operand);
        break;
      case "CallExpr":
        visitExpr(expr.callee);
        for (const arg of expr.args) visitExpr(arg);
        break;
      case "MemberExpr":
        visitExpr(expr.object);
        break;
      case "IndexExpr":
        visitExpr(expr.object);
        visitExpr(expr.index);
        break;
      case "AssignExpr":
        visitExpr(expr.target);
        visitExpr(expr.value);
        break;
      case "CompoundAssignExpr":
        visitExpr(expr.target);
        visitExpr(expr.value);
        break;
      case "ArrowFunction":
        if (expr.body.kind === "BlockStatement") {
          visitStmt(expr.body);
        } else {
          visitExpr(expr.body);
        }
        break;
      case "NewExpr":
        visitExpr(expr.callee);
        for (const arg of expr.args) visitExpr(arg);
        break;
      case "ArrayLiteral":
        for (const el of expr.elements) visitExpr(el);
        break;
      case "OkExpr":
        visitExpr(expr.value);
        break;
      case "ErrExpr":
        visitExpr(expr.value);
        break;
      case "MatchExpr":
        visitExpr(expr.subject);
        for (const arm of expr.arms) {
          if (arm.body.kind === "BlockStatement") {
            visitStmt(arm.body);
          } else {
            visitExpr(arm.body);
          }
        }
        break;
      case "StringInterpolation":
        for (const part of expr.parts) {
          if (typeof part !== "string") visitExpr(part);
        }
        break;
      case "UpdateExpr":
        visitExpr(expr.argument);
        break;
      case "TernaryExpr":
        visitExpr(expr.condition);
        visitExpr(expr.consequent);
        visitExpr(expr.alternate);
        break;
      case "SpreadExpr":
        visitExpr(expr.argument);
        break;
      case "PipeExpr":
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case "RangeExpr":
        visitExpr(expr.start);
        visitExpr(expr.end);
        break;
      case "TupleLiteral":
        for (const el of expr.elements) visitExpr(el);
        break;
      case "NullCoalesceExpr":
        visitExpr(expr.left);
        visitExpr(expr.right);
        break;
      case "ArrayComprehension":
        visitExpr(expr.iterable);
        visitExpr(expr.body);
        if (expr.condition) visitExpr(expr.condition);
        break;
      case "TypeGuardExpr":
        visitExpr(expr.expression);
        break;
      case "AwaitExpr":
        visitExpr(expr.argument);
        break;
      case "ResultUnwrapExpr":
        visitExpr(expr.expression);
        break;
    }
  }

  function visitStmt(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        // Check if declaration name matches
        if (stmt.name === targetName) {
          results.push({
            uri,
            offset: stmt.span.offset,
            line: stmt.span.line,
            column: stmt.span.column,
          });
        }
        visitExpr(stmt.initializer);
        break;
      case "FunctionDeclaration":
        if (stmt.name === targetName) {
          results.push({
            uri,
            offset: stmt.span.offset,
            line: stmt.span.line,
            column: stmt.span.column,
          });
        }
        visitStmt(stmt.body);
        break;
      case "ReturnStatement":
        if (stmt.value) visitExpr(stmt.value);
        break;
      case "IfStatement":
        visitExpr(stmt.condition);
        visitStmt(stmt.consequent);
        if (stmt.alternate) visitStmt(stmt.alternate);
        break;
      case "WhileStatement":
        visitExpr(stmt.condition);
        visitStmt(stmt.body);
        break;
      case "ForStatement":
        if (stmt.init) visitStmt(stmt.init);
        if (stmt.condition) visitExpr(stmt.condition);
        if (stmt.update) visitExpr(stmt.update);
        visitStmt(stmt.body);
        break;
      case "ForInStatement":
        visitExpr(stmt.iterable);
        visitStmt(stmt.body);
        break;
      case "BlockStatement":
        for (const s of stmt.body) visitStmt(s);
        break;
      case "ExpressionStatement":
        visitExpr(stmt.expression);
        break;
      case "StructDeclaration":
        for (const m of stmt.methods) visitStmt(m.body);
        break;
      case "ClassDeclaration":
        for (const m of stmt.methods) visitStmt(m.body);
        break;
      case "TryCatchStatement":
        visitStmt(stmt.tryBlock);
        visitStmt(stmt.catchBlock);
        break;
      case "MatchStatement":
        visitExpr(stmt.subject);
        for (const arm of stmt.arms) {
          if (arm.body.kind === "BlockStatement") {
            visitStmt(arm.body);
          } else {
            visitExpr(arm.body);
          }
        }
        break;
      case "DestructureDeclaration":
        visitExpr(stmt.initializer);
        break;
    }
  }

  for (const stmt of ast.body) {
    visitStmt(stmt);
  }

  // Deduplicate by offset
  const seen = new Set<number>();
  return results.filter((r) => {
    if (seen.has(r.offset)) return false;
    seen.add(r.offset);
    return true;
  });
}
