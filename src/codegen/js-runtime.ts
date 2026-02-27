export const NK_RUNTIME = `
function __nk_Ok(value) { return { __tag: "Ok", value }; }
function __nk_Err(value) { return { __tag: "Err", value }; }
`.trim();

export const NK_HTTP_RUNTIME = `
const __nk_http = {
  async get(url) {
    const res = await fetch(url);
    const body = await res.text();
    return { status: res.status, body };
  },
  async post(url, data) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.text();
    return { status: res.status, body };
  }
};
`.trim();

export const NK_JSON_RUNTIME = `
const __nk_json = {
  encode(value) { return JSON.stringify(value); },
  decode(str) { return JSON.parse(str); }
};
`.trim();

export const NK_RANGE_RUNTIME = `
function __nk_range(start, end, inclusive) {
  const arr = [];
  const stop = inclusive ? end + 1 : end;
  for (let i = start; i < stop; i++) arr.push(i);
  return arr;
}
`.trim();

export const NK_FS_RUNTIME = `
const __nk_fs = await (async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  return {
    async read(filePath) { return fs.readFile(path.resolve(filePath), "utf-8"); },
    async write(filePath, content) { await fs.writeFile(path.resolve(filePath), content, "utf-8"); },
    async append(filePath, content) { await fs.appendFile(path.resolve(filePath), content, "utf-8"); },
    async exists(filePath) { try { await fs.access(path.resolve(filePath)); return true; } catch { return false; } },
    async remove(filePath) { await fs.unlink(path.resolve(filePath)); },
    async readLines(filePath) { const c = await fs.readFile(path.resolve(filePath), "utf-8"); return c.split("\\n"); },
    async readDir(dirPath) { return fs.readdir(path.resolve(dirPath)); }
  };
})();
`.trim();

export const NK_STREAM_RUNTIME = `
const __nk_stream = await (async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  return {
    reader(filePath) {
      const content = fs.readFileSync(path.resolve(filePath), "utf-8");
      const lines = content.split("\\n");
      return {
        lines() { return lines; },
        close() {}
      };
    },
    writer(filePath) {
      const buf = [];
      return {
        writeLine(line) { buf.push(line); },
        close() { fs.writeFileSync(path.resolve(filePath), buf.join("\\n") + "\\n", "utf-8"); }
      };
    },
    pipe(src, dest) {
      const content = fs.readFileSync(path.resolve(src), "utf-8");
      fs.writeFileSync(path.resolve(dest), content, "utf-8");
    }
  };
})();
`.trim();
