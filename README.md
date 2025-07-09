## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Security](#security)
- [Resources](#resources)

## Overview

The SOQL Language Server provides comprehensive language support for SOQL (Salesforce Object Query Language) queries in text editors. This package implements the server-side of the LSP protocol to provide features such as:

- Code completion and IntelliSense
- Syntax error checking and validation
- Query analysis and optimization suggestions
- Integration with Salesforce metadata

[Salesforce's SOQL VS Code extension](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode-soql), which lives in repo [salesforcedx-vscode](https://github.com/forcedotcom/salesforcedx-vscode), includes an LSP client implementation for this server.

## Installation

This package is primarily used as a dependency by the Salesforce SOQL VS Code extension. For end users, the language server is automatically installed when you install the VS Code extension.

For developers who want to work with the language server directly:

```bash
npm install @salesforce/soql-language-server
```

## Usage

The language server is designed to work with LSP-compatible editors. It's primarily used through the [Salesforce SOQL VS Code extension](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode-soql).

## Contributing

If you are interested in contributing, please take a look at the [CONTRIBUTING](CONTRIBUTING.md) guide.

## License

This project is licensed under the BSD 3-Clause License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Security

Please report any security issues to [security@salesforce.com](mailto:security@salesforce.com) as soon as they are discovered. See our [SECURITY.md](SECURITY.md) file for more details.

## Development

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
