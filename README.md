# SOQL Language Server


This repo contains the source for the SOQL Language Server.

## Development

* `yarn` from the top-level directory to pull all dependencies
* `yarn build` to build
* `yarn run test` to run automated tests

This package is used from VS Code extension `salesforcedx-vscode-soql` which lives in repo [salesforcedx-vscode](https://github.com/forcedotcom/salesforcedx-vscode).

During development, you can work with a local copy of the `salesforcedx-vscode` repo, and configure it to use your local build from your `soql-language-server` repo. Example:

```
# Make global links available
cd ~/repos/soql-language-server
yarn link

# Link to them from the VS Code SOQL extension package
cd ~/repos/salesforcedx-vscode/packages/salesforcedx-vscode-soql
npm install
npm link @salesforce/soql-language-server
```

With that in place, you can make changes to `soql-language-server`, build, and then relaunch the `salesforcedx-vscode` extension from VSCode to see the changes.

### Debug Jest Test

You can debug Jest test for an individual package by running the corresponding launch configuraiton in VS Codes _RUN_ panel.

### Publishing

This package depends on `@salesforce/soql-parser` which is included as a static dependency, since it is not yet published. This package must be published with `@salesforce/soql-parser` as a bundled dependency, since the static tarball is not available in the published packages. There are prepack and postpack scripts as well as prepublish and postpublish scripts to convert the static dependency to a bundled dependency and back again, so when these packages are published they correctly refer to the soql-tooling dependency as a bundled dependency, but can find the static dependency again at development install-time.
