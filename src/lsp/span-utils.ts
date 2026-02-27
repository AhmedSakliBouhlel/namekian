export interface LspPosition {
  line: number; // 0-based
  character: number; // 0-based
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/**
 * Convert 0-based LSP position to byte offset in source text.
 */
export function positionToOffset(
  source: string,
  line: number,
  character: number,
): number {
  let offset = 0;
  let currentLine = 0;
  while (currentLine < line && offset < source.length) {
    if (source[offset] === "\n") {
      currentLine++;
    }
    offset++;
  }
  return offset + character;
}

/**
 * Convert byte offset to 0-based LSP position.
 */
export function offsetToPosition(source: string, offset: number): LspPosition {
  let line = 0;
  let character = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      character = 0;
    } else {
      character++;
    }
  }
  return { line, character };
}

/**
 * Convert a Namekian SourceSpan (1-based line/col) to an LSP Range (0-based).
 * Uses nameLength to determine the end position, defaulting to 1 character.
 */
export function nkSpanToLspRange(
  source: string,
  span: { line: number; column: number; offset: number },
  nameLength = 1,
): LspRange {
  const startLine = span.line - 1; // 1-based → 0-based
  const startChar = span.column - 1;
  const endOffset = span.offset + nameLength;
  const end = offsetToPosition(source, endOffset);
  return {
    start: { line: startLine, character: startChar },
    end,
  };
}
