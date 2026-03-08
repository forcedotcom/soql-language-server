/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  StaticFeature,
  ClientCapabilities,
  ServerCapabilities,
  DocumentSelector,
  FeatureState
} from 'vscode-languageclient';

export default class QueryValidationFeature implements StaticFeature {
  public static hasRunQueryValidation(capabilities: ClientCapabilities): boolean {
    const customCapabilities: ClientCapabilities & {
      soql?: { runQuery: boolean };
    } = capabilities;
    return customCapabilities?.soql?.runQuery || false;
  }

  public fillClientCapabilities(capabilities: ClientCapabilities): void {
    const customCapabilities: ClientCapabilities & {
      soql?: { runQuery: boolean };
    } = capabilities;
    customCapabilities.soql = {
      ...(customCapabilities.soql || {}),
      runQuery: true
    };
  }

  public initialize(_capabilities: ServerCapabilities, _documentSelector: DocumentSelector | undefined): void {
    /* do nothing */
  }

  public getState(): FeatureState {
    return { kind: 'static' };
  }

  public clear(): void {
    /* do nothing */
  }
}
