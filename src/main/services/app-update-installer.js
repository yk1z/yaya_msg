const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const runFile = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const psQuote = value => `'${String(value).replace(/'/g, "''")}'`;
const shQuote = value => `'${String(value).replace(/'/g, "'\\''")}'`;

function windowsScript({ installer, executable, directory, parentPid, ready, result, log, digest }) {
    return `$ErrorActionPreference = 'Stop'
$installer = ${psQuote(installer)}
$executable = ${psQuote(executable)}
$installDirectory = ${psQuote(directory)}
$resultPath = ${psQuote(result)}
$parentExited = $false
Set-Content -LiteralPath ${psQuote(ready)} -Value 'ready' -Encoding ASCII
try {
    $parent = Get-Process -Id ${parentPid} -ErrorAction SilentlyContinue
    if ($parent) { $parent | Wait-Process -Timeout 300 -ErrorAction Stop }
    $parentExited = $true
    $stream = [System.IO.File]::OpenRead($installer)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $actualHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actualHash -ne ${psQuote(digest)}) { throw 'Installer checksum changed' }
    $task = Start-Process -FilePath $installer -ArgumentList @('/S', '--updated', '--force-run', ('/D=' + $installDirectory)) -WindowStyle Hidden -PassThru -ErrorAction Stop
    $task.WaitForExit()
    if ($task.ExitCode -ne 0) { throw ('Installer exit code: ' + $task.ExitCode) }
    Set-Content -LiteralPath $resultPath -Value '{"success":true}' -Encoding ASCII
} catch {
    Add-Content -LiteralPath ${psQuote(log)} -Value $_.ToString()
    Set-Content -LiteralPath $resultPath -Value '{"success":false}' -Encoding ASCII
    if ($parentExited -and (Test-Path -LiteralPath $executable -PathType Leaf)) { Start-Process -FilePath $executable }
    exit 1
}
`;
}

function linuxScript({ installer, executable, parentPid, ready, result, log, digest, authorization }) {
    return `#!/bin/sh
set -u
installer=${shQuote(installer)}
executable=${shQuote(executable)}
result=${shQuote(result)}
log=${shQuote(log)}
printf 'ready\\n' > ${shQuote(ready)}
count=0
while kill -0 ${parentPid} 2>/dev/null; do
    count=$((count + 1))
    if [ "$count" -gt 1500 ]; then
        printf '{"success":false}\\n' > "$result"
        printf 'Timed out waiting for application shutdown\\n' >> "$log"
        exit 1
    fi
    sleep 0.2
done
restart_app() { "$executable" >/dev/null 2>&1 & }
if [ "$(/usr/bin/sha256sum "$installer" | /usr/bin/cut -d ' ' -f 1)" != ${shQuote(digest)} ]; then
    printf '{"success":false}\\n' > "$result"
    printf 'Installer checksum changed\\n' >> "$log"
    restart_app
    exit 1
fi
if ${authorization ? '/usr/bin/pkexec ' : ''}/usr/bin/apt-get install --yes --no-remove --reinstall "$installer" >> "$log" 2>&1; then
    printf '{"success":true}\\n' > "$result"
    restart_app
else
    printf '{"success":false}\\n' > "$result"
    restart_app
    exit 1
fi
`;
}

async function launchHelper({ script, ready, platform }) {
    const command = platform === 'win32'
        ? path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : '/bin/sh';
    const args = platform === 'win32'
        ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script] : [script];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    let failure = null;
    let exited = false;
    child.on('error', error => { failure = error; });
    child.on('exit', () => { exited = true; });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (failure) throw failure;
        if (exited) throw new Error('安装助手未能启动');
        if (fs.existsSync(ready)) { child.unref(); return; }
        await delay(50);
    }
    child.kill();
    throw new Error('安装助手启动超时');
}

function createUpdateInstaller({ app, shell, platform = process.platform, execute = runFile,
    startHelper = launchHelper, canExecute = file => fs.promises.access(file, fs.constants.X_OK),
    scheduleQuit = callback => setTimeout(callback, 200), getUid = () => process.getuid?.() ?? 1000 }) {
    let pending = null;
    let scheduled = false;
    const resultPath = () => path.join(app.getPath('userData'), 'updates', 'install-result.json');
    async function hadLastFailure() {
        try { return JSON.parse((await fs.promises.readFile(resultPath(), 'utf8')).replace(/^\uFEFF/, '')).success === false; }
        catch (_) { return false; }
    }
    async function prepare(info) {
        if (!info?.filePath) return { success: false, msg: '请先下载新版安装包' };
        try {
            const extension = { win32: '.exe', darwin: '.dmg', linux: '.deb' }[platform];
            if (!extension || path.extname(info.filePath) !== extension) throw new Error('安装包与当前系统不匹配，请重新下载');
            const stat = await fs.promises.stat(info.filePath);
            if (!stat.isFile() || stat.size !== info.size) throw new Error('安装包已发生变化，请重新下载');
            const hash = crypto.createHash('sha256');
            for await (const chunk of fs.createReadStream(info.filePath)) hash.update(chunk);
            if (hash.digest('hex') !== info.digest) throw new Error('安装包校验失败，请重新下载');
            if (platform === 'darwin' || !app.isPackaged) {
                const error = await shell.openPath(info.filePath);
                if (error) throw new Error('无法打开安装包，请重新下载后重试');
                return { success: true, mode: 'manual', msg: platform === 'darwin'
                    ? '已打开 DMG，请退出软件后拖入“应用程序”替换，再启动新版'
                    : '已打开安装包，请按提示完成安装；自动安装重启需在安装版中使用' };
            }
            const executable = app.getPath('exe');
            let authorization = false;
            if (platform === 'linux') {
                authorization = getUid() !== 0;
                await Promise.all(['/usr/bin/apt-get', '/usr/bin/dpkg-deb', '/usr/bin/dpkg-query', '/usr/bin/dpkg', '/usr/bin/sha256sum',
                    ...(authorization ? ['/usr/bin/pkexec'] : [])].map(canExecute)).catch(() => { throw new Error('系统缺少自动安装组件，请通过系统安装器手动安装 DEB 包'); });
                const run = (command, args) => execute(command, args, { timeout: 10000, windowsHide: true, maxBuffer: 1024 * 1024 });
                const [pkg, version, architecture, nativeArchitecture, owner] = await Promise.all([
                    run('/usr/bin/dpkg-deb', ['--field', info.filePath, 'Package']),
                    run('/usr/bin/dpkg-deb', ['--field', info.filePath, 'Version']),
                    run('/usr/bin/dpkg-deb', ['--field', info.filePath, 'Architecture']),
                    run('/usr/bin/dpkg', ['--print-architecture']),
                    run('/usr/bin/dpkg-query', ['--search', executable])
                ]).catch(() => { throw new Error('无法核对当前 DEB 安装信息，请通过系统安装器手动安装新版'); });
                const pkgName = pkg.stdout.trim();
                const ownsExecutable = owner.stdout.trim().split('\n').some(line => {
                    const separator = line.indexOf(': ');
                    return separator > 0 && line.slice(0, separator).split(':')[0] === pkgName && line.slice(separator + 2).trim() === executable;
                });
                if (!/^[a-z0-9][a-z0-9+.-]+$/.test(pkgName) || !ownsExecutable) throw new Error('当前运行的软件不属于这个 DEB 包，请手动安装新版');
                if (version.stdout.trim().replace(/(\.\d+)\.0$/, '$1') !== info.version.replace(/(\.\d+)\.0$/, '$1')) throw new Error('DEB 包版本与发布版本不一致，请重新下载');
                if (!['all', nativeArchitecture.stdout.trim()].includes(architecture.stdout.trim())) throw new Error('安装包与当前系统架构不匹配');
            }
            const statusDirectory = path.dirname(resultPath());
            await fs.promises.mkdir(statusDirectory, { recursive: true });
            await fs.promises.writeFile(resultPath(), '{"success":null}', { mode: 0o600 });
            const helperDirectory = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'yaya-install-'));
            const script = path.join(helperDirectory, platform === 'win32' ? 'install.ps1' : 'install.sh');
            const ready = path.join(helperDirectory, 'ready');
            const config = { installer: info.filePath, executable, directory: path.win32.dirname(executable), parentPid: process.pid,
                ready, result: resultPath(), log: path.join(statusDirectory, 'install.log'), digest: info.digest, authorization };
            await fs.promises.writeFile(script, platform === 'win32' ? '\uFEFF' + windowsScript(config) : linuxScript(config), { mode: 0o700 });
            await startHelper({ script, ready, platform }).catch(() => { throw new Error('无法启动自动安装，请检查系统权限后重试'); });
            scheduled = true;
            scheduleQuit(() => app.quit());
            return { success: true, mode: 'automatic', authorization };
        } catch (error) {
            return { success: false, msg: error?.message || '准备安装更新失败，请重试' };
        }
    }
    function install(info) {
        if (pending) return pending;
        if (scheduled) return Promise.resolve({ success: true, mode: 'automatic', authorization: platform === 'linux' && getUid() !== 0 });
        pending = prepare(info).finally(() => { pending = null; });
        return pending;
    }
    return { install, hadLastFailure };
}

module.exports = { createUpdateInstaller, windowsScript, linuxScript };
