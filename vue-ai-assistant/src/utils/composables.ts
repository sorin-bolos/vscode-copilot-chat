// Vue composable for AI assistant functionality (replaces VS Code extension context)

import type { Ref } from 'vue';
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import type {
	EditorAbstraction,
	PlatformAbstraction,
	TextDocumentChangeEvent
} from '../platform/platformAbstraction';
import type { IStorageService } from '../platform/storage';
import type { Disposable } from '../utils/events';

// Injection keys for platform services
export const PLATFORM_ABSTRACTION_KEY = Symbol('PlatformAbstraction');
export const STORAGE_SERVICE_KEY = Symbol('StorageService');

// Composable for editor integration
export function useEditor() {
	const platform = inject<PlatformAbstraction>(PLATFORM_ABSTRACTION_KEY);
	if (!platform) {
		throw new Error('Platform abstraction not provided');
	}

	const activeEditor = ref<EditorAbstraction | null>(null);
	const documentText = ref<string>('');
	const selection = ref<string>('');

	const disposables: Disposable[] = [];

	onMounted(() => {
		// Set initial active editor
		activeEditor.value = platform.getActiveEditor();
		updateEditorState();

		// Listen for active editor changes
		disposables.push(
			platform.onDidChangeActiveEditor.on((editor) => {
				activeEditor.value = editor;
				updateEditorState();
			})
		);

		// Listen for document changes
		if (activeEditor.value) {
			disposables.push(
				activeEditor.value.onDidChangeTextDocument.on((event: TextDocumentChangeEvent) => {
					updateEditorState();
				})
			);
		}
	});

	onBeforeUnmount(() => {
		disposables.forEach(d => d.dispose());
	});

	function updateEditorState() {
		if (activeEditor.value) {
			documentText.value = activeEditor.value.getText();
			const selectionRange = activeEditor.value.getSelection();
			selection.value = activeEditor.value.getText(selectionRange);
		} else {
			documentText.value = '';
			selection.value = '';
		}
	}

	async function replaceSelection(text: string) {
		if (activeEditor.value) {
			const selectionRange = activeEditor.value.getSelection();
			await activeEditor.value.replaceText(selectionRange, text);
		}
	}

	async function insertAtCursor(text: string) {
		if (activeEditor.value) {
			const position = activeEditor.value.getCursorPosition();
			await activeEditor.value.insertText(position, text);
		}
	}

	return {
		activeEditor: activeEditor as Ref<EditorAbstraction | null>,
		documentText,
		selection,
		replaceSelection,
		insertAtCursor
	};
}

// Composable for storage
export function useStorage() {
	const storage = inject<IStorageService>(STORAGE_SERVICE_KEY);
	if (!storage) {
		throw new Error('Storage service not provided');
	}

	async function getValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
		// For sync storage (localStorage), return immediately
		const value = storage!.get(key, defaultValue);
		return Promise.resolve(value);
	}

	async function setValue(key: string, value: any): Promise<void> {
		return storage!.set(key, value);
	}

	async function removeValue(key: string): Promise<void> {
		return storage!.remove(key);
	}

	return {
		getValue,
		setValue,
		removeValue
	};
}

// Composable for AI chat functionality
export function useAIChat() {
	const platform = inject<PlatformAbstraction>(PLATFORM_ABSTRACTION_KEY);
	if (!platform) {
		throw new Error('Platform abstraction not provided');
	}

	const isLoading = ref(false);
	const error = ref<string | null>(null);

	async function sendMessage(message: string): Promise<string> {
		isLoading.value = true;
		error.value = null;

		try {
			// This would integrate with your backend API
			// For now, return a placeholder response
			await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
			return `AI Response to: ${message}`;
		} catch (err) {
			error.value = err instanceof Error ? err.message : 'Unknown error';
			throw err;
		} finally {
			isLoading.value = false;
		}
	}

	async function applyCodeChange(code: string): Promise<void> {
		const editor = platform!.getActiveEditor();
		if (!editor) {
			throw new Error('No active editor');
		}

		const selection = editor.getSelection();
		await editor.replaceText(selection, code);

		platform!.showMessage('Code applied successfully', 'info');
	}

	return {
		isLoading,
		error,
		sendMessage,
		applyCodeChange
	};
}

// Composable for file operations
export function useFileOperations() {
	const platform = inject<PlatformAbstraction>(PLATFORM_ABSTRACTION_KEY);
	if (!platform) {
		throw new Error('Platform abstraction not provided');
	}

	async function readFile(path: string): Promise<string> {
		try {
			return await platform!.readFile(path);
		} catch (error) {
			platform!.showMessage(`Failed to read file: ${path}`, 'error');
			throw error;
		}
	}

	async function writeFile(path: string, content: string): Promise<void> {
		try {
			await platform!.writeFile(path, content);
			platform!.showMessage(`File saved: ${path}`, 'info');
		} catch (error) {
			platform!.showMessage(`Failed to save file: ${path}`, 'error');
			throw error;
		}
	}

	async function showFile(path: string): Promise<void> {
		try {
			await platform!.showDocument(path);
		} catch (error) {
			platform!.showMessage(`Failed to open file: ${path}`, 'error');
			throw error;
		}
	}

	return {
		readFile,
		writeFile,
		showFile
	};
}
