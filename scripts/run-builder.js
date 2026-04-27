const { spawnSync } = require('child_process');
const fs = require('fs');
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
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const windowsArtifactBaseName = `yaya_msg-${versionLabel}`;
const windowsArtifactFileName = `${windowsArtifactBaseName}.zip`;
const userArgs = process.argv.slice(2);
const artifactArg = `-c.artifactName=yaya_msg-${versionLabel}.${'${ext}'}`;
const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
const DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';

function shouldWrapWindowsZip(args) {
    if (process.platform !== 'win32') {
        return false;
    }

    const joined = args.join(' ').toLowerCase();
    return joined.includes('--win zip') || joined.includes('--windows zip');
}

function buildWindowsWrappedZip() {
    const unpackedDir = path.join(distDir, 'win-unpacked');
    const stagingDir = path.join(distDir, windowsArtifactBaseName);
    const zipPath = path.join(distDir, windowsArtifactFileName);

    if (!fs.existsSync(unpackedDir)) {
        throw new Error(`Windows unpacked directory not found: ${unpackedDir}`);
    }

    fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
    fs.cpSync(unpackedDir, stagingDir, { recursive: true });

    const psScript = [
        `Compress-Archive -Path '${stagingDir}' -DestinationPath '${zipPath}' -Force`
    ].join('; ');

    const zipResult = spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psScript],
        { cwd: projectRoot, stdio: 'inherit' }
    );

    fs.rmSync(stagingDir, { recursive: true, force: true });

    if (zipResult.status !== 0) {
        throw new Error(`Failed to create Windows zip artifact: ${zipPath}`);
    }
}

const wrapWindowsZip = shouldWrapWindowsZip(userArgs);
const builderArgs = wrapWindowsZip
    ? userArgs.map((arg) => (String(arg).toLowerCase() === 'zip' ? 'dir' : arg))
    : userArgs;
const builderEnv = {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || DEFAULT_ELECTRON_MIRROR,
    ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || DEFAULT_ELECTRON_BUILDER_BINARIES_MIRROR
};

const result = spawnSync(
    process.execPath,
    [cliPath, artifactArg, ...builderArgs],
    {
        cwd: projectRoot,
        stdio: 'inherit',
        env: builderEnv
    }
);

if (typeof result.status === 'number') {
    if (result.status === 0 && wrapWindowsZip) {
        buildWindowsWrappedZip();
    }
    process.exit(result.status);
}

process.exit(1);
