/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
export { default as QueryValidationFeature } from './query-validation-feature';
export { SoqlItemContext } from './completion';

export const enum RequestTypes {
  RunQuery = 'runQuery',
}

export interface RunQueryResponse {
  result?: string;
  error?: RunQueryError;
}

export interface RunQueryError {
  name: string;
  errorCode: string;
  message: string;
}
