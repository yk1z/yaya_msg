const { spawnSync } = require('child_process');
const path = require('path');
const pkg = require('../package.json');

function toDisplayVersion(version) {
    return String(version).replace(/^(\d+\.\d+)\.\d+$/, '$1');
}

const versionLabel = `v${toDisplayVersion(pkg.version)}`;
const cliPath = require.resolve('electron-builder/out/cli/cli.js');
const projectRoot = path.resolve(__dirname, '..');
const userArgs = process.argv.slice(2);
const artifactArg = '-c.artifactName=yaya_msg-' + versionLabel + '-${os}.${ext}';
const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/';

const builderEnv = {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || DEFAULT_ELECTRON_MIRROR,
    ELECTRON_BUILDER_BINARIES_MIRROR: DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR,
    NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR: DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR,
    npm_config_electron_builder_binaries_mirror: DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR
};

console.log(`[run-builder] ELECTRON_BUILDER_BINARIES_MIRROR=${builderEnv.ELECTRON_BUILDER_BINARIES_MIRROR}`);

const result = spawnSync(
    process.execPath,
    [cliPath, artifactArg, ...userArgs],
    {
        cwd: projectRoot,
        stdio: 'inherit',
        env: builderEnv
    }
);

if (typeof result.status === 'number') {
    process.exit(result.status);
}

process.exit(1);
