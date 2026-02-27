import { Program } from "../parser/ast.js";
import { findNodeAtOffset } from "./hover.js";
import { buildSymbolIndex } from "./symbol-index.js";
import { nkSpanToLspRange } from "./span-utils.js";

export interface LspLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * Find the definition location of the identifier at the given offset.
 */
export function getDefinition(
  ast: Program,
  source: string,
  offset: number,
  uri: string,
): LspLocation | null {
  const node = findNodeAtOffset(ast, offset);
  if (!node || node.kind !== "Identifier") return null;

  const symbols = buildSymbolIndex(ast);
  const entry = symbols.get(node.name);
  if (!entry) return null;

  const range = nkSpanToLspRange(source, entry.span, entry.name.length);
  return { uri, range };
}
