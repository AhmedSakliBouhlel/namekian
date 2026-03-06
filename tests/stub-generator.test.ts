import { describe, it, expect, afterEach } from "vitest";
import { generateStub } from "../src/stub-generator.js";
import { existsSync, readFileSync, rmSync } from "fs";
import { resolve } from "path";

describe("stub-generator", () => {
  const declDir = resolve("declarations");

  afterEach(() => {
    // Clean up generated stubs
    if (existsSync(declDir)) {
      rmSync(declDir, { recursive: true });
    }
  });

  it("generates a .nkd stub file", () => {
    const path = generateStub("test-pkg");
    expect(existsSync(path)).toBe(true);
    expect(path.endsWith(".nkd")).toBe(true);
  });

  it("stub content has declare module wrapper", () => {
    const path = generateStub("my-lib");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain('declare module "my-lib"');
    expect(content).toContain("}");
  });

  it("sanitizes package name for filename", () => {
    const path = generateStub("@scope/pkg");
    expect(path).toContain("_scope_pkg.nkd");
  });

  it("creates declarations directory if missing", () => {
    if (existsSync(declDir)) rmSync(declDir, { recursive: true });
    generateStub("fresh-pkg");
    expect(existsSync(declDir)).toBe(true);
  });
});
