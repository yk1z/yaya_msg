const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.join(__dirname, '..');
function buildRendererEntry(outputRoot = projectRoot, { web = false } = {}) {
    const nobleDir = path.dirname(require.resolve('@noble/hashes/legacy'));
    const license = fs.readFileSync(path.join(nobleDir, 'LICENSE'), 'utf8').trim();
    esbuild.buildSync({
        entryPoints: [path.join(projectRoot, 'src/renderer/index.mjs')],
        outfile: path.join(outputRoot, 'src/renderer/vendor/renderer-entry.js'),
        bundle: true,
        alias: {
            'yaya-platform-features': path.join(projectRoot, 'src/renderer', web
                ? 'web-startup-features.mjs' : 'desktop-startup-features.mjs')
        },
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        minify: true,
        legalComments: 'none',
        banner: { js: '/*!\n' + license + '\n*/' }
    });
}

module.exports = { buildRendererEntry };
