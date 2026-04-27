const fs = require('fs');
const os = require('os');
const path = require('path');

const INTERNAL_FILES = ['data_cache.json', 'scan_manifest.json'];

function expandHomePath(value, homeDir) {
    if (!value || typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/^\$HOME(?=\/|\\|$)/, homeDir)
        .replace(/^~(?=\/|\\|$)/, homeDir);
}

function resolveLinuxDocumentsDir(homeDir) {
    const userDirsFile = path.join(homeDir, '.config', 'user-dirs.dirs');

    try {
        const text = fs.readFileSync(userDirsFile, 'utf8');
        const match = text.match(/^XDG_DOCUMENTS_DIR=(["']?)(.+?)\1$/m);
        if (match) {
            const resolved = expandHomePath(match[2], homeDir);
            if (resolved) {
                return resolved;
            }
        }
    } catch (error) {
    }

    return '';
}

function resolveDocumentsDir() {
    const homeDir = os.homedir();
    const platformDocumentDir = process.platform === 'linux'
        ? resolveLinuxDocumentsDir(homeDir)
        : '';
    const candidates = [
        platformDocumentDir,
        path.join(homeDir, 'Documents'),
        path.join(homeDir, 'documents')
    ].filter(Boolean);

    const existing = candidates.find((candidate) => fs.existsSync(candidate));
    return existing || candidates[0];
}

function resolveInternalDataDir() {
    const homeDir = os.homedir();

    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), '牙牙消息');
    }

    if (process.platform === 'darwin') {
        return path.join(homeDir, 'Library', 'Application Support', '牙牙消息');
    }

    return path.join(process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), '牙牙消息');
}

function moveFileIfNeeded(sourcePath, targetPath) {
    if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
        return;
    }

    try {
        fs.renameSync(sourcePath, targetPath);
    } catch (error) {
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);
    }
}

function migrateLegacyInternalFiles(legacyDir, internalDataDir) {
    for (const fileName of INTERNAL_FILES) {
        moveFileIfNeeded(
            path.join(legacyDir, fileName),
            path.join(internalDataDir, fileName)
        );
    }
}

function getStoragePaths() {
    const documentsDir = resolveDocumentsDir();
    const exportRootDir = path.join(documentsDir, '牙牙消息');
    const internalDataDir = resolveInternalDataDir();

    return {
        documentsDir,
        exportRootDir,
        internalDataDir,
        htmlDir: path.join(exportRootDir, 'html'),
        cacheFile: path.join(internalDataDir, 'data_cache.json'),
        manifestFile: path.join(internalDataDir, 'scan_manifest.json'),
        settingsFile: path.join(internalDataDir, 'settings.json'),
        runtimeCacheFile: path.join(internalDataDir, 'runtime-cache.json')
    };
}

function ensureStoragePaths() {
    const storagePaths = getStoragePaths();

    fs.mkdirSync(storagePaths.exportRootDir, { recursive: true });
    fs.mkdirSync(storagePaths.internalDataDir, { recursive: true });
    fs.mkdirSync(storagePaths.htmlDir, { recursive: true });
    migrateLegacyInternalFiles(storagePaths.exportRootDir, storagePaths.internalDataDir);

    return storagePaths;
}

module.exports = {
    getStoragePaths,
    ensureStoragePaths
};
