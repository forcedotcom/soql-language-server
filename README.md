# SOQL Language Server

Provides SOQL language capabilities for text editors, including code-completion and errors checks.
This package implements the server-side of the LSP protocol.
VS Code extension [salesforcedx-vscode-soql](https://github.com/forcedotcom/salesforcedx-vscode/tree/develop/packages/salesforcedx-vscode-soql) includes an LSP client implementation.

## Development

If you are interested in contributing, please take a look at the [CONTRIBUTING](CONTRIBUTING.md) guide.

- `yarn` from the top-level directory to pull all dependencies
- `yarn build` to build
- `yarn run lint` to run static checks with eslint
- `yarn run test` to run automated tests

This package is used by VS Code extension `salesforcedx-vscode-soql` which lives in repo [salesforcedx-vscode](https://github.com/forcedotcom/salesforcedx-vscode).

During development, you can work with a local copy of the `salesforcedx-vscode` repo, and configure it to use your local build from your `soql-language-server` repo using yarn/npm links. Example:

```
# Make global links available
cd soql-language-server
yarn link

# Link to them from the VS Code SOQL extension package
cd salesforcedx-vscode
npm install
cd ./packages/salesforcedx-vscode-soql
npm link @salesforce/soql-language-server
```

With that in place, you can make changes to `soql-language-server`, build, and then relaunch the `salesforcedx-vscode` extensions from VS Code to see the changes.

### Debug Jest Test

You can debug Jest test for an individual package by running the corresponding launch configuration in VS Codes _RUN_ panel.

## Resources

- Doc: [SOQL and SOSL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_sosl_intro.htm)
- Doc: [SOQL and SOSL Queries](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_SOQL.htm)
- Trailhead: [Get Started with SOQL Queries](https://trailhead.salesforce.com/content/learn/modules/soql-for-admins/get-started-with-soql-queries)
