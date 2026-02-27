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
