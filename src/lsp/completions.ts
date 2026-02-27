import { KEYWORDS } from "../lexer/keywords.js";
import { Program } from "../parser/ast.js";
import { TypeChecker } from "../checker/checker.js";
import { NkType, typeToString } from "../checker/types.js";
import { findNodeAtOffset } from "./hover.js";

export interface LspCompletionItem {
  label: string;
  kind: number;
  detail?: string;
}

// LSP CompletionItemKind values
const KIND_KEYWORD = 14;
const KIND_TYPE_PARAM = 25;
const KIND_VARIABLE = 6;
const KIND_FUNCTION = 3;
const KIND_FIELD = 5;
const KIND_METHOD = 2;
const KIND_ENUM_MEMBER = 20;

const BUILTIN_TYPES = ["int", "float", "string", "bool", "void", "var"];

/**
 * Get completion items at the given offset.
 */
export function getCompletions(
  _source: string,
  offset: number,
  ast: Program | undefined,
  checker: TypeChecker | undefined,
  isDot: boolean,
): LspCompletionItem[] {
  // Member access completions (after ".")
  if (isDot && ast && checker) {
    return getMemberCompletions(ast, checker, offset);
  }

  const items: LspCompletionItem[] = [];

  // Keywords
  for (const kw of KEYWORDS.keys()) {
    items.push({ label: kw, kind: KIND_KEYWORD });
  }

  // Built-in type names
  for (const t of BUILTIN_TYPES) {
    items.push({ label: t, kind: KIND_TYPE_PARAM });
  }

  // Scope symbols from checker
  if (checker) {
    for (const [name, entries] of checker.symbolMap) {
      // Only include symbols defined before cursor
      const visibleEntries = entries.filter(
        (e: { type: NkType; offset: number }) => e.offset < offset,
      );
      if (visibleEntries.length === 0) continue;

      const entry = visibleEntries[visibleEntries.length - 1];
      const kind =
        entry.type.tag === "function" ? KIND_FUNCTION : KIND_VARIABLE;
      items.push({
        label: name,
        kind,
        detail: typeToString(entry.type),
      });
    }
  }

  return items;
}

function getMemberCompletions(
  ast: Program,
  checker: TypeChecker,
  offset: number,
): LspCompletionItem[] {
  // Find the expression just before the dot
  const node = findNodeAtOffset(ast, offset - 1);
  if (!node) return [];

  const type = checker.typeMap.get(node.span.offset);
  if (!type) return [];

  return getMembersForType(type);
}

function getMembersForType(type: NkType): LspCompletionItem[] {
  const items: LspCompletionItem[] = [];

  if (type.tag === "array") {
    // Array built-in methods/properties
    items.push({ label: "length", kind: KIND_FIELD, detail: "int" });
    items.push({
      label: "push",
      kind: KIND_METHOD,
      detail: "(element) => int",
    });
    items.push({ label: "pop", kind: KIND_METHOD, detail: "() => element" });
    items.push({ label: "shift", kind: KIND_METHOD, detail: "() => element" });
    items.push({
      label: "unshift",
      kind: KIND_METHOD,
      detail: "(element) => int",
    });
    items.push({
      label: "map",
      kind: KIND_METHOD,
      detail: "(fn) => array",
    });
    items.push({
      label: "filter",
      kind: KIND_METHOD,
      detail: "(fn) => array",
    });
    items.push({
      label: "forEach",
      kind: KIND_METHOD,
      detail: "(fn) => void",
    });
    items.push({
      label: "includes",
      kind: KIND_METHOD,
      detail: "(element) => bool",
    });
    items.push({
      label: "indexOf",
      kind: KIND_METHOD,
      detail: "(element) => int",
    });
    items.push({
      label: "slice",
      kind: KIND_METHOD,
      detail: "(start, end?) => array",
    });
    items.push({
      label: "concat",
      kind: KIND_METHOD,
      detail: "(other) => array",
    });
    items.push({
      label: "join",
      kind: KIND_METHOD,
      detail: "(separator) => string",
    });
  } else if (type.tag === "string") {
    items.push({ label: "length", kind: KIND_FIELD, detail: "int" });
    items.push({
      label: "toUpperCase",
      kind: KIND_METHOD,
      detail: "() => string",
    });
    items.push({
      label: "toLowerCase",
      kind: KIND_METHOD,
      detail: "() => string",
    });
    items.push({ label: "trim", kind: KIND_METHOD, detail: "() => string" });
    items.push({
      label: "trimStart",
      kind: KIND_METHOD,
      detail: "() => string",
    });
    items.push({ label: "trimEnd", kind: KIND_METHOD, detail: "() => string" });
    items.push({
      label: "includes",
      kind: KIND_METHOD,
      detail: "(search) => bool",
    });
    items.push({
      label: "startsWith",
      kind: KIND_METHOD,
      detail: "(search) => bool",
    });
    items.push({
      label: "endsWith",
      kind: KIND_METHOD,
      detail: "(search) => bool",
    });
    items.push({
      label: "indexOf",
      kind: KIND_METHOD,
      detail: "(search) => int",
    });
    items.push({
      label: "split",
      kind: KIND_METHOD,
      detail: "(separator) => string[]",
    });
    items.push({
      label: "replace",
      kind: KIND_METHOD,
      detail: "(search, replacement) => string",
    });
    items.push({
      label: "slice",
      kind: KIND_METHOD,
      detail: "(start, end?) => string",
    });
    items.push({
      label: "charAt",
      kind: KIND_METHOD,
      detail: "(index) => string",
    });
  } else if (type.tag === "struct" || type.tag === "class") {
    for (const [name, fieldType] of type.fields) {
      items.push({
        label: name,
        kind: KIND_FIELD,
        detail: typeToString(fieldType),
      });
    }
    for (const [name, methodType] of type.methods) {
      items.push({
        label: name,
        kind: KIND_METHOD,
        detail: typeToString(methodType),
      });
    }
  } else if (type.tag === "enum") {
    for (const variant of type.variants) {
      items.push({ label: variant, kind: KIND_ENUM_MEMBER });
    }
  }

  return items;
}
