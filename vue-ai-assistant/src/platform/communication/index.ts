// Communication Layer - Main exports
// Browser-compatible HTTP and WebSocket services

export * from './corsHandler';
export * from './httpClient';
export * from './webSocketService';

// Re-export commonly used types
export type {
	AuthenticationProvider, HttpClientConfig, RequestConfig,
	ResponseData
} from './httpClient';

export type {
	ConnectionInfo, WebSocketConfig,
	WebSocketMessage
} from './webSocketService';

export {
	WebSocketState
} from './webSocketService';

export type {
	CORSOptions
} from './corsHandler';

// Factory functions for common use cases
import { HttpClient } from './httpClient';
import { AIStreamingWebSocket, WebSocketService, type WebSocketConfig } from './webSocketService';

export class CommunicationFactory {
	// Create HTTP client for AI API communication
	static createAIHttpClient(config: {
		apiKey?: string;
		baseURL?: string;
		timeout?: number;
	} = {}): HttpClient {
		return HttpClient.createForAI(config);
	}

	// Create WebSocket for real-time features
	static createWebSocket(url: string, config?: Partial<WebSocketConfig>): WebSocketService {
		return new WebSocketService({
			url,
			reconnect: true,
			reconnectInterval: 5000,
			maxReconnectAttempts: 5,
			heartbeatInterval: 30000,
			messageQueueSize: 100,
			...config
		});
	}

	// Create AI streaming WebSocket
	static createAIStreamingWebSocket(url: string, config?: Partial<WebSocketConfig>): AIStreamingWebSocket {
		return new AIStreamingWebSocket({
			url,
			reconnect: true,
			reconnectInterval: 3000,
			maxReconnectAttempts: 10,
			heartbeatInterval: 20000,
			messageQueueSize: 50,
			...config
		});
	}
}
