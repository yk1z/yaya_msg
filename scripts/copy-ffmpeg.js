const fs = require('fs');
const path = require('path');

function copyLinuxIcon(projectDir, appOutDir) {
    const sourcePath = path.join(projectDir, 'icon.png');
    const targetPath = path.join(appOutDir, 'icon.png');
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Linux icon not found: ${sourcePath}`);
    }
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o644);
    console.log(`[afterPack] Copied Linux icon: ${targetPath}`);
}

exports.default = async function copyFfmpeg(context) {
    const platform = context.electronPlatformName || process.platform;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const projectDir = context.appDir || context.packager?.projectDir || process.cwd();
    const sourcePath = path.join(projectDir, 'node_modules', 'ffmpeg-static', ffmpegName);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`FFmpeg binary not found for platform ${platform}: ${sourcePath}`);
    }

    let resourcesDir;

    if (platform === 'darwin') {
        const productFilename = context.packager?.appInfo?.productFilename;
        if (!productFilename) {
            throw new Error('Unable to determine the macOS app bundle name');
        }

        resourcesDir = path.join(
            context.appOutDir,
            `${productFilename}.app`,
            'Contents',
            'Resources'
        );
    } else {
        resourcesDir = path.join(context.appOutDir, 'resources');
    }

    if (!fs.existsSync(resourcesDir)) {
        throw new Error(`Application resources directory not found: ${resourcesDir}`);
    }

    const targetPath = path.join(resourcesDir, ffmpegName);
    fs.copyFileSync(sourcePath, targetPath);

    if (platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
    }

    if (!fs.existsSync(targetPath)) {
        throw new Error(`Failed to copy FFmpeg to application resources: ${targetPath}`);
    }

    console.log(`[afterPack] Copied ffmpeg into application resources: ${targetPath}`);

    if (platform === 'linux') {
        copyLinuxIcon(projectDir, context.appOutDir);
    }
};
