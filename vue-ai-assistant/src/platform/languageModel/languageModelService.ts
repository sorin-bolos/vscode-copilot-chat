import { Disposable } from '../common/disposable';
import { EventEmitter } from '../common/event';
import { HttpClientService } from '../http/httpClientService';
import type {
	ILanguageModelRequest,
	ILanguageModelResponse,
	ILanguageModelService,
	ILanguageModelStreamResponse,
	LanguageModelChatMessage,
	LanguageModelConfig,
	LanguageModelTool,
	ModelCapabilities
} from './types';

export class LanguageModelService extends Disposable implements ILanguageModelService {
	private readonly _onModelChanged = this._register(new EventEmitter<string>());
	readonly onModelChanged = this._onModelChanged.event;

	private readonly _onStreamingResponse = this._register(new EventEmitter<ILanguageModelStreamResponse>());
	readonly onStreamingResponse = this._onStreamingResponse.event;

	private _currentModel: string = 'gpt-4';
	private _availableModels: string[] = [];
	private _modelConfigs = new Map<string, LanguageModelConfig>();
	private _requestCount = 0;
	private _tokenUsage = { input: 0, output: 0 };

	constructor(
		private readonly httpClient: HttpClientService,
		private readonly apiEndpoint: string = '/api/chat'
	) {
		super();
		this.initializeModels();
	}

	private async initializeModels(): Promise<void> {
		try {
			const response = await this.httpClient.get<{ models: LanguageModelConfig[] }>('/api/models');
			this._availableModels = response.models.map(m => m.id);
			response.models.forEach(model => {
				this._modelConfigs.set(model.id, model);
			});
		} catch (error) {
			console.warn('Failed to fetch available models, using defaults:', error);
			this._availableModels = ['gpt-4', 'gpt-3.5-turbo', 'claude-3-sonnet'];
			this.setDefaultConfigs();
		}
	}

	private setDefaultConfigs(): void {
		const defaultConfigs: LanguageModelConfig[] = [
			{
				id: 'gpt-4',
				name: 'GPT-4',
				vendor: 'OpenAI',
				maxTokens: 8192,
				contextWindow: 128000,
				supportsStreaming: true,
				supportsTools: true,
				capabilities: ['chat', 'code', 'analysis']
			},
			{
				id: 'gpt-3.5-turbo',
				name: 'GPT-3.5 Turbo',
				vendor: 'OpenAI',
				maxTokens: 4096,
				contextWindow: 16385,
				supportsStreaming: true,
				supportsTools: true,
				capabilities: ['chat', 'code']
			},
			{
				id: 'claude-3-sonnet',
				name: 'Claude 3 Sonnet',
				vendor: 'Anthropic',
				maxTokens: 4096,
				contextWindow: 200000,
				supportsStreaming: true,
				supportsTools: true,
				capabilities: ['chat', 'code', 'analysis']
			}
		];

		defaultConfigs.forEach(config => {
			this._modelConfigs.set(config.id, config);
		});
	}

	get currentModel(): string {
		return this._currentModel;
	}

	get availableModels(): string[] {
		return [...this._availableModels];
	}

	get requestCount(): number {
		return this._requestCount;
	}

	get tokenUsage(): { input: number; output: number } {
		return { ...this._tokenUsage };
	}

	getModelConfig(modelId: string): LanguageModelConfig | undefined {
		return this._modelConfigs.get(modelId);
	}

	getModelCapabilities(modelId?: string): ModelCapabilities {
		const model = this._modelConfigs.get(modelId || this._currentModel);
		return {
			supportsStreaming: model?.supportsStreaming ?? false,
			supportsTools: model?.supportsTools ?? false,
			maxTokens: model?.maxTokens ?? 4096,
			contextWindow: model?.contextWindow ?? 16385,
			capabilities: model?.capabilities ?? ['chat']
		};
	}

	async setModel(modelId: string): Promise<void> {
		if (!this._availableModels.includes(modelId)) {
			throw new Error(`Model ${modelId} is not available`);
		}

		const previousModel = this._currentModel;
		this._currentModel = modelId;

		try {
			// Validate model with a simple request
			await this.validateModel(modelId);
			this._onModelChanged.fire(modelId);
		} catch (error) {
			// Revert on error
			this._currentModel = previousModel;
			throw new Error(`Failed to switch to model ${modelId}: ${error}`);
		}
	}

	private async validateModel(modelId: string): Promise<void> {
		const testRequest: ILanguageModelRequest = {
			model: modelId,
			messages: [{ role: 'user', content: 'test' }],
			maxTokens: 10,
			temperature: 0.1
		};

		await this.sendRequest(testRequest);
	}

	async sendRequest(request: ILanguageModelRequest): Promise<ILanguageModelResponse> {
		this._requestCount++;

		const requestPayload = {
			model: request.model || this._currentModel,
			messages: request.messages,
			maxTokens: request.maxTokens,
			temperature: request.temperature,
			topP: request.topP,
			stream: false,
			tools: request.tools,
			toolChoice: request.toolChoice
		};

		try {
			const response = await this.httpClient.post<{
				content: string;
				role: string;
				usage?: {
					inputTokens: number;
					outputTokens: number;
				};
				toolCalls?: any[];
				finishReason?: string;
			}>(this.apiEndpoint, requestPayload);

			// Update token usage
			if (response.usage) {
				this._tokenUsage.input += response.usage.inputTokens;
				this._tokenUsage.output += response.usage.outputTokens;
			}

			return {
				content: response.content,
				role: response.role as 'assistant',
				usage: response.usage,
				toolCalls: response.toolCalls,
				finishReason: response.finishReason || 'stop'
			};
		} catch (error) {
			console.error('Language model request failed:', error);
			throw new Error(`Failed to get response from ${requestPayload.model}: ${error}`);
		}
	}

	async sendStreamingRequest(request: ILanguageModelRequest): Promise<AsyncIterable<ILanguageModelStreamResponse>> {
		this._requestCount++;

		const modelConfig = this.getModelConfig(request.model || this._currentModel);
		if (!modelConfig?.supportsStreaming) {
			throw new Error(`Model ${request.model || this._currentModel} does not support streaming`);
		}

		const requestPayload = {
			model: request.model || this._currentModel,
			messages: request.messages,
			maxTokens: request.maxTokens,
			temperature: request.temperature,
			topP: request.topP,
			stream: true,
			tools: request.tools,
			toolChoice: request.toolChoice
		};

		try {
			const response = await fetch(this.httpClient.getFullUrl(this.apiEndpoint), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...this.httpClient.getAuthHeaders()
				},
				body: JSON.stringify(requestPayload)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return this.parseStreamingResponse(response);
		} catch (error) {
			console.error('Streaming request failed:', error);
			throw new Error(`Failed to start streaming from ${requestPayload.model}: ${error}`);
		}
	}

	private async *parseStreamingResponse(response: Response): AsyncIterable<ILanguageModelStreamResponse> {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body available for streaming');
		}

		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') {
							return;
						}

						try {
							const parsed = JSON.parse(data);
							const streamResponse: ILanguageModelStreamResponse = {
								content: parsed.content || '',
								delta: parsed.delta || '',
								isComplete: parsed.isComplete || false,
								usage: parsed.usage,
								toolCalls: parsed.toolCalls,
								finishReason: parsed.finishReason
							};

							// Update token usage if provided
							if (parsed.usage) {
								this._tokenUsage.input += parsed.usage.inputTokens || 0;
								this._tokenUsage.output += parsed.usage.outputTokens || 0;
							}

							// Emit event for listeners
							this._onStreamingResponse.fire(streamResponse);

							yield streamResponse;
						} catch (parseError) {
							console.warn('Failed to parse streaming chunk:', parseError);
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async sendToolsEnabledRequest(
		messages: LanguageModelChatMessage[],
		tools: LanguageModelTool[],
		options?: Partial<ILanguageModelRequest>
	): Promise<ILanguageModelResponse> {
		const modelConfig = this.getModelConfig(this._currentModel);
		if (!modelConfig?.supportsTools) {
			throw new Error(`Model ${this._currentModel} does not support tools`);
		}

		const request: ILanguageModelRequest = {
			messages,
			tools,
			toolChoice: 'auto',
			...options,
			model: options?.model || this._currentModel
		};

		return this.sendRequest(request);
	}

	getQuotaInfo(): { requestsRemaining?: number; tokensRemaining?: number; resetTime?: Date } {
		// This would typically come from your backend
		// For now, return empty object - implement based on your backend's quota system
		return {};
	}

	resetUsageStats(): void {
		this._requestCount = 0;
		this._tokenUsage = { input: 0, output: 0 };
	}

	dispose(): void {
		super.dispose();
	}
}
