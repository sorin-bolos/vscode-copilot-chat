import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../../utils/events';
import { BrowserCapabilities, CORSHandler } from '../corsHandler';
import { HttpClient, HttpClientError, TokenManager } from '../httpClient';
import { CommunicationFactory } from '../index';
import { AIStreamingWebSocket, WebSocketService, WebSocketState } from '../webSocketService';

// Mock fetch globally
global.fetch = vi.fn();

// Mock WebSocket properly
const mockWebSocketConstructor = vi.fn();
Object.assign(mockWebSocketConstructor, {
	CONNECTING: 0,
	OPEN: 1,
	CLOSING: 2,
	CLOSED: 3
});
global.WebSocket = mockWebSocketConstructor as any;

describe('Communication Layer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('HttpClient', () => {
		let httpClient: HttpClient;

		beforeEach(() => {
			httpClient = new HttpClient({
				baseURL: 'https://api.example.com',
				timeout: 5000,
				retries: 2
			});
		});

		afterEach(() => {
			vi.clearAllMocks();
		});

		it('should make successful GET request', async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				statusText: 'OK',
				headers: new Headers(),
				url: 'https://api.example.com/test',
				json: vi.fn().mockResolvedValue({ data: 'test' })
			};

			vi.mocked(fetch).mockResolvedValue(mockResponse as any);

			const response = await httpClient.get('/test');

			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/test',
				expect.objectContaining({
					method: 'GET'
				})
			);

			expect(response.data).toEqual({ data: 'test' });
			expect(response.status).toBe(200);
		});

		it('should handle POST request with JSON body', async () => {
			const mockResponse = {
				ok: true,
				status: 201,
				statusText: 'Created',
				headers: new Headers(),
				url: 'https://api.example.com/users',
				json: vi.fn().mockResolvedValue({ id: 1, name: 'John' })
			};

			vi.mocked(fetch).mockResolvedValue(mockResponse as any);

			const userData = { name: 'John', email: 'john@example.com' };
			const response = await httpClient.post('/users', userData);

			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com/users',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(userData)
				})
			);

			expect(response.data).toEqual({ id: 1, name: 'John' });
		});

		it('should handle HTTP errors', async () => {
			const mockResponse = {
				ok: false,
				status: 404,
				statusText: 'Not Found',
				headers: new Headers(),
				url: 'https://api.example.com/notfound',
				json: vi.fn().mockResolvedValue({ error: 'Not found' })
			};

			vi.mocked(fetch).mockResolvedValue(mockResponse as any);

			await expect(httpClient.get('/notfound')).rejects.toThrow(HttpClientError);
		});

		it('should retry on retryable errors', async () => {
			const mockErrorResponse = {
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				headers: new Headers(),
				url: 'https://api.example.com/error',
				json: vi.fn().mockResolvedValue({ error: 'Server error' })
			};

			const mockSuccessResponse = {
				ok: true,
				status: 200,
				statusText: 'OK',
				headers: new Headers(),
				url: 'https://api.example.com/error',
				json: vi.fn().mockResolvedValue({ data: 'success' })
			};

			vi.mocked(fetch)
				.mockResolvedValueOnce(mockErrorResponse as any)
				.mockResolvedValueOnce(mockSuccessResponse as any);

			const response = await httpClient.get('/error');

			expect(fetch).toHaveBeenCalledTimes(2);
			expect(response.data).toEqual({ data: 'success' });
		});

		it('should handle authentication with token refresh', async () => {
			const onAuthenticationFailed = new EventEmitter<void>();
			const authProvider = {
				getAuthHeaders: vi.fn().mockResolvedValue({
					'Authorization': 'Bearer old-token'
				}),
				refreshToken: vi.fn().mockResolvedValue(undefined),
				onAuthenticationFailed
			};

			const clientWithAuth = new HttpClient({}, authProvider);

			// First request returns 401
			const mock401Response = {
				ok: false,
				status: 401,
				statusText: 'Unauthorized',
				headers: new Headers(),
				json: vi.fn().mockResolvedValue({ error: 'Unauthorized' })
			};

			// Second request (after token refresh) succeeds
			const mockSuccessResponse = {
				ok: true,
				status: 200,
				statusText: 'OK',
				headers: new Headers(),
				json: vi.fn().mockResolvedValue({ data: 'success' })
			};

			vi.mocked(fetch)
				.mockResolvedValueOnce(mock401Response as any)
				.mockResolvedValueOnce(mockSuccessResponse as any);

			const response = await clientWithAuth.get('/protected');

			expect(authProvider.refreshToken).toHaveBeenCalled();
			expect(response.data).toEqual({ data: 'success' });
		});

		it('should support streaming responses', async () => {
			const mockStream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('chunk1'));
					controller.enqueue(new TextEncoder().encode('chunk2'));
					controller.close();
				}
			});

			const mockResponse = {
				ok: true,
				status: 200,
				body: mockStream
			};

			vi.mocked(fetch).mockResolvedValue(mockResponse as any);

			const stream = await httpClient.stream('/stream');
			expect(stream).toBeInstanceOf(ReadableStream);
		});
	});

	describe('TokenManager', () => {
		let tokenManager: TokenManager;

		beforeEach(() => {
			tokenManager = new TokenManager();
		});

		it('should store and retrieve tokens', () => {
			tokenManager.setToken('api', 'test-token');
			expect(tokenManager.getToken('api')).toBe('test-token');
		});

		it('should handle token expiration', () => {
			tokenManager.setToken('api', 'test-token', 1); // 1 second
			expect(tokenManager.getToken('api')).toBe('test-token');
			expect(tokenManager.isExpired('api')).toBe(false);

			// Wait for expiration (mocked)
			vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
			expect(tokenManager.getToken('api')).toBeNull();
			expect(tokenManager.isExpired('api')).toBe(true);
		});

		it('should remove tokens', () => {
			tokenManager.setToken('api', 'test-token');
			tokenManager.removeToken('api');
			expect(tokenManager.getToken('api')).toBeNull();
		});
	});

	describe('WebSocketService', () => {
		let mockWebSocket: any;
		let webSocketService: WebSocketService;

		beforeEach(() => {
			mockWebSocket = {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				send: vi.fn(),
				close: vi.fn(),
				readyState: WebSocket.CONNECTING
			};

			vi.mocked(WebSocket).mockImplementation(() => mockWebSocket);

			webSocketService = new WebSocketService({
				url: 'ws://localhost:8080',
				reconnect: true,
				reconnectInterval: 1000,
				maxReconnectAttempts: 3
			});
		});

		it('should create WebSocket connection', async () => {
			const connectPromise = webSocketService.connect();

			// Simulate connection open
			const openHandler = mockWebSocket.addEventListener.mock.calls
				.find(([event]: any) => event === 'open')?.[1];
			openHandler?.();

			await connectPromise;

			expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8080', undefined);
			expect(webSocketService.isConnected).toBe(true);
		});

		it('should handle connection failure', async () => {
			const connectPromise = webSocketService.connect();

			// Simulate connection error
			const errorHandler = mockWebSocket.addEventListener.mock.calls
				.find(([event]: any) => event === 'error')?.[1];
			errorHandler?.();

			await expect(connectPromise).rejects.toThrow();
		});

		it('should send messages when connected', () => {
			// Set connected state
			webSocketService['state'] = WebSocketState.Connected;
			webSocketService['ws'] = mockWebSocket;

			const message = { type: 'test', data: 'hello' };
			const result = webSocketService.send(message);

			expect(result).toBe(true);
			expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(message));
		});

		it('should queue messages when disconnected', () => {
			const message = { type: 'test', data: 'hello' };
			const result = webSocketService.send(message);

			expect(result).toBe(false);
			expect(webSocketService['messageQueue']).toHaveLength(1);
		});

		it('should handle reconnection', () => {
			// Simulate connection close with abnormal code
			const closeHandler = mockWebSocket.addEventListener.mock.calls
				.find(([event]: any) => event === 'close')?.[1];

			closeHandler?.({ code: 1006, reason: 'Abnormal closure' });

			expect(webSocketService.currentState).toBe(WebSocketState.Reconnecting);
		});

		it('should dispose properly', () => {
			webSocketService.dispose();
			expect(mockWebSocket.close).toHaveBeenCalledWith(1000, 'Normal closure');
		});
	});

	describe('AIStreamingWebSocket', () => {
		let mockWebSocket: any;
		let aiWebSocket: AIStreamingWebSocket;

		beforeEach(() => {
			mockWebSocket = {
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				send: vi.fn(),
				close: vi.fn(),
				readyState: WebSocket.CONNECTING
			};

			vi.mocked(WebSocket).mockImplementation(() => mockWebSocket);

			aiWebSocket = new AIStreamingWebSocket({
				url: 'ws://localhost:8080/ai',
				reconnect: true
			});
		});

		it('should send AI requests', () => {
			// Set connected state
			aiWebSocket['state'] = WebSocketState.Connected;
			aiWebSocket['ws'] = mockWebSocket;

			const requestId = aiWebSocket.sendAIRequest('Hello AI', { temperature: 0.7 });

			expect(requestId).toMatch(/^ai_\d+_[a-z0-9]+$/);
			expect(mockWebSocket.send).toHaveBeenCalledWith(
				expect.stringContaining('"type":"ai_request"')
			);
		});

		it('should handle streaming events', () => {
			const streamStartHandler = vi.fn();
			const streamChunkHandler = vi.fn();
			const streamEndHandler = vi.fn();

			aiWebSocket.onStreamStarted.on(streamStartHandler);
			aiWebSocket.onStreamChunkReceived.on(streamChunkHandler);
			aiWebSocket.onStreamEnded.on(streamEndHandler);

			// Simulate receiving streaming messages
			const messageHandler = mockWebSocket.addEventListener.mock.calls
				.find(([event]: any) => event === 'message')?.[1];

			messageHandler?.({
				data: JSON.stringify({
					type: 'stream_start',
					data: { requestId: 'test-123' }
				})
			});

			messageHandler?.({
				data: JSON.stringify({
					type: 'stream_chunk',
					data: { requestId: 'test-123', chunk: 'Hello' }
				})
			});

			messageHandler?.({
				data: JSON.stringify({
					type: 'stream_end',
					data: { requestId: 'test-123' }
				})
			});

			expect(streamStartHandler).toHaveBeenCalledWith({ requestId: 'test-123' });
			expect(streamChunkHandler).toHaveBeenCalledWith({
				requestId: 'test-123',
				chunk: 'Hello'
			});
			expect(streamEndHandler).toHaveBeenCalledWith({ requestId: 'test-123' });
		});
	});

	describe('CORSHandler', () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it('should check CORS support', async () => {
			const mockResponse = { ok: true };
			vi.mocked(fetch).mockResolvedValue(mockResponse as any);

			const result = await CORSHandler.checkCORSSupport('https://api.example.com');

			expect(result).toBe(true);
			expect(fetch).toHaveBeenCalledWith(
				'https://api.example.com',
				expect.objectContaining({
					method: 'OPTIONS'
				})
			);
		});

		it('should create proxy URL', () => {
			const targetUrl = 'https://api.example.com/data';
			const proxyUrl = CORSHandler.createProxyUrl(targetUrl);

			expect(proxyUrl).toContain(encodeURIComponent(targetUrl));
		});

		it('should fall back to proxy on CORS error', async () => {
			const corsError = new Error('CORS error');
			corsError.name = 'TypeError';

			const successResponse = {
				ok: true,
				json: vi.fn().mockResolvedValue({ data: 'success' })
			};

			vi.mocked(fetch)
				.mockRejectedValueOnce(corsError)
				.mockResolvedValueOnce(successResponse as any);

			const response = await CORSHandler.fetchWithCORSFallback('https://api.example.com/data');

			expect(fetch).toHaveBeenCalledTimes(2);
			expect(response).toBe(successResponse);
		});
	});

	describe('BrowserCapabilities', () => {
		it('should detect WebSocket support', () => {
			// WebSocket is mocked, so it should return true
			expect(BrowserCapabilities.supportsWebSockets()).toBe(true);
		});

		it('should detect streaming support', () => {
			// These should be available in test environment
			expect(BrowserCapabilities.supportsStreaming()).toBe(true);
		});

		it('should get safe request limits', () => {
			expect(BrowserCapabilities.getMaxRequestSize()).toBeGreaterThan(0);
			expect(BrowserCapabilities.getMaxConcurrentRequests()).toBeGreaterThan(0);
		});
	});

	describe('CommunicationFactory', () => {
		it('should create AI HTTP client', () => {
			const client = CommunicationFactory.createAIHttpClient({
				apiKey: 'test-key',
				baseURL: 'https://api.openai.com',
				timeout: 30000
			});

			expect(client).toBeInstanceOf(HttpClient);
		});

		it('should create WebSocket service', () => {
			const ws = CommunicationFactory.createWebSocket('ws://localhost:8080');
			expect(ws).toBeInstanceOf(WebSocketService);
		});

		it('should create AI streaming WebSocket', () => {
			const aiWs = CommunicationFactory.createAIStreamingWebSocket('ws://localhost:8080/ai');
			expect(aiWs).toBeInstanceOf(AIStreamingWebSocket);
		});
	});
});
