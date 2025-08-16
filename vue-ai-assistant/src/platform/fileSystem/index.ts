// File System Abstraction Layer
// Provides browser-compatible file system operations and Monaco editor integration

export * from './memoryFileSystemProvider';
export * from './monacoEditorService';
export * from './virtualFileSystem';

import { MemoryFileSystemProvider } from './memoryFileSystemProvider';
import { BrowserMonacoEditorService } from './monacoEditorService';
import { VirtualFileSystem, createVirtualFileSystem } from './virtualFileSystem';

/**
 * File System factory for creating common configurations
 */
export class FileSystemFactory {
	/**
	 * Create a file system with memory provider (for testing/development)
	 */
	static createMemoryFileSystem(): VirtualFileSystem {
		const vfs = createVirtualFileSystem();
		const memoryProvider = new MemoryFileSystemProvider();

		// Register memory provider for 'memory' and 'file' schemes
		vfs.registerProvider('memory', memoryProvider);
		vfs.registerProvider('file', memoryProvider);

		return vfs;
	}

	/**
	 * Create Monaco editor service
	 */
	static createMonacoEditorService(monacoApi?: any): BrowserMonacoEditorService {
		return new BrowserMonacoEditorService(monacoApi);
	}

	/**
	 * Create a complete file system setup with VFS and Monaco integration
	 */
	static createCompleteFileSystem(monacoApi?: any): {
		fileSystem: VirtualFileSystem;
		editorService: BrowserMonacoEditorService;
	} {
		const fileSystem = FileSystemFactory.createMemoryFileSystem();
		const editorService = FileSystemFactory.createMonacoEditorService(monacoApi);

		return {
			fileSystem,
			editorService
		};
	}
}

/**
 * Utility functions for common file operations
 */
export class FileSystemUtils {
	/**
	 * Create a sample project structure in memory
	 */
	static async createSampleProject(vfs: VirtualFileSystem): Promise<void> {
		// Create project structure
		await vfs.createDirectory('memory:/src', { recursive: true });
		await vfs.createDirectory('memory:/src/components', { recursive: true });
		await vfs.createDirectory('memory:/src/services', { recursive: true });
		await vfs.createDirectory('memory:/src/utils', { recursive: true });
		await vfs.createDirectory('memory:/tests', { recursive: true });

		// Create sample files
		await vfs.createFile('memory:/package.json', JSON.stringify({
			"name": "sample-project",
			"version": "1.0.0",
			"description": "A sample project for testing",
			"main": "src/index.ts",
			"scripts": {
				"build": "tsc",
				"test": "jest"
			},
			"dependencies": {
				"typescript": "^5.0.0"
			}
		}, null, 2));

		await vfs.createFile('memory:/src/index.ts', `// Main application entry point
import { createApp } from './app';
import { ApiService } from './services/apiService';

const apiService = new ApiService();
const app = createApp(apiService);

app.start();
`);

		await vfs.createFile('memory:/src/app.ts', `// Application setup
import { ApiService } from './services/apiService';

export interface App {
	start(): void;
	stop(): void;
}

export function createApp(apiService: ApiService): App {
	return {
		start() {
			console.log('Application started');
		},

		stop() {
			console.log('Application stopped');
		}
	};
}
`);

		await vfs.createFile('memory:/src/components/Button.vue', `<template>
	<button
		:class="buttonClass"
		@click="handleClick"
		:disabled="disabled"
	>
		<slot />
	</button>
</template>

<script setup lang="ts">
interface Props {
	variant?: 'primary' | 'secondary' | 'danger';
	disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	variant: 'primary',
	disabled: false
});

const emit = defineEmits<{
	click: [event: MouseEvent];
}>();

const buttonClass = computed(() => [
	'btn',
	\`btn-\${props.variant}\`,
	{
		'btn-disabled': props.disabled
	}
]);

const handleClick = (event: MouseEvent) => {
	if (!props.disabled) {
		emit('click', event);
	}
};
</script>

<style scoped>
.btn {
	padding: 8px 16px;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	transition: all 0.2s;
}

.btn-primary {
	background: #007acc;
	color: white;
}

.btn-secondary {
	background: #6c757d;
	color: white;
}

.btn-danger {
	background: #dc3545;
	color: white;
}

.btn:hover:not(.btn-disabled) {
	opacity: 0.9;
}

.btn-disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
`);

		await vfs.createFile('memory:/src/services/apiService.ts', `// API service for external communication
export interface ApiResponse<T = any> {
	data: T;
	status: number;
	message?: string;
}

export class ApiService {
	private baseUrl: string;

	constructor(baseUrl: string = 'https://api.example.com') {
		this.baseUrl = baseUrl;
	}

	async get<T>(endpoint: string): Promise<ApiResponse<T>> {
		const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
		const data = await response.json();

		return {
			data,
			status: response.status,
			message: response.statusText
		};
	}

	async post<T>(endpoint: string, body: any): Promise<ApiResponse<T>> {
		const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		const data = await response.json();

		return {
			data,
			status: response.status,
			message: response.statusText
		};
	}
}
`);

		await vfs.createFile('memory:/src/utils/helpers.ts', `// Utility helper functions
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let lastFunc: NodeJS.Timeout;
	let lastRan: number;

	return (...args: Parameters<T>) => {
		if (!lastRan) {
			func.apply(this, args);
			lastRan = Date.now();
		} else {
			clearTimeout(lastFunc);
			lastFunc = setTimeout(() => {
				if ((Date.now() - lastRan) >= limit) {
					func.apply(this, args);
					lastRan = Date.now();
				}
			}, limit - (Date.now() - lastRan));
		}
	};
}

export function formatFileSize(bytes: number): string {
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	if (bytes === 0) return '0 Bytes';

	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
`);

		await vfs.createFile('memory:/tests/apiService.test.ts', `// Tests for API service
import { ApiService } from '../src/services/apiService';

describe('ApiService', () => {
	let apiService: ApiService;

	beforeEach(() => {
		apiService = new ApiService('https://test-api.example.com');
	});

	test('should create instance with default base URL', () => {
		const defaultService = new ApiService();
		expect(defaultService).toBeInstanceOf(ApiService);
	});

	test('should make GET request', async () => {
		// Mock fetch for testing
		global.fetch = jest.fn().mockResolvedValue({
			json: () => Promise.resolve({ message: 'success' }),
			status: 200,
			statusText: 'OK'
		});

		const response = await apiService.get('/test');

		expect(response.status).toBe(200);
		expect(response.data.message).toBe('success');
	});

	test('should make POST request', async () => {
		// Mock fetch for testing
		global.fetch = jest.fn().mockResolvedValue({
			json: () => Promise.resolve({ id: 1, created: true }),
			status: 201,
			statusText: 'Created'
		});

		const response = await apiService.post('/create', { name: 'test' });

		expect(response.status).toBe(201);
		expect(response.data.created).toBe(true);
	});
});
`);

		await vfs.createFile('memory:/README.md', `# Sample Project

This is a sample project created by the File System Abstraction Layer.

## Structure

- \`src/\` - Source code
  - \`components/\` - Vue components
  - \`services/\` - Business logic services
  - \`utils/\` - Utility functions
- \`tests/\` - Test files

## Features

- TypeScript support
- Vue.js components
- API service layer
- Utility helpers
- Test suite

## Getting Started

\`\`\`bash
npm install
npm run build
npm test
\`\`\`

This project demonstrates the capabilities of the Virtual File System and Monaco Editor integration.
`);
	}

	/**
	 * Get file extension from URI
	 */
	static getFileExtension(uri: string): string {
		const lastSlash = Math.max(uri.lastIndexOf('/'), uri.lastIndexOf('\\'));
		const fileName = lastSlash >= 0 ? uri.substring(lastSlash + 1) : uri;
		const lastDot = fileName.lastIndexOf('.');

		// Handle files that start with dot (like .gitignore)
		if (lastDot === 0 && fileName.length > 1) {
			return fileName.substring(1).toLowerCase();
		}

		return lastDot > 0 ? fileName.substring(lastDot + 1).toLowerCase() : '';
	}

	/**
	 * Check if file is a text file based on extension
	 */
	static isTextFile(uri: string): boolean {
		const textExtensions = new Set([
			'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml',
			'js', 'ts', 'jsx', 'tsx', 'vue', 'html', 'css', 'scss', 'sass', 'less',
			'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'php', 'rb', 'swift',
			'kt', 'scala', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'dockerfile',
			'gitignore', 'gitattributes', 'editorconfig', 'prettierrc', 'eslintrc'
		]);

		const extension = FileSystemUtils.getFileExtension(uri);
		return textExtensions.has(extension);
	}

	/**
	 * Get MIME type for file
	 */
	static getMimeType(uri: string): string {
		const extension = FileSystemUtils.getFileExtension(uri);

		const mimeTypes: Record<string, string> = {
			'js': 'application/javascript',
			'ts': 'application/typescript',
			'json': 'application/json',
			'html': 'text/html',
			'css': 'text/css',
			'md': 'text/markdown',
			'txt': 'text/plain',
			'xml': 'application/xml',
			'yaml': 'application/yaml',
			'yml': 'application/yaml',
			'png': 'image/png',
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'gif': 'image/gif',
			'svg': 'image/svg+xml',
			'pdf': 'application/pdf',
			'zip': 'application/zip'
		};

		return mimeTypes[extension] || 'application/octet-stream';
	}
}
