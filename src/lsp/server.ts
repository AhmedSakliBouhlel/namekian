import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionItem,
  CompletionTriggerKind,
  Hover,
  MarkupKind,
  Location,
  DiagnosticSeverity,
  TextEdit,
  Range,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { compile } from "../compiler.js";
import { convertDiagnostics } from "./diagnostics.js";
import { findNodeAtOffset } from "./hover.js";
import { getCompletions, LspCompletionItem } from "./completions.js";
import { getDefinition } from "./definition.js";
import { getReferences } from "./references.js";
import { getCodeActions } from "./code-actions.js";
import { positionToOffset } from "./span-utils.js";
import { typeToString } from "../checker/types.js";
import { Program } from "../parser/ast.js";
import { TypeChecker } from "../checker/checker.js";
import { Diagnostic as NkDiagnostic } from "../errors/diagnostic.js";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Per-document analysis cache
const docCache = new Map<
  string,
  {
    ast?: Program;
    checker?: TypeChecker;
    source: string;
    nkDiagnostics?: NkDiagnostic[];
  }
>();

connection.onInitialize((): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["."],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: true,
      codeActionProvider: true,
    },
  };
});

documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidClose((event) => {
  docCache.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

const SEVERITY_TO_LSP: Record<number, DiagnosticSeverity> = {
  1: DiagnosticSeverity.Error,
  2: DiagnosticSeverity.Warning,
  3: DiagnosticSeverity.Information,
};

function validateDocument(document: TextDocument): void {
  const source = document.getText();
  const uri = document.uri;

  const result = compile(source, uri, { retainChecker: true });

  // Cache AST and checker for hover/completions/definition
  docCache.set(uri, {
    ast: result.ast,
    checker: result.checker,
    source,
    nkDiagnostics: result.diagnostics,
  });

  const lspDiags = convertDiagnostics(result.diagnostics);
  connection.sendDiagnostics({
    uri,
    diagnostics: lspDiags.map((d) => ({
      range: d.range,
      severity: SEVERITY_TO_LSP[d.severity] ?? DiagnosticSeverity.Error,
      source: d.source,
      message: d.message,
    })),
  });
}

connection.onHover((params): Hover | null => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached?.ast || !cached.checker) return null;

  const offset = positionToOffset(
    cached.source,
    params.position.line,
    params.position.character,
  );

  const node = findNodeAtOffset(cached.ast, offset);
  if (!node) return null;

  const type = cached.checker.typeMap.get(node.span.offset);
  if (!type) return null;

  let label: string;
  if (node.kind === "Identifier") {
    label = `${node.name}: ${typeToString(type)}`;
  } else {
    label = typeToString(type);
  }

  // Find doc comment for the hovered symbol
  let docComment: string | undefined;
  if (node.kind === "Identifier" && cached.ast) {
    for (const stmt of cached.ast.body) {
      if (
        stmt.kind === "FunctionDeclaration" &&
        stmt.name === node.name &&
        stmt.docComment
      ) {
        docComment = stmt.docComment;
        break;
      }
      if (
        (stmt.kind === "StructDeclaration" ||
          stmt.kind === "ClassDeclaration" ||
          stmt.kind === "EnumDeclaration") &&
        stmt.name === node.name &&
        stmt.docComment
      ) {
        docComment = stmt.docComment;
        break;
      }
    }
  }

  const docSection = docComment ? `\n\n${docComment}` : "";

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: "```namekian\n" + label + "\n```" + docSection,
    },
  };
});

connection.onCompletion((params) => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached) return [];

  const offset = positionToOffset(
    cached.source,
    params.position.line,
    params.position.character,
  );

  const isDot =
    params.context?.triggerKind === CompletionTriggerKind.TriggerCharacter &&
    params.context.triggerCharacter === ".";

  const items = getCompletions(
    cached.source,
    offset,
    cached.ast,
    cached.checker,
    isDot,
  );

  return items.map((item: LspCompletionItem) => ({
    label: item.label,
    kind: item.kind as CompletionItem["kind"],
    detail: item.detail,
  }));
});

connection.onDefinition((params): Location | null => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached?.ast) return null;

  const offset = positionToOffset(
    cached.source,
    params.position.line,
    params.position.character,
  );

  return getDefinition(
    cached.ast,
    cached.source,
    offset,
    params.textDocument.uri,
    cached.checker?.typeMap,
  );
});

connection.onReferences((params): Location[] => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached?.ast) return [];

  const offset = positionToOffset(
    cached.source,
    params.position.line,
    params.position.character,
  );

  const refs = getReferences(
    cached.ast,
    cached.source,
    offset,
    params.textDocument.uri,
  );

  return refs.map((ref) => ({
    uri: ref.uri,
    range: {
      start: { line: ref.line - 1, character: ref.column - 1 },
      end: { line: ref.line - 1, character: ref.column - 1 },
    },
  }));
});

connection.onRenameRequest((params) => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached?.ast) return null;

  const offset = positionToOffset(
    cached.source,
    params.position.line,
    params.position.character,
  );

  const refs = getReferences(
    cached.ast,
    cached.source,
    offset,
    params.textDocument.uri,
  );

  if (refs.length === 0) return null;

  const changes: Record<string, TextEdit[]> = {};
  for (const ref of refs) {
    const uri = ref.uri;
    if (!changes[uri]) changes[uri] = [];
    // Find the old name length from the source
    const node = findNodeAtOffset(cached.ast!, ref.offset);
    const oldLen =
      node && node.kind === "Identifier"
        ? node.name.length
        : params.newName.length;
    changes[uri].push({
      range: {
        start: { line: ref.line - 1, character: ref.column - 1 },
        end: { line: ref.line - 1, character: ref.column - 1 + oldLen },
      },
      newText: params.newName,
    });
  }

  return { changes } as WorkspaceEdit;
});

connection.onCodeAction((params) => {
  const cached = docCache.get(params.textDocument.uri);
  if (!cached?.nkDiagnostics) return [];

  const startOffset = positionToOffset(
    cached.source,
    params.range.start.line,
    params.range.start.character,
  );
  const endOffset = positionToOffset(
    cached.source,
    params.range.end.line,
    params.range.end.character,
  );

  const actions = getCodeActions(
    cached.nkDiagnostics,
    cached.source,
    startOffset,
    endOffset,
  );

  return actions.map((action) => ({
    title: action.title,
    kind: action.kind,
  }));
});

documents.listen(connection);
connection.listen();
