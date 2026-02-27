import { Diagnostic as NkDiagnostic } from "../errors/diagnostic.js";

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number;
  source: string;
  message: string;
}

const SEVERITY_MAP: Record<string, number> = {
  error: 1, // DiagnosticSeverity.Error
  warning: 2, // DiagnosticSeverity.Warning
  info: 3, // DiagnosticSeverity.Information
};

/**
 * Convert Namekian diagnostics to LSP diagnostics.
 * Namekian uses 1-based lines/columns; LSP uses 0-based.
 */
export function convertDiagnostics(nkDiags: NkDiagnostic[]): LspDiagnostic[] {
  return nkDiags.map((d) => {
    const startLine = d.location.line - 1;
    const startChar = d.location.column - 1;

    let endLine: number;
    let endChar: number;
    if (d.endLocation) {
      endLine = d.endLocation.line - 1;
      endChar = d.endLocation.column - 1;
    } else {
      // Fallback: highlight a reasonable span based on message content
      endLine = startLine;
      endChar = startChar + extractNameLength(d.message);
    }

    return {
      range: {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar },
      },
      severity: SEVERITY_MAP[d.severity] ?? 1,
      source: "namekian",
      message: d.message,
    };
  });
}

/**
 * Try to extract a reasonable underline length from the diagnostic message.
 * Falls back to 1.
 */
function extractNameLength(message: string): number {
  // Match quoted identifiers like 'foo' or `bar`
  const match = message.match(/'([^']+)'/);
  if (match) return match[1].length;
  return 1;
}
