// Language Model Types and Interfaces

export interface ILanguageModelService {
	readonly currentModel: string;
	readonly availableModels: string[];
	readonly requestCount: number;
	readonly tokenUsage: { input: number; output: number };

	readonly onModelChanged: (listener: (modelId: string) => void) => () => void;
	readonly onStreamingResponse: (listener: (response: ILanguageModelStreamResponse) => void) => () => void;

	getModelConfig(modelId: string): LanguageModelConfig | undefined;
	getModelCapabilities(modelId?: string): ModelCapabilities;
	setModel(modelId: string): Promise<void>;
	sendRequest(request: ILanguageModelRequest): Promise<ILanguageModelResponse>;
	sendStreamingRequest(request: ILanguageModelRequest): Promise<AsyncIterable<ILanguageModelStreamResponse>>;
	sendToolsEnabledRequest(
		messages: LanguageModelChatMessage[],
		tools: LanguageModelTool[],
		options?: Partial<ILanguageModelRequest>
	): Promise<ILanguageModelResponse>;
	getQuotaInfo(): { requestsRemaining?: number; tokensRemaining?: number; resetTime?: Date };
	resetUsageStats(): void;
}

export interface ILanguageModelRequest {
	model?: string;
	messages: LanguageModelChatMessage[];
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	tools?: LanguageModelTool[];
	toolChoice?: 'auto' | 'none' | string;
	stream?: boolean;
}

export interface ILanguageModelResponse {
	content: string;
	role: 'assistant';
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
	toolCalls?: LanguageModelToolCall[];
	finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface ILanguageModelStreamResponse {
	content: string;
	delta: string;
	isComplete: boolean;
	usage?: {
		inputTokens: number;
		outputTokens: number;
	};
	toolCalls?: LanguageModelToolCall[];
	finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface LanguageModelChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	name?: string;
	toolCallId?: string;
	toolCalls?: LanguageModelToolCall[];
}

export interface LanguageModelTool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: {
			type: 'object';
			properties: Record<string, any>;
			required?: string[];
		};
	};
}

export interface LanguageModelToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string; // JSON string
	};
}

export interface LanguageModelConfig {
	id: string;
	name: string;
	vendor: string;
	maxTokens: number;
	contextWindow: number;
	supportsStreaming: boolean;
	supportsTools: boolean;
	capabilities: string[];
	costPer1kTokens?: {
		input: number;
		output: number;
	};
}

export interface ModelCapabilities {
	supportsStreaming: boolean;
	supportsTools: boolean;
	maxTokens: number;
	contextWindow: number;
	capabilities: string[];
}

// Error types
export class LanguageModelError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly details?: any
	) {
		super(message);
		this.name = 'LanguageModelError';
	}
}

export class QuotaExceededError extends LanguageModelError {
	constructor(details?: any) {
		super('Request quota exceeded', 'QUOTA_EXCEEDED', details);
	}
}

export class ModelNotAvailableError extends LanguageModelError {
	constructor(modelId: string) {
		super(`Model ${modelId} is not available`, 'MODEL_NOT_AVAILABLE', { modelId });
	}
}

export class InvalidRequestError extends LanguageModelError {
	constructor(message: string, details?: any) {
		super(message, 'INVALID_REQUEST', details);
	}
}

// Request builder utility
export class LanguageModelRequestBuilder {
	private request: Partial<ILanguageModelRequest> = {
		messages: []
	};

	static create(): LanguageModelRequestBuilder {
		return new LanguageModelRequestBuilder();
	}

	model(modelId: string): this {
		this.request.model = modelId;
		return this;
	}

	addMessage(role: 'user' | 'assistant' | 'system', content: string): this {
		this.request.messages!.push({ role, content });
		return this;
	}

	addUserMessage(content: string): this {
		return this.addMessage('user', content);
	}

	addAssistantMessage(content: string): this {
		return this.addMessage('assistant', content);
	}

	addSystemMessage(content: string): this {
		return this.addMessage('system', content);
	}

	maxTokens(tokens: number): this {
		this.request.maxTokens = tokens;
		return this;
	}

	temperature(temp: number): this {
		this.request.temperature = temp;
		return this;
	}

	topP(p: number): this {
		this.request.topP = p;
		return this;
	}

	tools(tools: LanguageModelTool[]): this {
		this.request.tools = tools;
		return this;
	}

	toolChoice(choice: 'auto' | 'none' | string): this {
		this.request.toolChoice = choice;
		return this;
	}

	stream(enabled: boolean = true): this {
		this.request.stream = enabled;
		return this;
	}

	build(): ILanguageModelRequest {
		if (!this.request.messages?.length) {
			throw new InvalidRequestError('At least one message is required');
		}
		return this.request as ILanguageModelRequest;
	}
}

// Conversation context types
export interface ConversationContext {
	messages: LanguageModelChatMessage[];
	toolCalls: LanguageModelToolCall[];
	metadata: {
		conversationId: string;
		userId?: string;
		sessionId?: string;
		timestamp: number;
	};
}

export interface ConversationManager {
	getContext(conversationId: string): ConversationContext | undefined;
	updateContext(conversationId: string, context: ConversationContext): void;
	addMessage(conversationId: string, message: LanguageModelChatMessage): void;
	addToolCall(conversationId: string, toolCall: LanguageModelToolCall): void;
	clearContext(conversationId: string): void;
	getActiveConversations(): string[];
}
