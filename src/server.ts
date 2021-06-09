/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  TextDocumentPositionParams,
  CompletionItem,
  DidChangeWatchedFilesParams,
  FileChangeType,
  DocumentUri,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Validator } from './validator';
import QueryValidationFeature from './query-validation-feature';
import { completionsFor } from './completion';

// Create a connection for the server, using Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);
connection.sendNotification('soql/validate', 'createConnection');

let runQueryValidation: boolean;

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  runQueryValidation = QueryValidationFeature.hasRunQueryValidation(params.capabilities);
  connection.console.log(`runQueryValidation: ${runQueryValidation}`);
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full, // sync full document for now
      completionProvider: {
        // resolveProvider: true,
        triggerCharacters: [' '],
      },
    },
  };
  return result;
});

function clearDiagnostics(uri: DocumentUri): void {
  connection.sendDiagnostics({ uri, diagnostics: [] });
}

documents.onDidClose((change) => {
  clearDiagnostics(change.document.uri);
});

/**
 * NOTE: Listening on deleted files should NOT be necessary to trigger the clearing of Diagnostics,
 * since the `documents.onDidClose()` callback should take care of it. However, for some reason,
 * on automated tests of the SOQL VS Code extension, the 'workbench.action.close*Editor' commands
 * don't trigger the `onDidClose()` callback on the language server side.
 *
 * So, to be safe (and to make tests green) we explicitly clear diagnostics also on deleted files:
 */
connection.onDidChangeWatchedFiles((watchedFiles: DidChangeWatchedFilesParams) => {
  const deletedUris = watchedFiles.changes
    .filter((change) => change.type === FileChangeType.Deleted)
    .map((change) => change.uri);
  deletedUris.forEach(clearDiagnostics);
});

documents.onDidChangeContent(async (change) => {
  const diagnostics = Validator.validateSoqlText(change.document);
  // clear syntax errors immediatly (don't wait on http call)
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });

  if (diagnostics.length === 0 && runQueryValidation) {
    const remoteDiagnostics = await Validator.validateLimit0Query(change.document, connection);
    if (remoteDiagnostics.length > 0) {
      connection.sendDiagnostics({ uri: change.document.uri, diagnostics: remoteDiagnostics });
    }
  }
});

connection.onCompletion(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (request: TextDocumentPositionParams): Promise<CompletionItem[]> => {
    const doc = documents.get(request.textDocument.uri);
    if (!doc) return [];

    return completionsFor(doc.getText(), request.position.line + 1, request.position.character + 1);
  }
);
documents.listen(connection);

connection.listen();
