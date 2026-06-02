import type {
	IExecuteFunctions,
	IDataObject,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { randomBytes } from 'crypto';

const BASE_URL = 'https://api.filetopdf.dev';

/**
 * Shared "Options" fields for the Chromium-rendered operations (HTML & Markdown).
 * Layout/Chromium knobs the API forwards to its rendering engine.
 */
const chromiumOptions: INodeTypeDescription['properties'] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['convertHtml', 'convertMarkdown'],
			},
		},
		options: [
			{
				displayName: 'Landscape Orientation',
				name: 'landscape',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Margin Bottom (Inches)',
				name: 'marginBottom',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Margin Left (Inches)',
				name: 'marginLeft',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Margin Right (Inches)',
				name: 'marginRight',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Margin Top (Inches)',
				name: 'marginTop',
				type: 'number',
				default: 0,
			},
			{
				displayName: 'Output Open Password',
				name: 'userPassword',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Encrypt the resulting PDF; this password is required to open it',
			},
			{
				displayName: 'Output Permissions Password',
				name: 'ownerPassword',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Restrict editing/printing of the resulting PDF',
			},
			{
				displayName: 'Page Ranges',
				name: 'nativePageRanges',
				type: 'string',
				default: '',
				placeholder: '1-3 or 2,5-7',
				description: 'Limit output to specific pages, e.g. "1-3" or "2,5-7"',
			},
			{
				displayName: 'Paper Height (Inches)',
				name: 'paperHeight',
				type: 'number',
				default: 11,
				description: 'Default 11 (Letter). A4 is 11.7.',
			},
			{
				displayName: 'Paper Width (Inches)',
				name: 'paperWidth',
				type: 'number',
				default: 8.5,
				description: 'Default 8.5 (Letter). A4 is 8.27.',
			},
			{
				displayName: 'PDF/A Archival Format',
				name: 'pdfa',
				type: 'options',
				default: '',
				description: 'Produce an ISO-standardised archival PDF',
				options: [
					{ name: 'None', value: '' },
					{ name: 'PDF/A-1b', value: 'PDF/A-1b' },
					{ name: 'PDF/A-2b', value: 'PDF/A-2b' },
					{ name: 'PDF/A-3b', value: 'PDF/A-3b' },
				],
			},
			{
				displayName: 'PDF/UA (Accessibility)',
				name: 'pdfua',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Prefer CSS @Page Size',
				name: 'preferCssPageSize',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Print Background Graphics',
				name: 'printBackground',
				type: 'boolean',
				default: false,
			},
			{
				displayName: 'Scale',
				name: 'scale',
				type: 'number',
				default: 1,
				description: 'Render scale, e.g. 0.8 to shrink content. Default 1.',
			},
		],
	},
];

export class FileToPdf implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FileToPDF',
		name: 'fileToPdf',
		icon: 'file:filetopdf.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert files, HTML and Markdown into polished PDFs',
		defaults: {
			name: 'FileToPDF',
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'fileToPdfApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'convertFile',
				options: [
					{
						name: 'Convert a File',
						value: 'convertFile',
						description:
							'Convert Word, Excel, PowerPoint, images and 130+ formats into PDF, from a binary or a public URL',
						action: 'Convert a file to PDF',
					},
					{
						name: 'Convert HTML',
						value: 'convertHtml',
						description: 'Render HTML + CSS into a pixel-perfect PDF',
						action: 'Convert HTML to PDF',
					},
					{
						name: 'Convert Markdown',
						value: 'convertMarkdown',
						description: 'Convert Markdown into a clean, styled PDF',
						action: 'Convert markdown to pdf',
					},
					{
						name: 'Custom API Call',
						value: 'customApiCall',
						description: 'Call any FileToPDF endpoint directly',
						action: 'Make a custom API call',
					},
				],
			},

			// ─── Convert a File ───────────────────────────────────────────────
			{
				displayName: 'Input',
				name: 'fileInput',
				type: 'options',
				noDataExpression: true,
				default: 'binary',
				displayOptions: {
					show: { operation: ['convertFile'] },
				},
				options: [
					{
						name: 'Binary Property',
						value: 'binary',
						description: 'Use a file from a previous node (e.g. an HTTP download or email attachment)',
					},
					{
						name: 'Public URL',
						value: 'url',
						description: 'Download and convert a file from a public http(s) URL',
					},
				],
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: { operation: ['convertFile'], fileInput: ['binary'] },
				},
				hint: 'The name of the input binary field containing the file to convert',
				description:
					"Name of the binary property holding the source file. The file name's extension selects the converter and names the output PDF.",
			},
			{
				displayName: 'File URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://example.com/report.docx',
				displayOptions: {
					show: { operation: ['convertFile'], fileInput: ['url'] },
				},
				description:
					'A publicly reachable http(s) URL to the source file. The file is downloaded and converted by its extension. Private/internal addresses are rejected. This downloads a file — to render a live web page, that is not supported.',
			},
			{
				displayName: 'Options',
				name: 'fileOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: { operation: ['convertFile'] },
				},
				options: [
					{
						displayName: 'Landscape Orientation',
						name: 'landscape',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Output Open Password',
						name: 'userPassword',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description: 'Encrypt the resulting PDF; this password is required to open it',
					},
					{
						displayName: 'Output Permissions Password',
						name: 'ownerPassword',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description: 'Restrict editing/printing of the resulting PDF',
					},
					{
						displayName: 'Page Ranges',
						name: 'nativePageRanges',
						type: 'string',
						default: '',
						placeholder: '1-3 or 2,5-7',
						description: 'Limit output to specific pages, e.g. "1-3" or "2,5-7"',
					},
					{
						displayName: 'PDF/A Archival Format',
						name: 'pdfa',
						type: 'options',
						default: '',
						description: 'Produce an ISO-standardised archival PDF',
						options: [
							{ name: 'None', value: '' },
							{ name: 'PDF/A-1b', value: 'PDF/A-1b' },
							{ name: 'PDF/A-2b', value: 'PDF/A-2b' },
							{ name: 'PDF/A-3b', value: 'PDF/A-3b' },
						],
					},
					{
						displayName: 'PDF/UA (Accessibility)',
						name: 'pdfua',
						type: 'boolean',
						default: false,
					},
					{
						displayName: 'Source Document Password',
						name: 'password',
						type: 'string',
						typeOptions: { password: true },
						default: '',
						description: 'Password to open a protected source document (office files only)',
					},
				],
			},

			// ─── Convert HTML ─────────────────────────────────────────────────
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['convertHtml'] },
				},
				description:
					'The HTML markup to render. A full document or just a fragment both work — a fragment is wrapped for you. External images, fonts and stylesheets referenced by absolute URL are loaded.',
			},
			{
				displayName: 'CSS',
				name: 'css',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				displayOptions: {
					show: { operation: ['convertHtml'] },
				},
				description: 'Optional CSS injected into the document\'s &lt;head&gt;. Use @page rules for page size/margins, or set them in Options. Have an .html file or a link instead? Use Convert a File.',
			},

			// ─── Convert Markdown ─────────────────────────────────────────────
			{
				displayName: 'Markdown',
				name: 'markdown',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				displayOptions: {
					show: { operation: ['convertMarkdown'] },
				},
				description:
					'The Markdown content to convert. CommonMark with tables, code blocks and images is supported.',
			},
			{
				displayName: 'CSS',
				name: 'css',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				displayOptions: {
					show: { operation: ['convertMarkdown'] },
				},
				description:
					'Optional CSS to style the rendered document. If omitted, a clean default stylesheet is applied. Have a .md file or a link instead? Use Convert a File.',
			},

			...chromiumOptions,

			// ─── Shared output field for conversion operations ────────────────
			{
				displayName: 'Put Output File in Field',
				name: 'outputBinaryField',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: { operation: ['convertFile', 'convertHtml', 'convertMarkdown'] },
				},
				hint: 'The name of the output binary field to write the generated PDF to',
			},

			// ─── Custom API Call ──────────────────────────────────────────────
			{
				displayName: 'Method',
				name: 'httpMethod',
				type: 'options',
				noDataExpression: true,
				default: 'POST',
				displayOptions: {
					show: { operation: ['customApiCall'] },
				},
				options: [
					{ name: 'GET', value: 'GET' },
					{ name: 'POST', value: 'POST' },
				],
			},
			{
				displayName: 'Endpoint',
				name: 'endpoint',
				type: 'string',
				default: '/account',
				required: true,
				placeholder: '/account',
				displayOptions: {
					show: { operation: ['customApiCall'] },
				},
				description: 'Path appended to https://api.filetopdf.dev, e.g. /account, /html or /markdown',
			},
			{
				displayName: 'JSON Body',
				name: 'jsonBody',
				type: 'json',
				default: '{}',
				displayOptions: {
					show: { operation: ['customApiCall'], httpMethod: ['POST'] },
				},
				description: 'Request body sent as application/JSON',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'customApiCall') {
					const method = this.getNodeParameter('httpMethod', i) as IHttpRequestMethods;
					const endpoint = (this.getNodeParameter('endpoint', i) as string).trim();
					const url = endpoint.startsWith('http')
						? endpoint
						: `${BASE_URL}/${endpoint.replace(/^\/+/, '')}`;

					const requestOptions: IHttpRequestOptions = {
						method,
						url,
						headers: { Accept: 'application/json' },
						json: true,
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
					};

					if (method === 'POST') {
						const jsonBody = this.getNodeParameter('jsonBody', i) as string | IDataObject;
						requestOptions.body =
							typeof jsonBody === 'string' ? jsonParse(this, jsonBody, i) : jsonBody;
					}

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'fileToPdfApi',
						requestOptions,
					);
					const envelope = parseEnvelope(response.body);
					throwOnApiError(this, response.statusCode as number, envelope, i);

					const newItem: INodeExecutionData = {
						json: envelope as IDataObject,
						pairedItem: { item: i },
					};
					// If the custom call returned a PDF envelope, expose it as binary too.
					if (envelope?.data?.pdf) {
						newItem.binary = {
							data: await pdfToBinary(this, envelope.data),
						};
					}
					returnData.push(newItem);
					continue;
				}

				// ── Build the request for a conversion operation ───────────────
				let requestOptions: IHttpRequestOptions;

				if (operation === 'convertFile') {
					const fileInput = this.getNodeParameter('fileInput', i) as string;
					const options = this.getNodeParameter('fileOptions', i, {}) as IDataObject;

					if (fileInput === 'binary') {
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
						const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

						const { body, contentType } = buildMultipart(
							{
								fieldName: 'files',
								filename: binaryData.fileName ?? 'upload.file',
								contentType: binaryData.mimeType ?? 'application/octet-stream',
								data: buffer,
							},
							stringifyOptions(options),
						);

						requestOptions = {
							method: 'POST',
							url: `${BASE_URL}/file`,
							body,
							headers: { 'Content-Type': contentType, Accept: 'application/json' },
							json: false,
							returnFullResponse: true,
							ignoreHttpStatusErrors: true,
						};
					} else {
						const url = this.getNodeParameter('url', i) as string;
						requestOptions = jsonRequest(`${BASE_URL}/file`, { url, ...stringifyOptions(options) });
					}
				} else if (operation === 'convertHtml') {
					const html = this.getNodeParameter('html', i) as string;
					const css = this.getNodeParameter('css', i, '') as string;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const body: IDataObject = { html, ...stringifyOptions(options) };
					if (css) body.css = css;
					requestOptions = jsonRequest(`${BASE_URL}/html`, body);
				} else {
					// convertMarkdown
					const markdown = this.getNodeParameter('markdown', i) as string;
					const css = this.getNodeParameter('css', i, '') as string;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const body: IDataObject = { markdown, ...stringifyOptions(options) };
					if (css) body.css = css;
					requestOptions = jsonRequest(`${BASE_URL}/markdown`, body);
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'fileToPdfApi',
					requestOptions,
				);
				const envelope = parseEnvelope(response.body);
				throwOnApiError(this, response.statusCode as number, envelope, i);

				if (!envelope?.data?.pdf) {
					throw new NodeOperationError(
						this.getNode(),
						'The API response did not contain a PDF.',
						{ itemIndex: i },
					);
				}

				const data = envelope.data;
				const outputBinaryField = this.getNodeParameter('outputBinaryField', i) as string;

				returnData.push({
					json: {
						filename: data.filename,
						pages: data.pages,
						fileSize: data.size_bytes,
						creditsUsed: data.credits_used,
						creditsRemaining: data.credits_remaining,
					},
					binary: {
						[outputBinaryField]: await pdfToBinary(this, data),
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PdfEnvelope {
	status?: string;
	error?: { code?: string; message?: string };
	data?: {
		pdf?: string;
		filename?: string;
		pages?: number;
		size_bytes?: number;
		credits_used?: number;
		credits_remaining?: number;
	};
}

/** Build a JSON POST request with the standard FileToPDF headers. */
function jsonRequest(url: string, body: IDataObject): IHttpRequestOptions {
	return {
		method: 'POST',
		url,
		body,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
}

/** Coerce collection option values to strings the API/Gotenberg expects. */
function stringifyOptions(options: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(options)) {
		if (value === undefined || value === null || value === '') continue;
		out[key] = typeof value === 'boolean' ? String(value) : String(value);
	}
	return out;
}

interface MultipartFile {
	fieldName: string;
	filename: string;
	contentType: string;
	data: Buffer;
}

/**
 * Build a multipart/form-data body by hand (no runtime dependencies — required
 * for n8n verified community nodes). One file part plus any string fields.
 */
function buildMultipart(
	file: MultipartFile,
	fields: IDataObject,
): { body: Buffer; contentType: string } {
	const boundary = `----n8nFileToPDF${randomBytes(16).toString('hex')}`;
	const CRLF = '\r\n';
	const chunks: Buffer[] = [];

	chunks.push(
		Buffer.from(
			`--${boundary}${CRLF}` +
				`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"${CRLF}` +
				`Content-Type: ${file.contentType}${CRLF}${CRLF}`,
		),
		file.data,
		Buffer.from(CRLF),
	);

	for (const [key, value] of Object.entries(fields)) {
		chunks.push(
			Buffer.from(
				`--${boundary}${CRLF}` +
					`Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
					`${value as string}${CRLF}`,
			),
		);
	}

	chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

	return {
		body: Buffer.concat(chunks),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/** The API may return a parsed object (json:true) or a raw string (json:false). */
function parseEnvelope(body: unknown): PdfEnvelope {
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as PdfEnvelope;
		} catch {
			return { status: 'error', error: { code: 'parse_error', message: body.slice(0, 500) } };
		}
	}
	return (body ?? {}) as PdfEnvelope;
}

/** Map a non-2xx FileToPDF response to a clean n8n error. */
function throwOnApiError(
	ctx: IExecuteFunctions,
	statusCode: number,
	envelope: PdfEnvelope,
	itemIndex: number,
): void {
	if (statusCode >= 200 && statusCode < 300) return;

	const code = envelope?.error?.code ?? 'error';
	const message = envelope?.error?.message ?? `Request failed with status ${statusCode}`;

	throw new NodeApiError(
		ctx.getNode(),
		{ error: { code, message } } as unknown as JsonObject,
		{
			httpCode: String(statusCode),
			message: `${message} (${code})`,
			itemIndex,
		},
	);
}

/** Decode a base64 PDF envelope into n8n binary data. */
async function pdfToBinary(ctx: IExecuteFunctions, data: NonNullable<PdfEnvelope['data']>) {
	const buffer = Buffer.from(data.pdf ?? '', 'base64');
	return ctx.helpers.prepareBinaryData(buffer, data.filename ?? 'converted.pdf', 'application/pdf');
}

/** Parse a user-supplied JSON string, raising a clean node error on failure. */
function jsonParse(ctx: IExecuteFunctions, value: string, itemIndex: number): IDataObject {
	try {
		return JSON.parse(value) as IDataObject;
	} catch {
		throw new NodeOperationError(ctx.getNode(), 'JSON Body is not valid JSON', { itemIndex });
	}
}
