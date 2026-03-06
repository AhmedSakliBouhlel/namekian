import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";

export function generateStub(packageName: string): string {
  const declDir = resolve("declarations");
  if (!existsSync(declDir)) {
    mkdirSync(declDir, { recursive: true });
  }

  // Try to read package.json for hints
  let exports: string[] = [];
  try {
    const pkgJsonPath = join("node_modules", packageName, "package.json");
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (pkgJson.main || pkgJson.module || pkgJson.exports) {
      exports.push("default");
    }
  } catch {
    // Package not installed yet or no package.json — that's fine
    exports.push("default");
  }

  const safeName = packageName.replace(/[^a-zA-Z0-9_]/g, "_");
  const stubLines: string[] = [`declare module "${packageName}" {`];

  for (const exp of exports) {
    if (exp === "default") {
      stubLines.push(`  any ${safeName};`);
    } else {
      stubLines.push(`  any ${exp};`);
    }
  }

  stubLines.push(`}`);
  stubLines.push("");

  const stubContent = stubLines.join("\n");
  const stubPath = join(declDir, `${safeName}.nkd`);
  writeFileSync(stubPath, stubContent, "utf-8");
  return stubPath;
}
