import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";

export interface NkManifest {
  package: { name: string; version: string };
  dependencies: Record<string, string>;
}

export function readManifest(dir: string): NkManifest | null {
  const filePath = resolve(dir, "nk.toml");
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  return parseToml(content);
}

export function writeManifest(dir: string, manifest: NkManifest): void {
  const filePath = resolve(dir, "nk.toml");
  writeFileSync(filePath, serializeToml(manifest));
}

export function parseToml(content: string): NkManifest {
  const manifest: NkManifest = {
    package: { name: "", version: "0.1.0" },
    dependencies: {},
  };
  let currentSection = "";

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    const kvMatch = line.match(/^(\w+)\s*=\s*"(.+)"$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (currentSection === "package") {
        if (key === "name") manifest.package.name = value;
        if (key === "version") manifest.package.version = value;
      } else if (currentSection === "dependencies") {
        manifest.dependencies[key] = value;
      }
    }
  }

  return manifest;
}

export function serializeToml(manifest: NkManifest): string {
  let out = "[package]\n";
  out += `name = "${manifest.package.name}"\n`;
  out += `version = "${manifest.package.version}"\n`;

  const deps = Object.entries(manifest.dependencies);
  if (deps.length > 0) {
    out += "\n[dependencies]\n";
    for (const [key, value] of deps) {
      out += `${key} = "${value}"\n`;
    }
  }

  return out;
}

export function installDep(
  dir: string,
  spec: string,
): { name: string; path: string } {
  // spec is "owner/repo" — we clone from github
  const parts = spec.split("/");
  if (parts.length !== 2) {
    throw new Error(`Invalid dependency spec: '${spec}'. Use 'owner/repo'.`);
  }
  const [owner, repo] = parts;
  const modulesDir = join(dir, "nk_modules");
  const targetDir = join(modulesDir, owner, repo);
  return { name: repo, path: targetDir };
}
