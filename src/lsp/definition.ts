import { Program, Statement, Expression, MemberExpr } from "../parser/ast.js";
import { findNodeAtOffset } from "./hover.js";
import { buildSymbolIndex } from "./symbol-index.js";
import { nkSpanToLspRange } from "./span-utils.js";
import { NkType } from "../checker/types.js";

export interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Find MemberExpr nodes whose property span covers the given offset.
 */
function findMemberExprAtOffset(
  program: Program,
  offset: number,
): MemberExpr | null {
  let best: MemberExpr | null = null;

  function visitExpr(expr: Expression): void {
    if (expr.kind === "MemberExpr") {
      // The property starts after the object + "."
      // We estimate property offset as: expr.span.offset + (source up to '.') + 1
      // Since we don't have exact property offset, check if offset is beyond object span
      // and within the MemberExpr span range
      const objEnd = getExprEnd(expr.object);
      if (offset >= objEnd) {
        if (!best || expr.span.offset >= best.span.offset) {
          best = expr;
        }
      }
      visitExpr(expr.object);
    } else {
      visitChildren(expr);
    }
  }

  function getExprEnd(expr: Expression): number {
    // Rough estimate: span offset + some length
    // For identifiers, we know the name length
    if (expr.kind === "Identifier") return expr.span.offset + expr.name.length;
    if (expr.kind === "MemberExpr") return expr.span.offset; // conservative
    return expr.span.offset + 1;
  }

  function visitChildren(expr: Expression): void {
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
      case "ThrowStatement":
        visitExpr(stmt.argument);
        break;
      case "DoWhileStatement":
        visitExpr(stmt.condition);
        visitStmt(stmt.body);
        break;
      case "TryCatchStatement":
        visitStmt(stmt.tryBlock);
        if (stmt.catchBlock) visitStmt(stmt.catchBlock);
        if (stmt.finallyBlock) visitStmt(stmt.finallyBlock);
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

/**
 * Find the definition location of the identifier at the given offset.
 * Supports member-access go-to-definition when typeMap is provided.
 */
export function getDefinition(
  ast: Program,
  source: string,
  offset: number,
  uri: string,
  typeMap?: Map<number, NkType>,
): LspLocation | null {
  const node = findNodeAtOffset(ast, offset);

  // Try member-access go-to-definition
  if (typeMap) {
    const memberExpr = findMemberExprAtOffset(ast, offset);
    if (memberExpr) {
      const objType = typeMap.get(memberExpr.object.span.offset);
      if (objType) {
        const structName =
          objType.tag === "struct"
            ? objType.name
            : objType.tag === "class"
              ? objType.name
              : null;
        if (structName) {
          // Find the struct/class declaration in the AST
          const fieldSpan = findFieldInDeclaration(
            ast,
            structName,
            memberExpr.property,
          );
          if (fieldSpan) {
            const range = nkSpanToLspRange(
              source,
              fieldSpan,
              memberExpr.property.length,
            );
            return { uri, range };
          }
        }
      }
    }
  }

  if (!node || node.kind !== "Identifier") return null;

  const symbols = buildSymbolIndex(ast);
  const entry = symbols.get(node.name);
  if (!entry) return null;

  const range = nkSpanToLspRange(source, entry.span, entry.name.length);
  return { uri, range };
}

/**
 * Find the span of a field/method within a struct or class declaration.
 */
function findFieldInDeclaration(
  ast: Program,
  typeName: string,
  fieldName: string,
): { line: number; column: number; offset: number } | null {
  for (const stmt of ast.body) {
    if (stmt.kind === "StructDeclaration" && stmt.name === typeName) {
      // Check fields
      for (const field of stmt.fields) {
        if (field.name === fieldName) {
          return field.span;
        }
      }
      // Check methods
      for (const method of stmt.methods) {
        if (method.name === fieldName) {
          return method.span;
        }
      }
    }
    if (stmt.kind === "ClassDeclaration" && stmt.name === typeName) {
      for (const field of stmt.fields) {
        if (field.name === fieldName) {
          return field.span;
        }
      }
      for (const method of stmt.methods) {
        if (method.name === fieldName) {
          return method.span;
        }
      }
    }
  }
  return null;
}
