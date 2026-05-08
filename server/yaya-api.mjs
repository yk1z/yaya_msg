import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const port = Number(process.env.PORT || 3001);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || 'https://gnz.hk,https://www.gnz.hk,http://localhost:8787,http://127.0.0.1:8787')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

function loadWorkerRuntime() {
    const workerPath = path.join(projectRoot, 'workers', 'yaya-web.js');
    const source = fs.readFileSync(workerPath, 'utf8')
        .replace('export default {', 'globalThis.__yayaWorker = {');
    const context = vm.createContext({
        console,
        fetch,
        URL,
        Response,
        TextEncoder,
        TextDecoder,
        setTimeout,
        clearTimeout,
        crypto: globalThis.crypto || crypto.webcrypto,
        globalThis: {}
    });
    context.globalThis = context;
    vm.runInContext(source, context, { filename: workerPath });
    return context.__yayaWorker;
}

const worker = loadWorkerRuntime();

function getCorsOrigin(origin) {
    if (!origin) return '';
    if (allowedOrigins.includes('*')) return '*';
    return allowedOrigins.includes(origin) ? origin : '';
}

function applyCorsHeaders(response, origin) {
    const corsOrigin = getCorsOrigin(origin);
    if (corsOrigin) {
        response.headers.set('Access-Control-Allow-Origin', corsOrigin);
        response.headers.set('Vary', 'Origin');
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, token, pa');
    response.headers.set('Access-Control-Max-Age', '86400');
    return response;
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function createFetchRequest(req) {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = `http://${host}${req.url || '/'}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            value.forEach((item) => headers.append(key, item));
        } else if (value !== undefined) {
            headers.set(key, String(value));
        }
    }

    const init = {
        method: req.method || 'GET',
        headers
    };
    if (init.method !== 'GET' && init.method !== 'HEAD') {
        init.body = await readRequestBody(req);
    }
    return new Request(url, init);
}

async function writeFetchResponse(res, response) {
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
        res.setHeader(key, value);
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json;charset=utf-8',
            'Cache-Control': 'no-store'
        }
    });
}

const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || '');

    try {
        if (req.method === 'OPTIONS') {
            return writeFetchResponse(res, applyCorsHeaders(new Response(null, { status: 204 }), origin));
        }

        const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (requestUrl.pathname === '/') {
            return writeFetchResponse(res, applyCorsHeaders(json({
                success: true,
                runtime: 'node',
                service: 'yaya-api'
            }), origin));
        }

        if (!requestUrl.pathname.startsWith('/api/')) {
            return writeFetchResponse(res, applyCorsHeaders(json({
                success: false,
                msg: 'Not Found'
            }, 404), origin));
        }

        const fetchRequest = await createFetchRequest(req);
        const response = await worker.fetch(fetchRequest, {
            YAYA_API_BACKEND: 'local',
            ASSETS: {
                fetch() {
                    return json({ success: false, msg: 'Assets are not served by API backend' }, 404);
                }
            }
        });
        return writeFetchResponse(res, applyCorsHeaders(response, origin));
    } catch (error) {
        console.error(error);
        return writeFetchResponse(res, applyCorsHeaders(json({
            success: false,
            msg: error?.message || 'Internal Server Error'
        }, 500), origin));
    }
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Yaya API backend listening on http://0.0.0.0:${port}`);
});
