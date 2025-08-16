// WebSocket Service for real-time communication
// Handles connection management, reconnection, and message queuing

import { EventEmitter } from '../../utils/events';

export interface WebSocketConfig {
	url: string;
	protocols?: string | string[];
	reconnect?: boolean;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
	heartbeatInterval?: number;
	messageQueueSize?: number;
	binaryType?: BinaryType;
}

export interface WebSocketMessage {
	id?: string;
	type: string;
	data: any;
	timestamp?: number;
}

export enum WebSocketState {
	Connecting = 'connecting',
	Connected = 'connected',
	Disconnecting = 'disconnecting',
	Disconnected = 'disconnected',
	Reconnecting = 'reconnecting',
	Failed = 'failed'
}

export interface ConnectionInfo {
	state: WebSocketState;
	url: string;
	connectedAt?: number;
	reconnectAttempts: number;
	lastError?: string;
}

export class WebSocketService {
	private ws: WebSocket | null = null;
	private state: WebSocketState = WebSocketState.Disconnected;
	private reconnectAttempts = 0;
	private reconnectTimer?: number;
	private heartbeatTimer?: number;
	private messageQueue: WebSocketMessage[] = [];
	private messageId = 0;
	private connectedAt?: number;
	private lastError?: string;

	// Events
	private readonly onStateChange = new EventEmitter<WebSocketState>();
	private readonly onMessage = new EventEmitter<WebSocketMessage>();
	private readonly onError = new EventEmitter<Event>();
	private readonly onConnectionInfo = new EventEmitter<ConnectionInfo>();

	constructor(private config: WebSocketConfig) { }

	// Event subscriptions
	get onStateChanged() { return this.onStateChange; }
	get onMessageReceived() { return this.onMessage; }
	get onErrorOccurred() { return this.onError; }
	get onConnectionInfoChanged() { return this.onConnectionInfo; }

	get currentState(): WebSocketState {
		return this.state;
	}

	get isConnected(): boolean {
		return this.state === WebSocketState.Connected;
	}

	get connectionInfo(): ConnectionInfo {
		return {
			state: this.state,
			url: this.config.url,
			connectedAt: this.connectedAt,
			reconnectAttempts: this.reconnectAttempts,
			lastError: this.lastError
		};
	}

	async connect(): Promise<void> {
		if (this.state === WebSocketState.Connected || this.state === WebSocketState.Connecting) {
			return;
		}

		this.setState(WebSocketState.Connecting);

		try {
			this.ws = new WebSocket(this.config.url, this.config.protocols);

			if (this.config.binaryType) {
				this.ws.binaryType = this.config.binaryType;
			}

			this.setupEventHandlers();

			// Wait for connection to establish or fail
			await new Promise<void>((resolve, reject) => {
				const onOpen = () => {
					this.ws?.removeEventListener('open', onOpen);
					this.ws?.removeEventListener('error', onError);
					resolve();
				};

				const onError = (event: Event) => {
					this.ws?.removeEventListener('open', onOpen);
					this.ws?.removeEventListener('error', onError);
					reject(new Error('WebSocket connection failed'));
				};

				this.ws?.addEventListener('open', onOpen);
				this.ws?.addEventListener('error', onError);
			});

		} catch (error) {
			this.lastError = error instanceof Error ? error.message : 'Connection failed';
			this.setState(WebSocketState.Failed);
			throw error;
		}
	}

	disconnect(): void {
		this.clearTimers();

		if (this.ws) {
			this.setState(WebSocketState.Disconnecting);
			this.ws.close(1000, 'Normal closure');
		} else {
			this.setState(WebSocketState.Disconnected);
		}
	}

	send(message: WebSocketMessage): boolean {
		if (!this.isConnected) {
			// Queue message if not connected
			if (this.messageQueue.length < (this.config.messageQueueSize || 100)) {
				message.id = message.id || this.generateMessageId();
				message.timestamp = Date.now();
				this.messageQueue.push(message);
				return false;
			} else {
				throw new Error('Message queue is full');
			}
		}

		try {
			const messageData = JSON.stringify(message);
			this.ws!.send(messageData);
			return true;
		} catch (error) {
			console.error('Failed to send WebSocket message:', error);
			return false;
		}
	}

	sendBinary(data: ArrayBuffer | Blob): boolean {
		if (!this.isConnected) {
			throw new Error('WebSocket is not connected');
		}

		try {
			this.ws!.send(data);
			return true;
		} catch (error) {
			console.error('Failed to send binary WebSocket message:', error);
			return false;
		}
	}

	// Ping/Pong for connection health check
	ping(): boolean {
		return this.send({
			type: 'ping',
			data: { timestamp: Date.now() }
		});
	}

	private setupEventHandlers(): void {
		if (!this.ws) return;

		this.ws.onopen = (event) => {
			this.connectedAt = Date.now();
			this.reconnectAttempts = 0;
			this.lastError = undefined;
			this.setState(WebSocketState.Connected);
			this.startHeartbeat();
			this.flushMessageQueue();
		};

		this.ws.onclose = (event) => {
			this.clearTimers();
			this.connectedAt = undefined;

			if (event.code === 1000) {
				// Normal closure
				this.setState(WebSocketState.Disconnected);
			} else {
				// Abnormal closure
				this.lastError = `Connection closed with code ${event.code}: ${event.reason}`;

				if (this.config.reconnect !== false) {
					this.scheduleReconnect();
				} else {
					this.setState(WebSocketState.Failed);
				}
			}
		};

		this.ws.onerror = (event) => {
			this.lastError = 'WebSocket error occurred';
			this.onError.emit(event);
		};

		this.ws.onmessage = (event) => {
			try {
				let message: WebSocketMessage;

				if (typeof event.data === 'string') {
					message = JSON.parse(event.data);
				} else {
					// Handle binary messages
					message = {
						type: 'binary',
						data: event.data
					};
				}

				// Handle built-in message types
				if (message.type === 'ping') {
					this.send({ type: 'pong', data: message.data });
					return;
				}

				if (message.type === 'pong') {
					// Connection is healthy
					return;
				}

				this.onMessage.emit(message);
			} catch (error) {
				console.error('Failed to parse WebSocket message:', error);
			}
		};
	}

	private setState(newState: WebSocketState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.onStateChange.emit(newState);
			this.onConnectionInfo.emit(this.connectionInfo);
		}
	}

	private scheduleReconnect(): void {
		const maxAttempts = this.config.maxReconnectAttempts || 5;

		if (this.reconnectAttempts >= maxAttempts) {
			this.setState(WebSocketState.Failed);
			return;
		}

		this.setState(WebSocketState.Reconnecting);
		this.reconnectAttempts++;

		const interval = this.config.reconnectInterval || 5000;
		const backoffDelay = Math.min(interval * Math.pow(2, this.reconnectAttempts - 1), 30000);

		this.reconnectTimer = window.setTimeout(() => {
			this.connect().catch(error => {
				console.error('Reconnection failed:', error);
				this.scheduleReconnect();
			});
		}, backoffDelay);
	}

	private startHeartbeat(): void {
		const interval = this.config.heartbeatInterval || 30000;

		this.heartbeatTimer = window.setInterval(() => {
			if (this.isConnected) {
				this.ping();
			}
		}, interval);
	}

	private flushMessageQueue(): void {
		while (this.messageQueue.length > 0 && this.isConnected) {
			const message = this.messageQueue.shift()!;
			this.send(message);
		}
	}

	private clearTimers(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = undefined;
		}

		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = undefined;
		}
	}

	private generateMessageId(): string {
		return `msg_${++this.messageId}_${Date.now()}`;
	}

	dispose(): void {
		this.clearTimers();
		this.disconnect();
		this.messageQueue = [];
	}
}

// WebSocket Manager for handling multiple connections
export class WebSocketManager {
	private connections = new Map<string, WebSocketService>();

	createConnection(id: string, config: WebSocketConfig): WebSocketService {
		if (this.connections.has(id)) {
			throw new Error(`WebSocket connection with id '${id}' already exists`);
		}

		const service = new WebSocketService(config);
		this.connections.set(id, service);
		return service;
	}

	getConnection(id: string): WebSocketService | undefined {
		return this.connections.get(id);
	}

	removeConnection(id: string): boolean {
		const service = this.connections.get(id);
		if (service) {
			service.dispose();
			this.connections.delete(id);
			return true;
		}
		return false;
	}

	getAllConnections(): Map<string, WebSocketService> {
		return new Map(this.connections);
	}

	dispose(): void {
		for (const service of this.connections.values()) {
			service.dispose();
		}
		this.connections.clear();
	}
}

// Specialized WebSocket for AI streaming
export class AIStreamingWebSocket extends WebSocketService {
	private readonly onStreamStart = new EventEmitter<{ requestId: string }>();
	private readonly onStreamChunk = new EventEmitter<{ requestId: string; chunk: string }>();
	private readonly onStreamEnd = new EventEmitter<{ requestId: string }>();
	private readonly onStreamError = new EventEmitter<{ requestId: string; error: string }>();

	get onStreamStarted() { return this.onStreamStart; }
	get onStreamChunkReceived() { return this.onStreamChunk; }
	get onStreamEnded() { return this.onStreamEnd; }
	get onStreamErrorOccurred() { return this.onStreamError; }

	constructor(config: WebSocketConfig) {
		super(config);

		// Handle AI-specific messages
		this.onMessageReceived.on((message) => {
			switch (message.type) {
				case 'stream_start':
					this.onStreamStart.emit({ requestId: message.data.requestId });
					break;
				case 'stream_chunk':
					this.onStreamChunk.emit({
						requestId: message.data.requestId,
						chunk: message.data.chunk
					});
					break;
				case 'stream_end':
					this.onStreamEnd.emit({ requestId: message.data.requestId });
					break;
				case 'stream_error':
					this.onStreamError.emit({
						requestId: message.data.requestId,
						error: message.data.error
					});
					break;
			}
		});
	}

	sendAIRequest(prompt: string, options: any = {}): string {
		const requestId = this.generateAIMessageId();

		this.send({
			type: 'ai_request',
			data: {
				requestId,
				prompt,
				options
			}
		});

		return requestId;
	}

	private generateAIMessageId(): string {
		return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
