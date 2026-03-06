import { describe, it, expect } from "vitest";
import { parseToml, serializeToml, NkManifest } from "../src/package.js";

describe("Package manifest", () => {
  it("parses a basic nk.toml", () => {
    const content = `[package]
name = "myproject"
version = "0.1.0"

[dependencies]
utils = "github:user/nk-utils"
`;
    const manifest = parseToml(content);
    expect(manifest.package.name).toBe("myproject");
    expect(manifest.package.version).toBe("0.1.0");
    expect(manifest.dependencies["utils"]).toBe("github:user/nk-utils");
  });

  it("parses empty toml", () => {
    const manifest = parseToml("");
    expect(manifest.package.name).toBe("");
    expect(manifest.package.version).toBe("0.1.0");
    expect(Object.keys(manifest.dependencies)).toEqual([]);
  });

  it("ignores comments", () => {
    const content = `# This is a comment
[package]
name = "test"
# Another comment
version = "1.0.0"
`;
    const manifest = parseToml(content);
    expect(manifest.package.name).toBe("test");
    expect(manifest.package.version).toBe("1.0.0");
  });

  it("serializes manifest back to toml", () => {
    const manifest: NkManifest = {
      package: { name: "myproject", version: "0.1.0" },
      dependencies: { utils: "github:user/nk-utils" },
    };
    const toml = serializeToml(manifest);
    expect(toml).toContain("[package]");
    expect(toml).toContain('name = "myproject"');
    expect(toml).toContain('version = "0.1.0"');
    expect(toml).toContain("[dependencies]");
    expect(toml).toContain('utils = "github:user/nk-utils"');
  });

  it("roundtrips parse/serialize", () => {
    const original: NkManifest = {
      package: { name: "roundtrip", version: "2.0.0" },
      dependencies: { foo: "github:a/b", bar: "github:c/d" },
    };
    const serialized = serializeToml(original);
    const parsed = parseToml(serialized);
    expect(parsed.package.name).toBe(original.package.name);
    expect(parsed.package.version).toBe(original.package.version);
    expect(parsed.dependencies).toEqual(original.dependencies);
  });

  it("serializes manifest without dependencies", () => {
    const manifest: NkManifest = {
      package: { name: "nodeps", version: "0.1.0" },
      dependencies: {},
    };
    const toml = serializeToml(manifest);
    expect(toml).toContain("[package]");
    expect(toml).not.toContain("[dependencies]");
  });
});
