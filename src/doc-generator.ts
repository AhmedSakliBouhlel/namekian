import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { Program, FunctionDeclaration } from "./parser/ast.js";
import { Formatter } from "./formatter/formatter.js";

export interface DocEntry {
  kind: "function" | "struct" | "class" | "enum";
  name: string;
  doc?: string;
  signature: string;
  methods?: { name: string; doc?: string; signature: string }[];
  variants?: string[];
  fields?: string[];
}

export function extractDocs(source: string, file: string): DocEntry[] {
  const lexer = new Lexer(source, file);
  const tokens = lexer.tokenize();
  if (lexer.diagnostics.some((d) => d.severity === "error")) return [];

  const parser = new Parser(tokens, file);
  const ast = parser.parse();
  if (parser.diagnostics.some((d) => d.severity === "error")) return [];

  return extractDocsFromAst(ast);
}

export function extractDocsFromAst(ast: Program): DocEntry[] {
  const entries: DocEntry[] = [];
  const fmt = new Formatter();

  for (const stmt of ast.body) {
    switch (stmt.kind) {
      case "FunctionDeclaration": {
        const sig = funcSignature(stmt);
        entries.push({
          kind: "function",
          name: stmt.name,
          doc: stmt.docComment,
          signature: sig,
        });
        break;
      }
      case "StructDeclaration": {
        const fields = stmt.fields.map(
          (f) => `${fmt.fmtType(f.type)} ${f.name}`,
        );
        const methods = stmt.methods.map((m) => ({
          name: m.name,
          doc: m.docComment,
          signature: funcSignature(m),
        }));
        entries.push({
          kind: "struct",
          name: stmt.name,
          doc: stmt.docComment,
          signature: `struct ${stmt.name}`,
          fields,
          methods,
        });
        break;
      }
      case "ClassDeclaration": {
        const fields = stmt.fields.map(
          (f) => `${fmt.fmtType(f.type)} ${f.name}`,
        );
        const methods = stmt.methods.map((m) => ({
          name: m.name,
          doc: m.docComment,
          signature: funcSignature(m),
        }));
        entries.push({
          kind: "class",
          name: stmt.name,
          doc: stmt.docComment,
          signature: `class ${stmt.name}${stmt.superClass ? ` extends ${stmt.superClass}` : ""}`,
          fields,
          methods,
        });
        break;
      }
      case "EnumDeclaration": {
        const variants = stmt.variants.map((v) => v.name);
        entries.push({
          kind: "enum",
          name: stmt.name,
          doc: stmt.docComment,
          signature: `enum ${stmt.name}`,
          variants,
        });
        break;
      }
    }
  }

  return entries;
}

function funcSignature(fn: FunctionDeclaration): string {
  const params = fn.params
    .map((p) => {
      if (p.type) {
        const fmt = new Formatter();
        return `${fmt.fmtType(p.type)} ${p.name}`;
      }
      return p.name;
    })
    .join(", ");
  const ret = fn.returnType ? new Formatter().fmtType(fn.returnType) : "void";
  return `${ret} ${fn.name}(${params})`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateHtml(entries: DocEntry[], title: string): string {
  let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
h2 { color: #2d5016; margin-top: 2rem; }
h3 { color: #555; }
.sig { font-family: monospace; background: #f5f5f5; padding: 0.5rem; border-radius: 4px; }
.doc { color: #444; margin: 0.5rem 0; }
.field { font-family: monospace; color: #666; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>\n`;

  for (const entry of entries) {
    html += `<h2>${entry.kind}: ${escapeHtml(entry.name)}</h2>\n`;
    html += `<div class="sig">${escapeHtml(entry.signature)}</div>\n`;
    if (entry.doc) {
      html += `<p class="doc">${escapeHtml(entry.doc)}</p>\n`;
    }
    if (entry.fields && entry.fields.length > 0) {
      html += `<h3>Fields</h3><ul>\n`;
      for (const f of entry.fields) {
        html += `<li class="field">${escapeHtml(f)}</li>\n`;
      }
      html += `</ul>\n`;
    }
    if (entry.variants && entry.variants.length > 0) {
      html += `<h3>Variants</h3><ul>\n`;
      for (const v of entry.variants) {
        html += `<li class="field">${escapeHtml(v)}</li>\n`;
      }
      html += `</ul>\n`;
    }
    if (entry.methods && entry.methods.length > 0) {
      html += `<h3>Methods</h3>\n`;
      for (const m of entry.methods) {
        html += `<div class="sig">${escapeHtml(m.signature)}</div>\n`;
        if (m.doc) {
          html += `<p class="doc">${escapeHtml(m.doc)}</p>\n`;
        }
      }
    }
  }

  html += `</body></html>`;
  return html;
}
