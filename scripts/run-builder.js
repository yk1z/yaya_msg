const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

function toDisplayVersion(version) {
    const parts = String(version).split('.');
    while (parts.length > 2 && parts[parts.length - 1] === '0') {
        parts.pop();
    }
    return parts.join('.');
}

const versionLabel = `v${toDisplayVersion(pkg.version)}`;
const cliPath = require.resolve('electron-builder/out/cli/cli.js');
const userArgs = process.argv.slice(2);
const artifactArg = `-c.artifactName=yaya_msg-${versionLabel}.${'${ext}'}`;

const result = spawnSync(
    process.execPath,
    [cliPath, artifactArg, ...userArgs],
    {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
        env: process.env
    }
);

if (typeof result.status === 'number') {
    process.exit(result.status);
}

process.exit(1);
