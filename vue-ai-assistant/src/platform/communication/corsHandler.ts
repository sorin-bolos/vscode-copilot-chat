// CORS and browser security utilities
// Handles browser security constraints for cross-origin requests

export interface CORSOptions {
	origin?: string | string[] | RegExp | boolean;
	methods?: string[];
	allowedHeaders?: string[];
	credentials?: boolean;
	maxAge?: number;
}

export class CORSError extends Error {
	constructor(
		message: string,
		public url: string,
		public method: string
	) {
		super(message);
		this.name = 'CORSError';
	}
}

export class CORSHandler {
	static async checkCORSSupport(url: string, method = 'GET'): Promise<boolean> {
		try {
			// Try a preflight request
			const response = await fetch(url, {
				method: 'OPTIONS',
				headers: {
					'Access-Control-Request-Method': method,
					'Access-Control-Request-Headers': 'content-type,authorization'
				}
			});

			return response.ok;
		} catch (error) {
			return false;
		}
	}

	static async validateCORSResponse(response: Response, originalUrl: string): Promise<void> {
		// Check if the response indicates CORS issues
		if (response.type === 'opaque') {
			throw new CORSError(
				'Response blocked by CORS policy (opaque response)',
				originalUrl,
				'GET'
			);
		}

		if (response.type === 'opaqueredirect') {
			throw new CORSError(
				'Response blocked by CORS policy (opaque redirect)',
				originalUrl,
				'GET'
			);
		}

		// Check for specific CORS error indicators
		if (response.status === 0) {
			throw new CORSError(
				'Request blocked by CORS policy',
				originalUrl,
				'GET'
			);
		}
	}

	static createProxyUrl(targetUrl: string, proxyBaseUrl?: string): string {
		if (!proxyBaseUrl) {
			// Use a default CORS proxy (in production, you'd use your own)
			proxyBaseUrl = 'https://api.allorigins.win/raw?url=';
		}

		return `${proxyBaseUrl}${encodeURIComponent(targetUrl)}`;
	}

	static async fetchWithCORSFallback(
		url: string,
		options: RequestInit = {},
		proxyBaseUrl?: string
	): Promise<Response> {
		try {
			// Try direct request first
			const response = await fetch(url, options);
			await this.validateCORSResponse(response, url);
			return response;
		} catch (error) {
			if (error instanceof CORSError) {
				// Fallback to proxy
				const proxyUrl = this.createProxyUrl(url, proxyBaseUrl);

				try {
					return await fetch(proxyUrl, {
						...options,
						// Remove headers that might cause issues with proxy
						headers: this.sanitizeHeadersForProxy(options.headers)
					});
				} catch (proxyError) {
					throw new CORSError(
						`Both direct request and proxy failed: ${error.message}`,
						url,
						options.method || 'GET'
					);
				}
			}
			throw error;
		}
	}

	private static sanitizeHeadersForProxy(headers?: HeadersInit): HeadersInit | undefined {
		if (!headers) return undefined;

		const sanitized: Record<string, string> = {};
		const headersObj = new Headers(headers);

		// Only keep safe headers for proxy requests
		const safeHeaders = ['content-type', 'accept', 'user-agent'];

		headersObj.forEach((value, key) => {
			if (safeHeaders.includes(key.toLowerCase())) {
				sanitized[key] = value;
			}
		});

		return sanitized;
	}
}

// Content Security Policy utilities
export class CSPHandler {
	static async checkCSPViolation(url: string): Promise<boolean> {
		try {
			// Create a temporary iframe to test CSP
			const iframe = document.createElement('iframe');
			iframe.style.display = 'none';
			iframe.src = url;

			document.body.appendChild(iframe);

			return new Promise<boolean>((resolve) => {
				const timeout = setTimeout(() => {
					document.body.removeChild(iframe);
					resolve(false); // Assume CSP violation if no load event
				}, 5000);

				iframe.onload = () => {
					clearTimeout(timeout);
					document.body.removeChild(iframe);
					resolve(true);
				};

				iframe.onerror = () => {
					clearTimeout(timeout);
					document.body.removeChild(iframe);
					resolve(false);
				};
			});
		} catch (error) {
			return false;
		}
	}

	static getCSPDirectives(): Record<string, string[]> | null {
		const metaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
		const directives: Record<string, string[]> = {};

		metaTags.forEach(meta => {
			const content = meta.getAttribute('content');
			if (content) {
				this.parseCSPContent(content, directives);
			}
		});

		// Also check HTTP headers if available (limited in browser)
		return Object.keys(directives).length > 0 ? directives : null;
	}

	private static parseCSPContent(content: string, directives: Record<string, string[]>): void {
		const parts = content.split(';').map(part => part.trim());

		parts.forEach(part => {
			const [directive, ...sources] = part.split(/\s+/);
			if (directive) {
				directives[directive] = sources;
			}
		});
	}
}

// Mixed content (HTTPS/HTTP) handling
export class MixedContentHandler {
	static isSecureContext(): boolean {
		return window.isSecureContext;
	}

	static canLoadMixedContent(targetUrl: string): boolean {
		if (!this.isSecureContext()) {
			return true; // HTTP pages can load HTTP content
		}

		// HTTPS pages can only load HTTPS content
		return targetUrl.startsWith('https://') || targetUrl.startsWith('wss://');
	}

	static upgradeToSecure(url: string): string {
		if (url.startsWith('http://')) {
			return url.replace('http://', 'https://');
		}
		if (url.startsWith('ws://')) {
			return url.replace('ws://', 'wss://');
		}
		return url;
	}

	static async testSecureUpgrade(url: string): Promise<boolean> {
		if (!url.startsWith('http://')) {
			return false;
		}

		const secureUrl = this.upgradeToSecure(url);

		try {
			const response = await fetch(secureUrl, { method: 'HEAD' });
			return response.ok;
		} catch {
			return false;
		}
	}
}

// Browser capability detection
export class BrowserCapabilities {
	static supportsWebSockets(): boolean {
		return 'WebSocket' in window;
	}

	static supportsServerSentEvents(): boolean {
		return 'EventSource' in window;
	}

	static supportsStreaming(): boolean {
		return 'ReadableStream' in window && 'fetch' in window;
	}

	static supportsServiceWorkers(): boolean {
		return 'serviceWorker' in navigator;
	}

	static async supportsWasm(): Promise<boolean> {
		if (!('WebAssembly' in window)) {
			return false;
		}

		try {
			// Test with a minimal WASM module
			const wasmModule = new Uint8Array([
				0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
			]);
			await WebAssembly.instantiate(wasmModule);
			return true;
		} catch {
			return false;
		}
	}

	static getMaxRequestSize(): number {
		// Browser-dependent, but generally safe limit
		return 64 * 1024 * 1024; // 64MB
	}

	static getMaxConcurrentRequests(): number {
		// Most browsers allow 6-8 concurrent requests per domain
		return 6;
	}

	static async getBandwidthEstimate(): Promise<number | null> {
		if ('connection' in navigator) {
			const connection = (navigator as any).connection;
			return connection.downlink || null; // Mbps
		}
		return null;
	}
}

// Security headers validation
export class SecurityHeaders {
	static validateResponse(response: Response): string[] {
		const warnings: string[] = [];
		const headers = response.headers;

		// Check for important security headers
		if (!headers.get('x-content-type-options')) {
			warnings.push('Missing X-Content-Type-Options header');
		}

		if (!headers.get('x-frame-options') && !headers.get('content-security-policy')) {
			warnings.push('Missing X-Frame-Options or CSP frame-ancestors directive');
		}

		if (!headers.get('x-xss-protection')) {
			warnings.push('Missing X-XSS-Protection header');
		}

		if (response.url.startsWith('https://') && !headers.get('strict-transport-security')) {
			warnings.push('Missing Strict-Transport-Security header on HTTPS response');
		}

		return warnings;
	}

	static isResponseSecure(response: Response): boolean {
		return this.validateResponse(response).length === 0;
	}
}
