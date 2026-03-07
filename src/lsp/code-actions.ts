import { Diagnostic as NkDiagnostic } from "../errors/diagnostic.js";

export interface CodeAction {
  title: string;
  kind: string;
  edits: { offset: number; length: number; newText: string }[];
}

/**
 * Generate code actions (quick fixes) from diagnostics.
 */
export function getCodeActions(
  diagnostics: NkDiagnostic[],
  source: string,
  rangeStart: number,
  rangeEnd: number,
): CodeAction[] {
  const actions: CodeAction[] = [];

  for (const diag of diagnostics) {
    const diagOffset = diag.location.offset;
    if (diagOffset < rangeStart || diagOffset > rangeEnd) continue;

    // Fix: did-you-mean suggestions
    const didYouMean = diag.message.match(/Did you mean '([^']+)'\?/);
    if (didYouMean) {
      const suggestion = didYouMean[1];
      const nameMatch = diag.message.match(
        /Undefined (?:variable|function|type) '([^']+)'/,
      );
      if (nameMatch) {
        const wrongName = nameMatch[1];
        const idx = source.indexOf(wrongName, Math.max(0, diagOffset - 5));
        if (idx >= 0) {
          actions.push({
            title: `Replace with '${suggestion}'`,
            kind: "quickfix",
            edits: [
              { offset: idx, length: wrongName.length, newText: suggestion },
            ],
          });
        }
      }
    }

    // Fix: unused variable — prefix with _
    if (diag.message.match(/Variable '([^']+)' is declared but never used/)) {
      const nameMatch = diag.message.match(/Variable '([^']+)'/);
      if (nameMatch) {
        const varName = nameMatch[1];
        if (!varName.startsWith("_")) {
          const idx = source.indexOf(varName, Math.max(0, diagOffset - 5));
          if (idx >= 0) {
            actions.push({
              title: `Prefix with '_' to suppress warning`,
              kind: "quickfix",
              edits: [
                { offset: idx, length: varName.length, newText: `_${varName}` },
              ],
            });
          }
        }
      }
    }

    // Fix: non-exhaustive match — add wildcard arm
    if (diag.message.includes("Non-exhaustive match")) {
      // Find the match block's closing brace from the diagnostic offset
      let bracePos = -1;
      let depth = 0;
      for (let i = diagOffset; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") {
          depth--;
          if (depth === 0) {
            bracePos = i;
            break;
          }
        }
      }
      if (bracePos >= 0) {
        actions.push({
          title: "Add wildcard arm '_ => { }'",
          kind: "quickfix",
          edits: [{ offset: bracePos, length: 0, newText: "  _ => { }\n" }],
        });
      }
    }
  }

  return actions;
}
