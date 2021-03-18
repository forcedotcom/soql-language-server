/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import {
  SoqlFromExprsContext,
  SoqlGroupByExprsContext,
  SoqlInnerQueryContext,
  SoqlParser,
  SoqlQueryContext,
  SoqlSelectColumnExprContext,
  SoqlSemiJoinContext,
} from '@salesforce/soql-common/lib/soql-parser/generated/SoqlParser';
import { ParserRuleContext, Token } from 'antlr4ts';
import { ParseTreeWalker, RuleNode } from 'antlr4ts/tree';
import { SoqlParserListener } from '@salesforce/soql-common/lib/soql-parser/generated/SoqlParserListener';

interface InnerSoqlQueryInfo {
  soqlInnerQueryNode: ParserRuleContext;
  select: Token;
  from?: Token;
  sobjectName?: string;
  selectedFields?: string[];
  groupByFields?: string[];
  isSemiJoin?: boolean;
}

export interface ParsedSoqlField {
  sobjectName: string;
  fieldName: string;
  operator?: string;
}
export class SoqlQueryAnalyzer {
  private innerQueriesListener = new SoqlInnerQueriesListener();
  public constructor(protected parsedQueryTree: SoqlQueryContext) {
    ParseTreeWalker.DEFAULT.walk<SoqlParserListener>(this.innerQueriesListener, parsedQueryTree);
  }

  public innermostQueryInfoAt(cursorTokenIndex: number): InnerSoqlQueryInfo | undefined {
    const queries = this.queryInfosAt(cursorTokenIndex);
    return queries.length > 0 ? queries[0] : undefined;
  }

  public queryInfosAt(cursorTokenIndex: number): InnerSoqlQueryInfo[] {
    return this.innerQueriesListener.findQueriesAt(cursorTokenIndex);
  }

  public extractWhereField(cursorTokenIndex: number): ParsedSoqlField | undefined {
    const sobject = this.innermostQueryInfoAt(cursorTokenIndex)?.sobjectName;

    if (sobject) {
      const whereFieldListener = new SoqlWhereFieldListener(cursorTokenIndex, sobject);
      ParseTreeWalker.DEFAULT.walk<SoqlParserListener>(whereFieldListener, this.parsedQueryTree);
      return whereFieldListener.result;
    } else {
      return undefined;
    }
  }
}

/* eslint-disable @typescript-eslint/member-ordering */
class SoqlInnerQueriesListener implements SoqlParserListener {
  private innerSoqlQueries = new Map<number, InnerSoqlQueryInfo>();

  /**
   * Return the list of nested queries which cover the given token position
   *
   * @param atIndex token index
   * @returns the array of queryinfos ordered from the innermost to the outermost
   */
  public findQueriesAt(atIndex: number): InnerSoqlQueryInfo[] {
    const innerQueries = Array.from(this.innerSoqlQueries.values()).filter((query) =>
      this.queryContainsTokenIndex(query, atIndex)
    );
    const sortedQueries = innerQueries.sort((queryA, queryB) => queryB.select.tokenIndex - queryA.select.tokenIndex);
    return sortedQueries;
  }

  private queryContainsTokenIndex(innerQuery: InnerSoqlQueryInfo, atTokenIndex: number): boolean {
    // NOTE: We use the parent node to take into account the enclosing
    // parentheses (in the case of inner SELECTs), and the whole text until EOF
    // (for the top-level SELECT). BTW: soqlInnerQueryNode always has a parent.
    const queryNode = innerQuery.soqlInnerQueryNode.parent
      ? innerQuery.soqlInnerQueryNode.parent
      : innerQuery.soqlInnerQueryNode;

    const startIndex = queryNode.start.tokenIndex;
    const stopIndex = queryNode.stop?.tokenIndex;

    return atTokenIndex > startIndex && !!stopIndex && atTokenIndex <= stopIndex;
  }

  private findAncestorSoqlInnerQueryContext(node: RuleNode | undefined): ParserRuleContext | undefined {
    let soqlInnerQueryNode = node;
    while (
      soqlInnerQueryNode &&
      ![SoqlParser.RULE_soqlInnerQuery, SoqlParser.RULE_soqlSemiJoin].includes(soqlInnerQueryNode.ruleContext.ruleIndex)
    ) {
      soqlInnerQueryNode = soqlInnerQueryNode.parent;
    }

    return soqlInnerQueryNode ? (soqlInnerQueryNode as ParserRuleContext) : undefined;
  }

  private innerQueryForContext(ctx: RuleNode): InnerSoqlQueryInfo | undefined {
    const soqlInnerQueryNode = this.findAncestorSoqlInnerQueryContext(ctx);
    if (soqlInnerQueryNode) {
      const selectFromPair = this.innerSoqlQueries.get(soqlInnerQueryNode.start.tokenIndex);
      return selectFromPair;
    }
    return undefined;
  }

  public enterSoqlInnerQuery(ctx: SoqlInnerQueryContext): void {
    this.innerSoqlQueries.set(ctx.start.tokenIndex, {
      select: ctx.start,
      soqlInnerQueryNode: ctx,
    });
  }

  public enterSoqlSemiJoin(ctx: SoqlSemiJoinContext): void {
    this.innerSoqlQueries.set(ctx.start.tokenIndex, {
      select: ctx.start,
      isSemiJoin: true,
      soqlInnerQueryNode: ctx,
    });
  }

  public exitSoqlFromExprs(ctx: SoqlFromExprsContext): void {
    const selectFromPair = this.innerQueryForContext(ctx);

    if (ctx.children && ctx.children.length > 0 && selectFromPair) {
      const fromToken = ctx.parent?.start as Token;
      const sobjectName = ctx.getChild(0).getChild(0).text;
      selectFromPair.from = fromToken;
      selectFromPair.sobjectName = sobjectName;
    }
  }

  public enterSoqlSelectColumnExpr(ctx: SoqlSelectColumnExprContext): void {
    if (ctx.soqlField().childCount === 1) {
      const soqlField = ctx.soqlField();
      const soqlIdentifiers = soqlField.soqlIdentifier();
      if (soqlIdentifiers.length === 1) {
        const selectFromPair = this.innerQueryForContext(ctx);
        if (selectFromPair) {
          if (!selectFromPair.selectedFields) {
            selectFromPair.selectedFields = [];
          }
          selectFromPair.selectedFields.push(soqlIdentifiers[0].text);
        }
      }
    }
  }

  public enterSoqlGroupByExprs(ctx: SoqlGroupByExprsContext): void {
    const groupByFields: string[] = [];

    ctx.soqlField().forEach((soqlField) => {
      const soqlIdentifiers = soqlField.soqlIdentifier();
      if (soqlIdentifiers.length === 1) {
        groupByFields.push(soqlIdentifiers[0].text);
      }
    });

    if (groupByFields.length > 0) {
      const selectFromPair = this.innerQueryForContext(ctx);

      if (selectFromPair) {
        selectFromPair.groupByFields = groupByFields;
      }
    }
  }
}

class SoqlWhereFieldListener implements SoqlParserListener {
  private resultDistance = Number.MAX_VALUE;
  public result?: ParsedSoqlField;

  public constructor(private readonly cursorTokenIndex: number, private sobject: string) {}

  public enterEveryRule(ctx: ParserRuleContext): void {
    if (ctx.ruleContext.ruleIndex === SoqlParser.RULE_soqlWhereExpr) {
      if (ctx.start.tokenIndex <= this.cursorTokenIndex) {
        const distance = this.cursorTokenIndex - ctx.start.tokenIndex;
        if (distance < this.resultDistance) {
          this.resultDistance = distance;
          const soqlField = ctx.getChild(0).text;

          // Handle basic "dot" expressions
          // TODO: Support Aliases
          const fieldComponents = soqlField.split('.', 2);
          if (fieldComponents[0] === this.sobject) {
            fieldComponents.shift();
          }

          const operator = ctx.childCount > 2 ? ctx.getChild(1).text : undefined;

          this.result = {
            sobjectName: this.sobject,
            fieldName: fieldComponents.join('.'),
            operator,
          };
        }
      }
    }
  }
}
