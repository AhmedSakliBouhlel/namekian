import { readFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

export interface CoverageReport {
  totalLines: number;
  coveredLines: number;
  percentage: number;
  uncoveredLines: number[];
  file: string;
}

/**
 * Parse V8 coverage JSON output and map back to source lines.
 * V8 coverage gives byte ranges in the JS output; we use a simple
 * line-count heuristic since nk lines map roughly 1:1 to JS lines
 * (minus the runtime preamble).
 */
export function parseCoverageData(
  coverageDir: string,
  sourceFile: string,
): CoverageReport | null {
  if (!existsSync(coverageDir)) return null;

  const files = readdirSync(coverageDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  // Read all coverage JSON files
  let bestResult: {
    functions: {
      ranges: { startOffset: number; endOffset: number; count: number }[];
    }[];
  } | null = null;

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(coverageDir, file), "utf-8"));
    if (data.result) {
      for (const entry of data.result) {
        // Match against the temp file that was executed
        if (entry.url && entry.functions) {
          bestResult = entry;
        }
      }
    }
  }

  if (!bestResult) return null;

  // Count source lines
  const source = existsSync(sourceFile)
    ? readFileSync(sourceFile, "utf-8")
    : "";
  const totalLines = source
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  // Analyze function coverage
  const coveredLineSet = new Set<number>();
  const allLineSet = new Set<number>();

  for (let i = 1; i <= totalLines; i++) {
    allLineSet.add(i);
  }

  for (const fn of bestResult.functions) {
    for (const range of fn.ranges) {
      if (range.count > 0) {
        // Rough heuristic: map byte offsets to line numbers
        // This is approximate but useful for a basic report
        const startLine = Math.max(1, Math.floor(range.startOffset / 40) + 1);
        const endLine = Math.min(
          totalLines,
          Math.floor(range.endOffset / 40) + 1,
        );
        for (let l = startLine; l <= endLine; l++) {
          coveredLineSet.add(l);
        }
      }
    }
  }

  const coveredLines = coveredLineSet.size;
  const uncoveredLines = [...allLineSet]
    .filter((l) => !coveredLineSet.has(l))
    .sort((a, b) => a - b);
  const percentage =
    totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 100;

  return {
    totalLines,
    coveredLines,
    percentage,
    uncoveredLines,
    file: sourceFile,
  };
}

/**
 * Run a compiled JS file with V8 coverage enabled and return the report.
 */
export async function runWithCoverage(
  jsCode: string,
  sourceFile: string,
): Promise<CoverageReport | null> {
  const { writeFileSync, unlinkSync } = await import("fs");
  const { execSync } = await import("child_process");

  const tmpFile = `/tmp/nk_cov_${Date.now()}.mjs`;
  const coverageDir = `/tmp/nk_cov_data_${Date.now()}`;

  mkdirSync(coverageDir, { recursive: true });
  writeFileSync(tmpFile, jsCode);

  try {
    execSync(`node ${tmpFile}`, {
      encoding: "utf-8",
      stdio: "pipe",
      env: { ...process.env, NODE_V8_COVERAGE: coverageDir },
    });
  } catch {
    // Test may fail but we still want coverage
  }

  const report = parseCoverageData(coverageDir, sourceFile);

  // Cleanup
  try {
    unlinkSync(tmpFile);
  } catch {}
  try {
    rmSync(coverageDir, { recursive: true });
  } catch {}

  return report;
}
