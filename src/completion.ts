/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { SoqlParser } from '@salesforce/soql-common/lib/soql-parser/generated/SoqlParser';
import { SoqlLexer } from '@salesforce/soql-common/lib/soql-parser/generated/SoqlLexer';
import { LowerCasingCharStream } from '@salesforce/soql-common/lib/soql-parser';
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';

import { CommonTokenStream, Parser, ParserRuleContext, Token, TokenStream } from 'antlr4ts';

import * as c3 from 'antlr4-c3';
import { parseHeaderComments } from '@salesforce/soql-common/lib/soqlComments';
import {
  soqlFunctionsByName,
  soqlFunctions,
  soqlOperators,
  soqlDateRangeLiterals,
  soqlParametricDateRangeLiterals,
} from './completion/soql-functions';
import { SoqlCompletionErrorStrategy } from './completion/SoqlCompletionErrorStrategy';
import { ParsedSoqlField, SoqlQueryAnalyzer } from './completion/soql-query-analysis';

const SOBJECTS_ITEM_LABEL_PLACEHOLDER = '__SOBJECTS_PLACEHOLDER';
const SOBJECT_FIELDS_LABEL_PLACEHOLDER = '__SOBJECT_FIELDS_PLACEHOLDER';
const RELATIONSHIPS_PLACEHOLDER = '__RELATIONSHIPS_PLACEHOLDER';
const RELATIONSHIP_FIELDS_PLACEHOLDER = '__RELATIONSHIP_FIELDS_PLACEHOLDER';
const LITERAL_VALUES_FOR_FIELD = '__LITERAL_VALUES_FOR_FIELD';
const UPDATE_TRACKING = 'UPDATE TRACKING';
const UPDATE_VIEWSTAT = 'UPDATE VIEWSTAT';
const DEFAULT_SOBJECT = 'Object';

const itemsForBuiltinFunctions = soqlFunctions.map((soqlFn) => newFunctionItem(soqlFn.name));

export function completionsFor(text: string, line: number, column: number): CompletionItem[] {
  const lexer = new SoqlLexer(new LowerCasingCharStream(parseHeaderComments(text).headerPaddedSoqlText));
  const tokenStream = new CommonTokenStream(lexer);
  const parser = new SoqlParser(tokenStream);
  parser.removeErrorListeners();
  parser.errorHandler = new SoqlCompletionErrorStrategy();

  const parsedQuery = parser.soqlQuery();
  const completionTokenIndex = findCursorTokenIndex(tokenStream, {
    line,
    column,
  });

  if (completionTokenIndex === undefined) {
    // eslint-disable-next-line no-console
    console.error("Couldn't find cursor position on toke stream! Lexer might be skipping some tokens!");
    return [];
  }

  const c3Candidates = collectC3CompletionCandidates(parser, parsedQuery, completionTokenIndex);

  const soqlQueryAnalyzer = new SoqlQueryAnalyzer(parsedQuery);

  const itemsFromTokens: CompletionItem[] = generateCandidatesFromTokens(
    c3Candidates.tokens,
    soqlQueryAnalyzer,
    lexer,
    tokenStream,
    completionTokenIndex
  );
  const itemsFromRules: CompletionItem[] = generateCandidatesFromRules(
    c3Candidates.rules,
    soqlQueryAnalyzer,
    tokenStream,
    completionTokenIndex
  );

  const completionItems = itemsFromTokens.concat(itemsFromRules);

  // If we got no proposals from C3, handle some special cases "manually"
  return handleSpecialCases(soqlQueryAnalyzer, tokenStream, completionTokenIndex, completionItems);
}

function collectC3CompletionCandidates(
  parser: Parser,
  parsedQuery: ParserRuleContext,
  completionTokenIndex: number
): c3.CandidatesCollection {
  const core = new c3.CodeCompletionCore(parser);
  core.translateRulesTopDown = false;
  core.ignoredTokens = new Set([
    SoqlLexer.BIND,
    SoqlLexer.LPAREN,
    SoqlLexer.DISTANCE, // Maybe handle it explicitly, as other built-in functions. Idem for COUNT
    SoqlLexer.COMMA,
    SoqlLexer.PLUS,
    SoqlLexer.MINUS,
    SoqlLexer.COLON,
    SoqlLexer.MINUS,
  ]);

  core.preferredRules = new Set([
    SoqlParser.RULE_soqlFromExprs,
    SoqlParser.RULE_soqlFromExpr,
    SoqlParser.RULE_soqlField,
    SoqlParser.RULE_soqlUpdateStatsClause,
    SoqlParser.RULE_soqlIdentifier,
    SoqlParser.RULE_soqlLiteralValue,
    SoqlParser.RULE_soqlLikeLiteral,
  ]);

  return core.collectCandidates(completionTokenIndex, parsedQuery);
}

export function lastX<T>(array: T[]): T | undefined {
  return array && array.length > 0 ? array[array.length - 1] : undefined;
}

const possibleIdentifierPrefix = /[\w]$/;
const lineSeparator = /\n|\r|\r\n/g;
export type CursorPosition = { line: number; column: number };

/**
 * @returns the token index for which we want to provide completion candidates,
 * which depends on the cursor possition.
 *
 * @example
 * ```soql
 * SELECT id| FROM x    : Cursor touching the previous identifier token:
 *                        we want to continue completing that prior token position
 * SELECT id |FROM x    : Cursor NOT touching the previous identifier token:
 *                        we want to complete what comes on this new position
 * SELECT id   | FROM x : Cursor within whitespace block: we want to complete what
 *                        comes after the whitespace (we must return a non-WS token index)
 * ```
 */
export function findCursorTokenIndex(tokenStream: TokenStream, cursor: CursorPosition): number | undefined {
  // NOTE: cursor position is 1-based, while token's charPositionInLine is 0-based
  const cursorCol = cursor.column - 1;
  for (let i = 0; i < tokenStream.size; i++) {
    const t = tokenStream.get(i);

    const tokenStartCol = t.charPositionInLine;
    const tokenEndCol = tokenStartCol + (t.text as string).length;
    const tokenStartLine = t.line;
    const tokenEndLine =
      t.type !== SoqlLexer.WS || !t.text ? tokenStartLine : tokenStartLine + (t.text.match(lineSeparator)?.length || 0);

    // NOTE: tokenEndCol makes sense only of tokenStartLine === tokenEndLine
    if (tokenEndLine > cursor.line || (tokenStartLine === cursor.line && tokenEndCol > cursorCol)) {
      if (
        i > 0 &&
        tokenStartLine === cursor.line &&
        tokenStartCol === cursorCol &&
        possibleIdentifierPrefix.test(tokenStream.get(i - 1).text as string)
      ) {
        return i - 1;
      } else if (tokenStream.get(i).type === SoqlLexer.WS) {
        return i + 1;
      } else return i;
    }
  }
  return undefined;
}

function tokenTypeToCandidateString(lexer: SoqlLexer, tokenType: number): string {
  return lexer.vocabulary.getLiteralName(tokenType)?.toUpperCase().replace(/^'|'$/g, '') as string;
}

const fieldDependentOperators: Set<number> = new Set<number>([
  SoqlLexer.LT,
  SoqlLexer.GT,
  SoqlLexer.INCLUDES,
  SoqlLexer.EXCLUDES,
  SoqlLexer.LIKE,
]);

function generateCandidatesFromTokens(
  tokens: Map<number, c3.TokenList>,
  soqlQueryAnalyzer: SoqlQueryAnalyzer,
  lexer: SoqlLexer,
  tokenStream: TokenStream,
  tokenIndex: number
): CompletionItem[] {
  const items: CompletionItem[] = [];
  for (const [tokenType, followingTokens] of tokens) {
    // Don't propose what's already at the cursor position
    if (tokenType === tokenStream.get(tokenIndex).type) {
      continue;
    }

    // Even though the grammar allows spaces between the < > and = signs
    // (for example, this is valid: `field <  =  'value'`), we don't want to
    // propose code completions like that
    if (tokenType === SoqlLexer.EQ && isCursorAfter(tokenStream, tokenIndex, [[SoqlLexer.LT, SoqlLexer.GT]])) {
      continue;
    }
    const baseKeyword = tokenTypeToCandidateString(lexer, tokenType);
    if (!baseKeyword) continue;

    const followingKeywords = followingTokens.map((t) => tokenTypeToCandidateString(lexer, t)).join(' ');

    let itemText = followingKeywords.length > 0 ? baseKeyword + ' ' + followingKeywords : baseKeyword;

    // No aggregate features on nested queries
    const queryInfos = soqlQueryAnalyzer.queryInfosAt(tokenIndex);
    if (queryInfos.length > 1 && (itemText === 'COUNT' || itemText === 'GROUP BY')) {
      continue;
    }
    let soqlItemContext: SoqlItemContext | undefined;

    if (fieldDependentOperators.has(tokenType)) {
      const soqlFieldExpr = soqlQueryAnalyzer.extractWhereField(tokenIndex);
      if (soqlFieldExpr) {
        soqlItemContext = {
          sobjectName: soqlFieldExpr.sobjectName,
          fieldName: soqlFieldExpr.fieldName,
        };

        const soqlOperator = soqlOperators[itemText];
        soqlItemContext.onlyTypes = soqlOperator.types;
      }
    }

    // Some "manual" improvements for some keywords:
    if (['IN', 'NOT IN', 'INCLUDES', 'EXCLUDES'].includes(itemText)) {
      itemText = itemText + ' (';
    } else if (itemText === 'COUNT') {
      // NOTE: The g4 grammar declares `COUNT()` explicitly, but not `COUNT(xyz)`.
      // Here we cover the first case:
      itemText = 'COUNT()';
    }

    const newItem = soqlItemContext
      ? withSoqlContext(newKeywordItem(itemText), soqlItemContext)
      : newKeywordItem(itemText);

    if (itemText === 'WHERE') {
      newItem.preselect = true;
    }

    items.push(newItem);

    // Clone extra related operators missing by C3 proposals
    if (['<', '>'].includes(itemText)) {
      items.push({ ...newItem, ...newKeywordItem(itemText + '=') });
    }
    if (itemText === '=') {
      items.push({ ...newItem, ...newKeywordItem('!=') });
      items.push({ ...newItem, ...newKeywordItem('<>') });
    }
  }
  return items;
}

// eslint-disable-next-line complexity
function generateCandidatesFromRules(
  c3Rules: Map<number, c3.CandidateRule>,
  soqlQueryAnalyzer: SoqlQueryAnalyzer,
  tokenStream: TokenStream,
  tokenIndex: number
): CompletionItem[] {
  const completionItems: CompletionItem[] = [];

  const queryInfos = soqlQueryAnalyzer.queryInfosAt(tokenIndex);
  const innermostQueryInfo = queryInfos.length > 0 ? queryInfos[0] : undefined;
  const fromSObject = innermostQueryInfo?.sobjectName || DEFAULT_SOBJECT;
  const soqlItemContext: SoqlItemContext = {
    sobjectName: fromSObject,
  };
  const isInnerQuery = queryInfos.length > 1;
  const relationshipName = isInnerQuery ? queryInfos[0].sobjectName : undefined;
  const parentQuerySObject = isInnerQuery ? queryInfos[1].sobjectName : undefined;

  for (const [ruleId, ruleData] of c3Rules) {
    const lastRuleId = ruleData.ruleList[ruleData.ruleList.length - 1];

    switch (ruleId) {
      case SoqlParser.RULE_soqlUpdateStatsClause:
        // NOTE: We handle this one as a Rule instead of Tokens because
        // "TRACKING" and "VIEWSTAT" are not part of the grammar
        if (tokenIndex === ruleData.startTokenIndex) {
          completionItems.push(newKeywordItem(UPDATE_TRACKING));
          completionItems.push(newKeywordItem(UPDATE_VIEWSTAT));
        }
        break;
      case SoqlParser.RULE_soqlFromExprs:
        if (tokenIndex === ruleData.startTokenIndex) {
          completionItems.push(...itemsForFromExpression(soqlQueryAnalyzer, tokenIndex));
        }
        break;

      case SoqlParser.RULE_soqlField:
        if (lastRuleId === SoqlParser.RULE_soqlSemiJoin) {
          completionItems.push(
            withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), {
              ...soqlItemContext,
              onlyTypes: ['id', 'reference'],
              dontShowRelationshipField: true,
            })
          );
        } else if (lastRuleId === SoqlParser.RULE_soqlSelectExpr) {
          const isCursorAtFunctionExpr: boolean = isCursorAfter(tokenStream, tokenIndex, [
            [SoqlLexer.IDENTIFIER, SoqlLexer.COUNT],
            [SoqlLexer.LPAREN],
          ]); // inside a function expression (i.e.: "SELECT AVG(|" )

          // SELECT | FROM Xyz
          if (tokenIndex === ruleData.startTokenIndex) {
            if (isInnerQuery) {
              completionItems.push(
                withSoqlContext(newFieldItem(RELATIONSHIP_FIELDS_PLACEHOLDER), {
                  ...soqlItemContext,
                  sobjectName: parentQuerySObject || '',
                  relationshipName,
                })
              );
            } else {
              completionItems.push(withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), soqlItemContext));
              completionItems.push(...itemsForBuiltinFunctions);
              completionItems.push(newSnippetItem('(SELECT ... FROM ...)', '(SELECT $2 FROM $1)'));
            }
          }
          // "SELECT AVG(|"
          else if (isCursorAtFunctionExpr) {
            // NOTE: This code would be simpler if the grammar had an explicit
            // rule for function invocation.
            // It's also more complicated because COUNT is a keyword type in the grammar,
            // and not an IDENTIFIER like all other functions
            const functionNameToken = searchTokenBeforeCursor(tokenStream, tokenIndex, [
              SoqlLexer.IDENTIFIER,
              SoqlLexer.COUNT,
            ]);
            if (functionNameToken) {
              const soqlFn = soqlFunctionsByName[functionNameToken?.text || ''];
              if (soqlFn) {
                soqlItemContext.onlyAggregatable = soqlFn.isAggregate;
                soqlItemContext.onlyTypes = soqlFn.types;
              }
            }
            completionItems.push(withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), soqlItemContext));
          }
        }
        // ... GROUP BY |
        else if (lastRuleId === SoqlParser.RULE_soqlGroupByExprs && tokenIndex === ruleData.startTokenIndex) {
          const selectedFields = innermostQueryInfo?.selectedFields || [];
          const groupedByFields = (innermostQueryInfo?.groupByFields || []).map((f) => f.toLowerCase());
          const groupFieldDifference = selectedFields.filter((f) => !groupedByFields.includes(f.toLowerCase()));

          completionItems.push(
            withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), {
              sobjectName: fromSObject,
              onlyGroupable: true,
              mostLikelyItems: groupFieldDifference.length > 0 ? groupFieldDifference : undefined,
            })
          );
        }

        // ... ORDER BY |
        else if (lastRuleId === SoqlParser.RULE_soqlOrderByClauseField) {
          completionItems.push(
            isInnerQuery
              ? withSoqlContext(newFieldItem(RELATIONSHIP_FIELDS_PLACEHOLDER), {
                  ...soqlItemContext,
                  sobjectName: parentQuerySObject || '',
                  relationshipName,
                  onlySortable: true,
                })
              : withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), {
                  ...soqlItemContext,
                  onlySortable: true,
                })
          );
        }

        break;

      // For some reason, c3 doesn't propose rule `soqlField` when inside soqlWhereExpr,
      // but it does propose soqlIdentifier, so we hinge off it for where expressions
      case SoqlParser.RULE_soqlIdentifier:
        if (
          tokenIndex === ruleData.startTokenIndex &&
          [SoqlParser.RULE_soqlWhereExpr, SoqlParser.RULE_soqlDistanceExpr].includes(lastRuleId) &&
          !ruleData.ruleList.includes(SoqlParser.RULE_soqlHavingClause)
        ) {
          completionItems.push(
            withSoqlContext(newFieldItem(SOBJECT_FIELDS_LABEL_PLACEHOLDER), {
              sobjectName: fromSObject,
            })
          );
        }
        break;
      case SoqlParser.RULE_soqlLiteralValue:
      case SoqlParser.RULE_soqlLikeLiteral:
        if (!ruleData.ruleList.includes(SoqlParser.RULE_soqlHavingClause)) {
          const soqlFieldExpr = soqlQueryAnalyzer.extractWhereField(tokenIndex);
          if (soqlFieldExpr) {
            for (const literalItem of createItemsForLiterals(soqlFieldExpr)) completionItems.push(literalItem);
          }
        }
        break;
    }
  }
  return completionItems;
}
function handleSpecialCases(
  soqlQueryAnalyzer: SoqlQueryAnalyzer,
  tokenStream: TokenStream,
  tokenIndex: number,
  completionItems: CompletionItem[]
): CompletionItem[] {
  if (completionItems.length === 0) {
    // SELECT FROM |
    if (isCursorAfter(tokenStream, tokenIndex, [[SoqlLexer.SELECT], [SoqlLexer.FROM]])) {
      completionItems.push(...itemsForFromExpression(soqlQueryAnalyzer, tokenIndex));
    }
  }

  // Provide smart snippet for `SELECT`:
  if (completionItems.some((item) => item.label === 'SELECT')) {
    if (!isCursorBefore(tokenStream, tokenIndex, [[SoqlLexer.FROM]])) {
      completionItems.push(newSnippetItem('SELECT ... FROM ...', 'SELECT $2 FROM $1'));
    }
  }
  return completionItems;
}

function itemsForFromExpression(soqlQueryAnalyzer: SoqlQueryAnalyzer, tokenIndex: number): CompletionItem[] {
  const completionItems: CompletionItem[] = [];
  const queryInfoStack = soqlQueryAnalyzer.queryInfosAt(tokenIndex);
  if (queryInfoStack.length === 1 || (queryInfoStack.length > 1 && queryInfoStack[0].isSemiJoin)) {
    completionItems.push(newObjectItem(SOBJECTS_ITEM_LABEL_PLACEHOLDER));
  } else if (queryInfoStack.length > 1) {
    const parentQuery = queryInfoStack[1];
    const sobjectName = parentQuery.sobjectName;
    if (sobjectName) {
      // NOTE: might need to pass multiple outter SObject (nested) names ?
      completionItems.push(
        withSoqlContext(newObjectItem(RELATIONSHIPS_PLACEHOLDER), {
          sobjectName,
        })
      );
    }
  }
  return completionItems;
}

function isCursorAfter(tokenStream: TokenStream, tokenIndex: number, matchingTokens: number[][]): boolean {
  const toMatch = matchingTokens.concat().reverse();
  let matchingIndex = 0;

  for (let i = tokenIndex - 1; i >= 0; i--) {
    const t = tokenStream.get(i);
    if (t.channel === SoqlLexer.HIDDEN) continue;
    if (toMatch[matchingIndex].includes(t.type)) {
      matchingIndex++;
      if (matchingIndex === toMatch.length) return true;
    } else break;
  }
  return false;
}
function isCursorBefore(tokenStream: TokenStream, tokenIndex: number, matchingTokens: number[][]): boolean {
  const toMatch = matchingTokens.concat();
  let matchingIndex = 0;

  for (let i = tokenIndex; i < tokenStream.size; i++) {
    const t = tokenStream.get(i);
    if (t.channel === SoqlLexer.HIDDEN) continue;
    if (toMatch[matchingIndex].includes(t.type)) {
      matchingIndex++;
      if (matchingIndex === toMatch.length) return true;
    } else break;
  }
  return false;
}

function searchTokenBeforeCursor(
  tokenStream: TokenStream,
  tokenIndex: number,
  searchForAnyTokenTypes: number[]
): Token | undefined {
  for (let i = tokenIndex - 1; i >= 0; i--) {
    const t = tokenStream.get(i);
    if (t.channel === SoqlLexer.HIDDEN) continue;
    if (searchForAnyTokenTypes.includes(t.type)) {
      return t;
    }
  }
  return undefined;
}

function newKeywordItem(text: string): CompletionItem {
  return {
    label: text,
    kind: CompletionItemKind.Keyword,
  };
}
function newFunctionItem(text: string): CompletionItem {
  return {
    label: text + '(...)',
    kind: CompletionItemKind.Function,
    insertText: text + '($1)',
    insertTextFormat: InsertTextFormat.Snippet,
  };
}

export interface SoqlItemContext {
  sobjectName: string;
  relationshipName?: string;
  fieldName?: string;
  onlyTypes?: string[];
  onlyAggregatable?: boolean;
  onlyGroupable?: boolean;
  onlySortable?: boolean;
  onlyNillable?: boolean;
  mostLikelyItems?: string[];
  dontShowRelationshipField?: boolean;
}

function withSoqlContext(item: CompletionItem, soqlItemCtx: SoqlItemContext): CompletionItem {
  item.data = { soqlContext: soqlItemCtx };
  return item;
}

const newCompletionItem = (
  text: string,
  kind: CompletionItemKind,
  extraOptions?: Partial<CompletionItem>
): CompletionItem => ({
  label: text,
  kind,
  ...extraOptions,
});

const newFieldItem = (text: string, extraOptions?: Partial<CompletionItem>): CompletionItem =>
  newCompletionItem(text, CompletionItemKind.Field, extraOptions);

const newConstantItem = (text: string): CompletionItem => newCompletionItem(text, CompletionItemKind.Constant);

const newObjectItem = (text: string): CompletionItem => newCompletionItem(text, CompletionItemKind.Class);

const newSnippetItem = (label: string, snippet: string, extraOptions?: Partial<CompletionItem>): CompletionItem =>
  newCompletionItem(label, CompletionItemKind.Snippet, {
    insertText: snippet,
    insertTextFormat: InsertTextFormat.Snippet,
    ...extraOptions,
  });

function createItemsForLiterals(soqlFieldExpr: ParsedSoqlField): CompletionItem[] {
  const soqlContext = {
    sobjectName: soqlFieldExpr.sobjectName,
    fieldName: soqlFieldExpr.fieldName,
  };

  const items: CompletionItem[] = [
    withSoqlContext(newCompletionItem('TRUE', CompletionItemKind.Value), {
      ...soqlContext,
      ...{ onlyTypes: ['boolean'] },
    }),
    withSoqlContext(newCompletionItem('FALSE', CompletionItemKind.Value), {
      ...soqlContext,
      ...{ onlyTypes: ['boolean'] },
    }),
    withSoqlContext(newSnippetItem('nnn', '${1:123}'), {
      ...soqlContext,
      ...{ onlyTypes: ['int'] },
    }),
    withSoqlContext(newSnippetItem('nnn.nnn', '${1:123.456}'), {
      ...soqlContext,
      ...{ onlyTypes: ['double'] },
    }),
    withSoqlContext(newSnippetItem('ISOCODEnnn.nn', '${1|USD,EUR,JPY,CNY,CHF|}${2:999.99}'), {
      ...soqlContext,
      ...{ onlyTypes: ['currency'] },
    }),
    withSoqlContext(newSnippetItem('abc123', "'${1:abc123}'"), {
      ...soqlContext,
      ...{ onlyTypes: ['string'] },
    }),
    withSoqlContext(
      newSnippetItem(
        'YYYY-MM-DD',
        '${1:${CURRENT_YEAR}}-${2:${CURRENT_MONTH}}-${3:${CURRENT_DATE}}$0',
        // extra space prefix on sortText to make it appear first:
        { preselect: true, sortText: ' YYYY-MM-DD' }
      ),
      { ...soqlContext, ...{ onlyTypes: ['date'] } }
    ),
    withSoqlContext(
      newSnippetItem(
        'YYYY-MM-DDThh:mm:ssZ',
        '${1:${CURRENT_YEAR}}-${2:${CURRENT_MONTH}}-${3:${CURRENT_DATE}}T${4:${CURRENT_HOUR}}:${5:${CURRENT_MINUTE}}:${6:${CURRENT_SECOND}}Z$0',
        // extra space prefix on sortText to make it appear first:
        { preselect: true, sortText: ' YYYY-MM-DDThh:mm:ssZ' }
      ),
      { ...soqlContext, ...{ onlyTypes: ['datetime'] } }
    ),
    ...soqlDateRangeLiterals.map((k) =>
      withSoqlContext(newCompletionItem(k, CompletionItemKind.Value), {
        ...soqlContext,
        ...{ onlyTypes: ['date', 'datetime'] },
      })
    ),
    ...soqlParametricDateRangeLiterals.map((k) =>
      withSoqlContext(newSnippetItem(k, k.replace(':n', ':${1:nn}') + '$0'), {
        ...soqlContext,
        ...{ onlyTypes: ['date', 'datetime'] },
      })
    ),

    // Give the LSP client a chance to add additional literals:
    withSoqlContext(newConstantItem(LITERAL_VALUES_FOR_FIELD), soqlContext),
  ];

  const notNillableOperator = Boolean(
    soqlFieldExpr.operator !== undefined && soqlOperators[soqlFieldExpr.operator]?.notNullable
  );
  if (!notNillableOperator) {
    items.push(
      withSoqlContext(newKeywordItem('NULL'), {
        ...soqlContext,
        ...{ onlyNillable: true },
      })
    );
  }
  return items;
}
