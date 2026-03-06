import { Program, Statement, Expression } from "../parser/ast.js";

/**
 * Walk the AST to find the innermost expression node whose span contains
 * the given byte offset. Returns the Expression node or null.
 */
export function findNodeAtOffset(
  program: Program,
  offset: number,
): Expression | null {
  let best: Expression | null = null;

  function visitExpr(expr: Expression): void {
    // Check if this expression's span offset is close to the target
    // Since we don't have end offsets, we track the closest node at or before the offset
    if (expr.span.offset <= offset) {
      if (!best || expr.span.offset >= best.span.offset) {
        best = expr;
      }
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
      case "TypeGuardExpr":
        visitExpr(expr.expression);
        break;
      case "AwaitExpr":
        visitExpr(expr.argument);
        break;
      case "ResultUnwrapExpr":
        visitExpr(expr.expression);
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
      case "MapLiteral":
        for (const e of expr.entries) {
          visitExpr(e.key);
          visitExpr(e.value);
        }
        break;
      case "NamedArgExpr":
        visitExpr(expr.value);
        break;
      case "AwaitAllExpr":
        for (const e of expr.expressions) visitExpr(e);
        break;
      case "AwaitRaceExpr":
        for (const e of expr.expressions) visitExpr(e);
        break;
      case "SpawnExpr":
        visitExpr(expr.expression);
        break;
      case "ChanExpr":
        visitExpr(expr.capacity);
        break;
    }
  }

  function visitStmt(stmt: Statement): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        visitExpr(stmt.initializer);
        break;
      case "FunctionDeclaration":
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
      case "DeferStatement":
        visitStmt(stmt.body);
        break;
      case "ExtensionDeclaration":
        for (const m of stmt.methods) visitStmt(m.body);
        break;
    }
  }

  for (const stmt of program.body) {
    visitStmt(stmt);
  }

  return best;
}
