import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FileToPdfApi implements ICredentialType {
	name = 'fileToPdfApi';

	displayName = 'FileToPDF API';

	documentationUrl = 'https://filetopdf.dev';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Your FileToPDF API key (format sk_live_...). Grab one free in one click on the filetopdf.dev home page — no account required, includes 10 free conversions — or create one in your dashboard. Sent as the x-api-key header.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.filetopdf.dev',
			url: '/account',
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
		},
	};
}
