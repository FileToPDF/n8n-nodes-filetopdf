/**
 * End-to-end harness for the FileToPDF n8n node.
 *
 * Drives the COMPILED node's real execute() against the live API, mocking only
 * the n8n IExecuteFunctions plumbing (parameters, binary helpers) — the HTTP
 * request shape (multipart vs JSON, headers, envelope parsing, base64 decode,
 * error mapping) is exercised exactly as it runs inside n8n.
 *
 * Usage: FILETOPDF_API_KEY=sk_... node test/e2e.js
 */
const https = require('https');
const { FileToPdf } = require('../dist/nodes/FileToPdf/FileToPdf.node.js');

const API_KEY = process.env.FILETOPDF_API_KEY;
if (!API_KEY) {
	console.error('Set FILETOPDF_API_KEY to run the e2e tests.');
	process.exit(1);
}

// ── Minimal mock of n8n's IExecuteFunctions ──────────────────────────────────
function makeCtx({ params, binary, continueOnFail = false }) {
	return {
		getInputData: () => [{ json: {}, binary }],
		getNode: () => ({ name: 'FileToPDF', type: 'fileToPdf', typeVersion: 1 }),
		continueOnFail: () => continueOnFail,
		getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
		helpers: {
			assertBinaryData: (_i, prop) => binary[prop],
			getBinaryDataBuffer: async (_i, prop) => Buffer.from(binary[prop].data, 'base64'),
			prepareBinaryData: async (buffer, fileName, mimeType) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
				fileSize: buffer.length,
			}),
			httpRequestWithAuthentication: { call: realHttpRequest },
		},
	};
}

// ── Real HTTP, mimicking n8n's helper contract ───────────────────────────────
function realHttpRequest(_ctx, _credName, options) {
	return new Promise((resolve, reject) => {
		const url = new URL(options.url);
		const headers = { ...(options.headers || {}), 'x-api-key': API_KEY };

		// Body can be: a Buffer (hand-built multipart), a JS object (json:true), or undefined.
		let bodyData = null;
		if (options.body !== undefined) {
			if (Buffer.isBuffer(options.body)) {
				bodyData = options.body;
				headers['Content-Length'] = options.body.length;
			} else if (options.json === true) {
				bodyData = JSON.stringify(options.body);
				headers['Content-Type'] = headers['Content-Type'] || 'application/json';
				headers['Content-Length'] = Buffer.byteLength(bodyData);
			}
		}

		const req = https.request(
			{ hostname: url.hostname, path: url.pathname + url.search, method: options.method, headers },
			(res) => {
				const chunks = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () => {
					const raw = Buffer.concat(chunks).toString('utf-8');
					const body = options.json === true ? safeParse(raw) : raw;
					resolve({ statusCode: res.statusCode, body });
				});
			},
		);
		req.on('error', reject);
		if (bodyData) req.write(bodyData);
		req.end();
	});
}

const safeParse = (s) => {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
};

// 1x1 transparent PNG
const PNG_B64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function run() {
	const node = new FileToPdf();
	let pass = 0;
	let fail = 0;
	const check = (name, ok, detail) => {
		console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
		ok ? pass++ : fail++;
	};

	// ── 1. Convert HTML ──
	try {
		const ctx = makeCtx({
			params: {
				operation: 'convertHtml',
				html: '<h1>Invoice #42</h1><p>Hello from the n8n node.</p>',
				css: 'h1{color:#2563eb} body{font-family:sans-serif}',
				options: { landscape: false },
				outputBinaryField: 'data',
			},
		});
		const [out] = await node.execute.call(ctx);
		const item = out[0];
		check('Convert HTML', item.binary.data.mimeType === 'application/pdf' && item.json.pages >= 1,
			`pages=${item.json.pages} size=${item.json.fileSize} credits=${item.json.creditsRemaining}`);
	} catch (e) {
		check('Convert HTML', false, e.message);
	}

	// ── 2. Convert Markdown ──
	try {
		const ctx = makeCtx({
			params: {
				operation: 'convertMarkdown',
				markdown: '# Report\n\n| Item | Qty |\n|---|---|\n| Widgets | 3 |\n\n```js\nconst x = 1;\n```',
				css: '',
				options: {},
				outputBinaryField: 'data',
			},
		});
		const [out] = await node.execute.call(ctx);
		const item = out[0];
		check('Convert Markdown', item.binary.data.mimeType === 'application/pdf' && item.json.pages >= 1,
			`pages=${item.json.pages} size=${item.json.fileSize}`);
	} catch (e) {
		check('Convert Markdown', false, e.message);
	}

	// ── 3. Convert a File (binary upload) ──
	try {
		const ctx = makeCtx({
			params: {
				operation: 'convertFile',
				fileInput: 'binary',
				binaryPropertyName: 'data',
				fileOptions: {},
				outputBinaryField: 'data',
			},
			binary: { data: { data: PNG_B64, fileName: 'pixel.png', mimeType: 'image/png' } },
		});
		const [out] = await node.execute.call(ctx);
		const item = out[0];
		check('Convert a File (binary png)', item.binary.data.mimeType === 'application/pdf' && item.json.pages >= 1,
			`filename=${item.json.filename} pages=${item.json.pages}`);
	} catch (e) {
		check('Convert a File (binary png)', false, e.message);
	}

	// ── 4. Error case — forbidden URL maps to a clean node error ──
	try {
		const ctx = makeCtx({
			params: {
				operation: 'convertFile',
				fileInput: 'url',
				url: 'http://localhost/secret.docx',
				fileOptions: {},
				outputBinaryField: 'data',
			},
		});
		await node.execute.call(ctx);
		check('Error mapping (forbidden URL)', false, 'expected an error but none thrown');
	} catch (e) {
		check('Error mapping (forbidden URL)', /forbidden|internal|private|403/i.test(e.message), e.message);
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
}

run();
