const { buildDesktopShell } = require('../src/common/desktop-document');
const { buildRendererEntry } = require('./build-renderer-entry');

buildRendererEntry();
console.log(`Desktop document built at ${buildDesktopShell()}`);
