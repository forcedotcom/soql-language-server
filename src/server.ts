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
  TextDocumentChangeEvent,
  InitializeResult,
  Diagnostic,
  TextDocumentPositionParams,
  CompletionItem,
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

documents.onDidChangeContent(async (change) => {
  const diagnostics = Validator.validateSoqlText(change.document);
  // clear syntax errors immediatly (don't wait on http call)
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });

  if (diagnostics.length === 0 && runQueryValidation) {
    await runValidateLimit0Query(change);
  }
});

async function runValidateLimit0Query(change: TextDocumentChangeEvent<TextDocument>): Promise<void> {
  connection.console.log(`validate SOQL query:\n${change.document.getText()}`);
  let diagnostics: Diagnostic[] = [];
  diagnostics = await Validator.validateLimit0Query(change.document, connection);
  connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
}

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
