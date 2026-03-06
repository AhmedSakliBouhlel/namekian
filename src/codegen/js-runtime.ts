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

export const NK_ASSERT_RUNTIME = `
function __nk_assert(cond, msg) {
  if (!cond) throw new Error("Assertion failed" + (msg ? ": " + msg : ""));
}
`.trim();

export const NK_UNWRAP_RUNTIME = `
class __NkResultError { constructor(result) { this.result = result; } }
function __nk_unwrap(result) {
  if (result.__tag === "Err") throw new __NkResultError(result);
  return result.value;
}
`.trim();

export const NK_CHANNEL_RUNTIME = `
class __NkChannel {
  constructor(capacity) {
    this.capacity = capacity;
    this.buffer = [];
    this.waitingSenders = [];
    this.waitingReceivers = [];
  }
  async send(value) {
    if (this.waitingReceivers.length > 0) {
      const resolve = this.waitingReceivers.shift();
      resolve(value);
      return;
    }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return;
    }
    return new Promise(resolve => this.waitingSenders.push(() => { this.buffer.push(value); resolve(); }));
  }
  async recv() {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift();
      if (this.waitingSenders.length > 0) { const next = this.waitingSenders.shift(); next(); }
      return value;
    }
    return new Promise(resolve => this.waitingReceivers.push(resolve));
  }
}
function __nk_chan(capacity) { return new __NkChannel(capacity); }
`.trim();

export const NK_REGEX_RUNTIME = `
const __nk_regex = {
  test(pattern, str) { return new RegExp(pattern).test(str); },
  match(pattern, str) { const m = str.match(new RegExp(pattern)); return m ? Array.from(m) : []; },
  replace(pattern, str, replacement) { return str.replace(new RegExp(pattern, "g"), replacement); },
  split(pattern, str) { return str.split(new RegExp(pattern)); },
  findAll(pattern, str) { return Array.from(str.matchAll(new RegExp(pattern, "g")), m => m[0]); }
};
`.trim();

export const NK_TIME_RUNTIME = `
const __nk_time = {
  now() { return Date.now(); },
  format(ms) { return new Date(ms).toISOString(); },
  parse(str) { return new Date(str).getTime(); },
  date(y, m, d) { return new Date(y, m - 1, d).getTime(); }
};
`.trim();

export const NK_CRYPTO_RUNTIME = `
const __nk_crypto = await (async () => {
  const crypto = await import("node:crypto");
  return {
    hash(algo, data) { return crypto.createHash(algo).update(data).digest("hex"); },
    randomBytes(n) { return crypto.randomBytes(n).toString("hex"); },
    uuid() { return crypto.randomUUID(); }
  };
})();
`.trim();

export const NK_PATH_RUNTIME = `
const __nk_path = await (async () => {
  const path = await import("node:path");
  return {
    join(...parts) { return path.join(...parts); },
    resolve(...parts) { return path.resolve(...parts); },
    dirname(p) { return path.dirname(p); },
    basename(p) { return path.basename(p); },
    ext(p) { return path.extname(p); },
    isAbsolute(p) { return path.isAbsolute(p); }
  };
})();
`.trim();

export const NK_ENV_RUNTIME = `
const __nk_env = {
  get(key) { return process.env[key] ?? null; },
  set(key, val) { process.env[key] = val; },
  has(key) { return key in process.env; },
  all() { return Object.assign({}, process.env); }
};
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
