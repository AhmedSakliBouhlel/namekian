import * as path from "path";
import { ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  // Path to the compiled LSP server
  const serverModule = context.asAbsolutePath(
    path.join("..", "dist", "lsp", "server.js"),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "namekian" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/*.nk"),
    },
  };

  client = new LanguageClient(
    "namekian",
    "Namekian Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
