import { Program, Statement, Expression } from "../parser/ast.js";
import { findNodeAtOffset } from "./hover.js";

export interface ReferenceLocation {
  offset: number;
  line: number;
  column: number;
}

/**
 * Scope-aware reference finder.
 * Tracks nested scopes so that identifiers with the same name
 * in unrelated scopes are not conflated.
 */
export function getReferences(
  ast: Program,
  _source: string,
  offset: number,
  uri: string,
): { uri: string; offset: number; line: number; column: number }[] {
  const node = findNodeAtOffset(ast, offset);
  if (!node || node.kind !== "Identifier") return [];

  const targetName = node.name;

  // Phase 1: Build a scope tree and find which scope the target belongs to.
  // Each scope has an id, parent, and a set of names declared in it.
  interface Scope {
    id: number;
    parent: number | null;
    declarations: Set<string>;
  }

  const scopes: Scope[] = [];
  let nextScopeId = 0;

  // Map from (scopeId, name) → array of offsets where the name is referenced/declared
  const refMap = new Map<
    string,
    { offset: number; line: number; column: number }[]
  >();

  function makeScope(parent: number | null): number {
    const id = nextScopeId++;
    scopes.push({ id, parent, declarations: new Set() });
    return id;
  }

  function refKey(scopeId: number, name: string): string {
    return `${scopeId}:${name}`;
  }

  // Find the deepest scope that declares a name, starting from the given scope
  function findDeclaringScope(scopeId: number, name: string): number | null {
    let current: number | null = scopeId;
    while (current !== null) {
      if (scopes[current].declarations.has(name)) return current;
      current = scopes[current].parent;
    }
    return null;
  }

  function addRef(
    scopeId: number,
    name: string,
    span: { offset: number; line: number; column: number },
  ) {
    const declScope = findDeclaringScope(scopeId, name);
    const key = refKey(declScope ?? scopeId, name);
    let arr = refMap.get(key);
    if (!arr) {
      arr = [];
      refMap.set(key, arr);
    }
    arr.push({ offset: span.offset, line: span.line, column: span.column });
  }

  function addDecl(scopeId: number, name: string) {
    scopes[scopeId].declarations.add(name);
  }

  // Track which scope the target offset belongs to
  let targetScopeId: number | null = null;

  function visitExpr(expr: Expression, scopeId: number): void {
    if (expr.kind === "Identifier" && expr.name === targetName) {
      addRef(scopeId, expr.name, expr.span);
      if (expr.span.offset === offset) {
        targetScopeId = scopeId;
      }
    }

    switch (expr.kind) {
      case "BinaryExpr":
        visitExpr(expr.left, scopeId);
        visitExpr(expr.right, scopeId);
        break;
      case "UnaryExpr":
        visitExpr(expr.operand, scopeId);
        break;
      case "CallExpr":
        visitExpr(expr.callee, scopeId);
        for (const arg of expr.args) visitExpr(arg, scopeId);
        break;
      case "MemberExpr":
        visitExpr(expr.object, scopeId);
        break;
      case "IndexExpr":
        visitExpr(expr.object, scopeId);
        visitExpr(expr.index, scopeId);
        break;
      case "AssignExpr":
        visitExpr(expr.target, scopeId);
        visitExpr(expr.value, scopeId);
        break;
      case "CompoundAssignExpr":
        visitExpr(expr.target, scopeId);
        visitExpr(expr.value, scopeId);
        break;
      case "ArrowFunction": {
        const arrowScope = makeScope(scopeId);
        for (const p of expr.params) {
          addDecl(arrowScope, p.name);
        }
        if (expr.body.kind === "BlockStatement") {
          visitStmt(expr.body, arrowScope);
        } else {
          visitExpr(expr.body, arrowScope);
        }
        break;
      }
      case "NewExpr":
        visitExpr(expr.callee, scopeId);
        for (const arg of expr.args) visitExpr(arg, scopeId);
        break;
      case "ArrayLiteral":
        for (const el of expr.elements) visitExpr(el, scopeId);
        break;
      case "OkExpr":
        visitExpr(expr.value, scopeId);
        break;
      case "ErrExpr":
        visitExpr(expr.value, scopeId);
        break;
      case "MatchExpr":
        visitExpr(expr.subject, scopeId);
        for (const arm of expr.arms) {
          if (arm.body.kind === "BlockStatement") {
            visitStmt(arm.body, scopeId);
          } else {
            visitExpr(arm.body, scopeId);
          }
        }
        break;
      case "StringInterpolation":
        for (const part of expr.parts) {
          if (typeof part !== "string") visitExpr(part, scopeId);
        }
        break;
      case "UpdateExpr":
        visitExpr(expr.argument, scopeId);
        break;
      case "TernaryExpr":
        visitExpr(expr.condition, scopeId);
        visitExpr(expr.consequent, scopeId);
        visitExpr(expr.alternate, scopeId);
        break;
      case "SpreadExpr":
        visitExpr(expr.argument, scopeId);
        break;
      case "PipeExpr":
        visitExpr(expr.left, scopeId);
        visitExpr(expr.right, scopeId);
        break;
      case "RangeExpr":
        visitExpr(expr.start, scopeId);
        visitExpr(expr.end, scopeId);
        break;
      case "TupleLiteral":
        for (const el of expr.elements) visitExpr(el, scopeId);
        break;
      case "NullCoalesceExpr":
        visitExpr(expr.left, scopeId);
        visitExpr(expr.right, scopeId);
        break;
      case "ArrayComprehension":
        visitExpr(expr.iterable, scopeId);
        visitExpr(expr.body, scopeId);
        if (expr.condition) visitExpr(expr.condition, scopeId);
        break;
      case "TypeGuardExpr":
        visitExpr(expr.expression, scopeId);
        break;
      case "AwaitExpr":
        visitExpr(expr.argument, scopeId);
        break;
      case "ResultUnwrapExpr":
        visitExpr(expr.expression, scopeId);
        break;
      case "MapLiteral":
        for (const e of expr.entries) {
          visitExpr(e.key, scopeId);
          visitExpr(e.value, scopeId);
        }
        break;
      case "NamedArgExpr":
        visitExpr(expr.value, scopeId);
        break;
      case "AwaitAllExpr":
        for (const e of expr.expressions) visitExpr(e, scopeId);
        break;
      case "AwaitRaceExpr":
        for (const e of expr.expressions) visitExpr(e, scopeId);
        break;
      case "SpawnExpr":
        visitExpr(expr.expression, scopeId);
        break;
      case "ChanExpr":
        visitExpr(expr.capacity, scopeId);
        break;
    }
  }

  function visitStmt(stmt: Statement, scopeId: number): void {
    switch (stmt.kind) {
      case "VariableDeclaration":
        if (stmt.name === targetName) {
          addDecl(scopeId, stmt.name);
          addRef(scopeId, stmt.name, stmt.span);
          if (
            stmt.span.offset === offset ||
            (stmt.span.offset <= offset &&
              offset <= stmt.span.offset + stmt.name.length)
          ) {
            targetScopeId = scopeId;
          }
        }
        visitExpr(stmt.initializer, scopeId);
        break;
      case "FunctionDeclaration": {
        // Function name is declared in the current scope
        if (stmt.name === targetName) {
          addDecl(scopeId, stmt.name);
          addRef(scopeId, stmt.name, stmt.span);
          if (
            stmt.span.offset === offset ||
            (stmt.span.offset <= offset &&
              offset <= stmt.span.offset + stmt.name.length)
          ) {
            targetScopeId = scopeId;
          }
        }
        // Function body gets its own scope with params
        const fnScope = makeScope(scopeId);
        for (const p of stmt.params) {
          addDecl(fnScope, p.name);
        }
        visitStmt(stmt.body, fnScope);
        break;
      }
      case "ReturnStatement":
        if (stmt.value) visitExpr(stmt.value, scopeId);
        break;
      case "IfStatement":
        visitExpr(stmt.condition, scopeId);
        visitStmt(stmt.consequent, scopeId);
        if (stmt.alternate) visitStmt(stmt.alternate, scopeId);
        break;
      case "WhileStatement":
        visitExpr(stmt.condition, scopeId);
        visitStmt(stmt.body, scopeId);
        break;
      case "ForStatement":
        if (stmt.init) visitStmt(stmt.init, scopeId);
        if (stmt.condition) visitExpr(stmt.condition, scopeId);
        if (stmt.update) visitExpr(stmt.update, scopeId);
        visitStmt(stmt.body, scopeId);
        break;
      case "ForInStatement": {
        const forScope = makeScope(scopeId);
        addDecl(forScope, stmt.variable);
        visitExpr(stmt.iterable, scopeId);
        visitStmt(stmt.body, forScope);
        break;
      }
      case "BlockStatement": {
        const blockScope = makeScope(scopeId);
        for (const s of stmt.body) visitStmt(s, blockScope);
        break;
      }
      case "ExpressionStatement":
        visitExpr(stmt.expression, scopeId);
        break;
      case "StructDeclaration":
        if (stmt.name === targetName) {
          addDecl(scopeId, stmt.name);
          addRef(scopeId, stmt.name, stmt.span);
        }
        for (const m of stmt.methods) {
          const mScope = makeScope(scopeId);
          for (const p of m.params) addDecl(mScope, p.name);
          visitStmt(m.body, mScope);
        }
        break;
      case "ClassDeclaration":
        if (stmt.name === targetName) {
          addDecl(scopeId, stmt.name);
          addRef(scopeId, stmt.name, stmt.span);
        }
        for (const m of stmt.methods) {
          const mScope = makeScope(scopeId);
          for (const p of m.params) addDecl(mScope, p.name);
          visitStmt(m.body, mScope);
        }
        break;
      case "ThrowStatement":
        visitExpr(stmt.argument, scopeId);
        break;
      case "DoWhileStatement":
        visitExpr(stmt.condition, scopeId);
        visitStmt(stmt.body, scopeId);
        break;
      case "TryCatchStatement": {
        visitStmt(stmt.tryBlock, scopeId);
        if (stmt.catchBlock) {
          const catchScope = makeScope(scopeId);
          if (stmt.catchBinding) addDecl(catchScope, stmt.catchBinding);
          visitStmt(stmt.catchBlock, catchScope);
        }
        if (stmt.finallyBlock) visitStmt(stmt.finallyBlock, scopeId);
        break;
      }
      case "MatchStatement":
        visitExpr(stmt.subject, scopeId);
        for (const arm of stmt.arms) {
          if (arm.body.kind === "BlockStatement") {
            visitStmt(arm.body, scopeId);
          } else {
            visitExpr(arm.body, scopeId);
          }
        }
        break;
      case "DestructureDeclaration":
        for (const name of stmt.names) {
          if (name === targetName) {
            addDecl(scopeId, name);
          }
        }
        visitExpr(stmt.initializer, scopeId);
        break;
      case "DeferStatement":
        visitStmt(stmt.body, scopeId);
        break;
      case "ExtensionDeclaration":
        for (const m of stmt.methods) {
          const mScope = makeScope(scopeId);
          for (const p of m.params) addDecl(mScope, p.name);
          visitStmt(m.body, mScope);
        }
        break;
    }
  }

  // Create global scope and walk
  const globalScope = makeScope(null);
  for (const stmt of ast.body) {
    visitStmt(stmt, globalScope);
  }

  // Find the declaring scope for the target
  if (targetScopeId === null) {
    // Target wasn't found directly, fall back to simple matching
    const key = refKey(
      findDeclaringScope(globalScope, targetName) ?? globalScope,
      targetName,
    );
    const refs = refMap.get(key) || [];
    const seen = new Set<number>();
    return refs
      .filter((r) => {
        if (seen.has(r.offset)) return false;
        seen.add(r.offset);
        return true;
      })
      .map((r) => ({ uri, ...r }));
  }

  const declScope = findDeclaringScope(targetScopeId, targetName);
  const key = refKey(declScope ?? targetScopeId, targetName);
  const refs = refMap.get(key) || [];

  // Deduplicate by offset
  const seen = new Set<number>();
  return refs
    .filter((r) => {
      if (seen.has(r.offset)) return false;
      seen.add(r.offset);
      return true;
    })
    .map((r) => ({ uri, ...r }));
}
