import { Diagnostic } from "./diagnostic.js";

const COLORS = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

export function formatDiagnostic(diag: Diagnostic, source?: string): string {
  const sevColor = diag.severity === "error" ? COLORS.red : COLORS.yellow;
  const sevLabel = diag.severity.toUpperCase();
  const loc = `${diag.location.file}:${diag.location.line}:${diag.location.column}`;

  let output = `${sevColor}${COLORS.bold}${sevLabel}${COLORS.reset} ${loc}\n`;
  output += `  ${diag.message}\n`;

  if (source) {
    const lines = source.split("\n");
    const lineIdx = diag.location.line - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const lineNum = String(diag.location.line).padStart(4);
      output += `${COLORS.gray}${lineNum} |${COLORS.reset} ${lines[lineIdx]}\n`;
      // Calculate underline length
      let underlineLen = 1;
      if (diag.endLocation && diag.endLocation.line === diag.location.line) {
        underlineLen = Math.max(
          1,
          diag.endLocation.column - diag.location.column,
        );
      }
      const padding = " ".repeat(diag.location.column - 1 + 7);
      output += `${sevColor}${padding}${"^".repeat(underlineLen)}${COLORS.reset}\n`;
    }
  }

  if (diag.hint) {
    output += `  ${COLORS.cyan}hint:${COLORS.reset} ${diag.hint}\n`;
  }

  return output;
}

export function reportDiagnostics(
  diagnostics: Diagnostic[],
  source?: string,
  sourceMap?: Map<string, string>,
): void {
  for (const diag of diagnostics) {
    // Look up source from sourceMap if available, fall back to provided source
    const src = sourceMap?.get(diag.location.file) ?? source;
    process.stderr.write(formatDiagnostic(diag, src) + "\n");
  }

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;

  if (errors > 0 || warnings > 0) {
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
    if (warnings > 0)
      parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
    process.stderr.write(`${parts.join(", ")}\n`);
  }
}
