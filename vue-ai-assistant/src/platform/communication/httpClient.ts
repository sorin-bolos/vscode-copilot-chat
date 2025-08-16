// HTTP Client Service for browser environment
// Replaces VS Code networking with fetch/axios-like interface

import { EventEmitter } from '../../utils/events';

export interface RequestConfig {
	url: string;
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	headers?: Record<string, string>;
	body?: any;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
	signal?: AbortSignal;
}

export interface ResponseData<T = any> {
	data: T;
	status: number;
	statusText: string;
	headers: Headers;
	url: string;
}

export interface HttpClientConfig {
	baseURL?: string;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
	defaultHeaders?: Record<string, string>;
}

export interface AuthenticationProvider {
	getAuthHeaders(): Promise<Record<string, string>>;
	refreshToken?(): Promise<void>;
	onAuthenticationFailed?: EventEmitter<void>;
}

export class HttpClientError extends Error {
	constructor(
		message: string,
		public status?: number,
		public response?: Response,
		public config?: RequestConfig
	) {
		super(message);
		this.name = 'HttpClientError';
	}
}

export class HttpClient {
	private readonly onRequest = new EventEmitter<RequestConfig>();
	private readonly onResponse = new EventEmitter<ResponseData>();
	private readonly onError = new EventEmitter<HttpClientError>();

	constructor(
		private config: HttpClientConfig = {},
		private authProvider?: AuthenticationProvider
	) { }

	// Event subscriptions
	get onRequestSent() { return this.onRequest; }
	get onResponseReceived() { return this.onResponse; }
	get onErrorOccurred() { return this.onError; }

	async request<T = any>(requestConfig: RequestConfig): Promise<ResponseData<T>> {
		const config = this.mergeConfig(requestConfig);
		let attempt = 0;
		const maxAttempts = (config.retries || 0) + 1;

		while (attempt < maxAttempts) {
			try {
				this.onRequest.emit(config);
				const response = await this.executeRequest<T>(config);
				this.onResponse.emit(response);
				return response;
			} catch (error) {
				attempt++;
				const httpError = error instanceof HttpClientError ? error :
					new HttpClientError(error instanceof Error ? error.message : 'Unknown error', undefined, undefined, config);

				// Handle authentication errors
				if (httpError.status === 401 && this.authProvider?.refreshToken) {
					try {
						await this.authProvider.refreshToken();
						// Retry with refreshed token
						continue;
					} catch (refreshError) {
						this.authProvider.onAuthenticationFailed?.emit();
						throw httpError;
					}
				}

				// Handle retryable errors
				if (attempt < maxAttempts && this.isRetryableError(httpError)) {
					await this.delay(config.retryDelay || 1000);
					continue;
				}

				this.onError.emit(httpError);
				throw httpError;
			}
		}

		throw new HttpClientError('Max retries exceeded', undefined, undefined, config);
	}

	async get<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ ...config, url, method: 'GET' });
	}

	async post<T = any>(url: string, body?: any, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ ...config, url, method: 'POST', body });
	}

	async put<T = any>(url: string, body?: any, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ ...config, url, method: 'PUT', body });
	}

	async delete<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ ...config, url, method: 'DELETE' });
	}

	async patch<T = any>(url: string, body?: any, config?: Partial<RequestConfig>): Promise<ResponseData<T>> {
		return this.request<T>({ ...config, url, method: 'PATCH', body });
	}

	// Streaming support for AI responses
	async stream(url: string, config?: Partial<RequestConfig>): Promise<ReadableStream<Uint8Array>> {
		const mergedConfig = this.mergeConfig({ ...config, url });
		const headers = await this.buildHeaders(mergedConfig);

		const response = await fetch(this.buildURL(mergedConfig.url), {
			method: mergedConfig.method || 'GET',
			headers,
			body: this.buildBody(mergedConfig.body),
			signal: mergedConfig.signal
		});

		if (!response.ok) {
			throw new HttpClientError(
				`HTTP ${response.status}: ${response.statusText}`,
				response.status,
				response,
				mergedConfig
			);
		}

		if (!response.body) {
			throw new HttpClientError('Response body is not readable', response.status, response, mergedConfig);
		}

		return response.body;
	}

	private async executeRequest<T>(config: RequestConfig): Promise<ResponseData<T>> {
		const controller = new AbortController();
		const timeoutId = config.timeout ? setTimeout(() => controller.abort(), config.timeout) : null;

		try {
			const headers = await this.buildHeaders(config);
			const response = await fetch(this.buildURL(config.url), {
				method: config.method || 'GET',
				headers,
				body: this.buildBody(config.body),
				signal: config.signal || controller.signal
			});

			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			const data = await this.parseResponse<T>(response);

			if (!response.ok) {
				throw new HttpClientError(
					`HTTP ${response.status}: ${response.statusText}`,
					response.status,
					response,
					config
				);
			}

			return {
				data,
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
				url: response.url
			};
		} catch (error) {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			if (error instanceof Error && error.name === 'AbortError') {
				throw new HttpClientError('Request timeout', undefined, undefined, config);
			}

			throw error;
		}
	}

	private async buildHeaders(config: RequestConfig): Promise<Headers> {
		const headers = new Headers();

		// Add default headers
		if (this.config.defaultHeaders) {
			Object.entries(this.config.defaultHeaders).forEach(([key, value]) => {
				headers.set(key, value);
			});
		}

		// Add request-specific headers
		if (config.headers) {
			Object.entries(config.headers).forEach(([key, value]) => {
				headers.set(key, value);
			});
		}

		// Add authentication headers
		if (this.authProvider) {
			const authHeaders = await this.authProvider.getAuthHeaders();
			Object.entries(authHeaders).forEach(([key, value]) => {
				headers.set(key, value);
			});
		}

		// Add content-type for POST/PUT/PATCH with body
		if (config.body && !headers.has('content-type')) {
			if (typeof config.body === 'string') {
				headers.set('content-type', 'application/json');
			} else if (config.body instanceof FormData) {
				// Let the browser set the content-type for FormData
			} else {
				headers.set('content-type', 'application/json');
			}
		}

		return headers;
	}

	private buildURL(url: string): string {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return url;
		}

		const baseURL = this.config.baseURL || '';
		return baseURL.endsWith('/') || url.startsWith('/')
			? `${baseURL}${url}`
			: `${baseURL}/${url}`;
	}

	private buildBody(body: any): BodyInit | undefined {
		if (!body) return undefined;

		if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
			return body;
		}

		return JSON.stringify(body);
	}

	private async parseResponse<T>(response: Response): Promise<T> {
		const contentType = response.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			return await response.json();
		}

		if (contentType.includes('text/')) {
			return await response.text() as T;
		}

		if (contentType.includes('application/octet-stream') || contentType.includes('application/binary')) {
			return await response.arrayBuffer() as T;
		}

		// Default to text
		return await response.text() as T;
	}

	private mergeConfig(requestConfig: RequestConfig): RequestConfig {
		return {
			timeout: this.config.timeout,
			retries: this.config.retries,
			retryDelay: this.config.retryDelay,
			...requestConfig
		};
	}

	private isRetryableError(error: HttpClientError): boolean {
		// Network errors (no status)
		if (!error.status) return true;

		// Server errors (5xx)
		if (error.status >= 500) return true;

		// Rate limiting
		if (error.status === 429) return true;

		// Request timeout
		if (error.status === 408) return true;

		return false;
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// CORS handling utilities
	static async checkCORSSupport(url: string): Promise<boolean> {
		try {
			const response = await fetch(url, { method: 'OPTIONS' });
			return response.ok;
		} catch {
			return false;
		}
	}

	// Configure for common scenarios
	static createForAI(config: { apiKey?: string; baseURL?: string } = {}): HttpClient {
		const authProvider: AuthenticationProvider | undefined = config.apiKey ? {
			async getAuthHeaders() {
				return {
					'Authorization': `Bearer ${config.apiKey}`,
					'User-Agent': 'Vue-AI-Assistant/1.0'
				};
			}
		} : undefined;

		return new HttpClient({
			baseURL: config.baseURL,
			timeout: 30000, // 30s timeout for AI requests
			retries: 2,
			retryDelay: 1000,
			defaultHeaders: {
				'Accept': 'application/json',
				'Content-Type': 'application/json'
			}
		}, authProvider);
	}
}

// Token management for authentication
export class TokenManager {
	private tokens = new Map<string, { token: string; expiresAt?: number }>();

	setToken(key: string, token: string, expiresIn?: number): void {
		const expiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : undefined;
		this.tokens.set(key, { token, expiresAt });
	}

	getToken(key: string): string | null {
		const tokenData = this.tokens.get(key);
		if (!tokenData) return null;

		if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
			this.tokens.delete(key);
			return null;
		}

		return tokenData.token;
	}

	removeToken(key: string): void {
		this.tokens.delete(key);
	}

	isExpired(key: string): boolean {
		const tokenData = this.tokens.get(key);
		if (!tokenData || !tokenData.expiresAt) return false;
		return Date.now() > tokenData.expiresAt;
	}
}
