// Core type definitions for the Vue Copilot Assistant

// Chat related types
export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	metadata?: Record<string, any>;
}

export interface ChatConversation {
	id: string;
	title: string;
	messages: ChatMessage[];
	createdAt: Date;
	updatedAt: Date;
}

// Tool related types
export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, any>;
	handler: ToolHandler;
}

export type ToolHandler = (params: Record<string, any>) => Promise<ToolResult>;

export interface ToolResult {
	success: boolean;
	data?: any;
	error?: string;
	metadata?: Record<string, any>;
}

// Code diff types
export interface CodeDiff {
	id: string;
	filePath: string;
	originalContent: string;
	modifiedContent: string;
	language?: string;
	description?: string;
}

export interface DiffHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: DiffLine[];
}

export interface DiffLine {
	type: 'add' | 'remove' | 'context';
	content: string;
	oldLineNumber?: number;
	newLineNumber?: number;
}

// Language model types
export interface LanguageModelConfig {
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	temperature?: number;
	maxTokens?: number;
}

// MCP types
export interface MCPServer {
	id: string;
	name: string;
	url: string;
	status: 'connected' | 'disconnected' | 'error';
	tools: string[];
}

// Platform service types
export interface PlatformConfig {
	fileSystem: FileSystemConfig;
	storage: StorageConfig;
	editor: EditorConfig;
}

export interface FileSystemConfig {
	readFile: (path: string) => Promise<string>;
	writeFile: (path: string, content: string) => Promise<void>;
	listFiles: (pattern?: string) => Promise<string[]>;
}

export interface StorageConfig {
	get: (key: string) => Promise<any>;
	set: (key: string, value: any) => Promise<void>;
	remove: (key: string) => Promise<void>;
}

export interface EditorConfig {
	getSelection: () => Promise<string>;
	replaceSelection: (content: string) => Promise<void>;
	insertText: (text: string, position?: number) => Promise<void>;
}