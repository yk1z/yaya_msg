const fs = require('fs');
const path = require('path');

exports.default = async function copyFfmpeg(context) {
    const platform = context.electronPlatformName || process.platform;
    const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const sourcePath = path.join(context.appDir, 'node_modules', 'ffmpeg-static', ffmpegName);

    if (!fs.existsSync(sourcePath)) {
        throw new Error(`FFmpeg binary not found for platform ${platform}: ${sourcePath}`);
    }

    const resourcesDir = platform === 'darwin'
        ? path.join(context.appOutDir, 'Contents', 'Resources')
        : path.join(context.appOutDir, 'resources');

    fs.mkdirSync(resourcesDir, { recursive: true });

    const targetPath = path.join(resourcesDir, ffmpegName);
    fs.copyFileSync(sourcePath, targetPath);

    if (platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
    }

    console.log(`[afterPack] Copied ffmpeg to ${targetPath}`);
};
