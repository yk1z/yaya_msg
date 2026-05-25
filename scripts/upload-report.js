#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(PROJECT_ROOT, 'reports');
const BUCKET_NAME = 'yaya-downloads';
const PUBLIC_ORIGIN = 'https://gnz.hk';

function printHelp() {
    console.log(`
上传年报到 gnz.hk/report/

用法:
  node scripts/upload-report.js reports/year-report-2026-57802792.html
  node scripts/upload-report.js --latest
  node scripts/upload-report.js --file reports/year-report-2026-57802792.html --name xqx-2026.html

参数:
  --file <路径>      要上传的 HTML 文件
  --name <文件名>    线上文件名，默认使用本地文件名
  --latest           上传 reports 目录里最新的 year-report-*.html
`);
}

function parseArgs(argv) {
    const args = { file: '', name: '', latest: false, help: false };
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        const readValue = () => {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) throw new Error(`${arg} 需要一个值`);
            i += 1;
            return value;
        };

        if (arg === '--file') args.file = readValue();
        else if (arg === '--name') args.name = readValue();
        else if (arg === '--latest') args.latest = true;
        else if (arg === '--help' || arg === '-h') args.help = true;
        else if (!args.file) args.file = arg;
        else throw new Error(`未知参数: ${arg}`);
    }
    return args;
}

function findLatestReport() {
    if (!fs.existsSync(REPORTS_DIR)) return '';
    const reports = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
        .filter((item) => item.isFile() && /^year-report-.*\.html$/i.test(item.name))
        .map((item) => {
            const fullPath = path.join(REPORTS_DIR, item.name);
            return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return reports[0] ? reports[0].fullPath : '';
}

function normalizeReportName(value) {
    const name = String(value || '').trim() || 'report.html';
    const base = path.basename(name).replace(/[\\/:*?"<>|]/g, '-');
    return base.toLowerCase().endsWith('.html') ? base : `${base}.html`;
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    const inputFile = args.latest ? findLatestReport() : args.file;
    if (!inputFile) throw new Error('没有指定报告文件，也没有找到最新报告');

    const filePath = path.resolve(inputFile);
    if (!fs.existsSync(filePath)) throw new Error(`报告文件不存在: ${filePath}`);
    if (!/\.html$/i.test(filePath)) throw new Error('只支持上传 HTML 报告');

    const reportName = normalizeReportName(args.name || path.basename(filePath));
    const objectKey = `reports/${reportName}`;
    const target = `${BUCKET_NAME}/${objectKey}`;

    const command = [
        'wrangler',
        'r2',
        'object',
        'put',
        target,
        '--file',
        filePath,
        '--content-type',
        'text/html;charset=utf-8',
        '--remote'
    ];

    console.log(`上传: ${filePath}`);
    console.log(`R2: ${target}`);
    const result = spawnSync('npx', command, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
        process.exitCode = result.status || 1;
        return;
    }

    console.log(`完成: ${PUBLIC_ORIGIN}/report/${encodeURIComponent(reportName)}`);
}

try {
    main();
} catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
}
