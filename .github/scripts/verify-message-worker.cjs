const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
    const appRoot = path.resolve(process.argv[2]);
    const { createMessageIndexClient } = require(path.join(appRoot, 'src/main/services/message-index-client.js'));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yaya-packaged-worker-'));
    const htmlDir = path.join(directory, 'html');
    fs.mkdirSync(path.join(htmlDir, 'Member'), { recursive: true });
    const file = path.join(htmlDir, 'Member', 'room-11.jsonl');
    fs.writeFileSync(file, Array.from({ length: 12 }, (_, index) => JSON.stringify({
        key: `smoke-${index}`, sortTime: 1700000000000 + index,
        messageType: index === 5 ? 'FLIPCARD' : 'TEXT',
        sender: { userId: '100', name: 'User' }, content: { text: `Message ${index}` }
    })).join('\n') + '\n');
    const client = createMessageIndexClient({ storagePaths: {
        htmlDir, messageIndexFile: path.join(directory, 'index.sqlite')
    } });
    try {
        await client.syncMessageIndex();
        assert.equal((await client.getMessageIndexSummary()).totalCount, 12);
        const page = await client.queryMessageIndexPage({ type: 'reply' });
        assert.equal(page.records[0].key, 'smoke-5');
        const context = await client.getMessageIndexContext({ indexId: page.records[0].indexId, radius: 2 });
        assert.equal(context.records.length, 5);
        await assert.rejects(client.queryMessageAnalysis({ kind: 'unsupported' }), /不支持/);
        assert.equal((await client.getMessageIndexSummary()).totalCount, 12);
    } finally { await client.closeMessageIndex(); }
    console.log('Verified packaged background worker: indexing, queries, context, error recovery and shutdown');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
