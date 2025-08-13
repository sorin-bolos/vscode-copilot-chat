// Browser abstraction layer for VS Code-specific functionality

import { EventEmitter } from '../utils/events';

// Platform abstraction interface
export interface PlatformAbstraction {
	// File system operations
	readFile(path: string): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;

	// Editor operations
	getActiveEditor(): EditorAbstraction | null;
	showDocument(uri: string): Promise<EditorAbstraction>;

	// UI operations
	showMessage(message: string, type?: 'info' | 'warning' | 'error'): void;
	showQuickPick<T>(items: T[], options?: QuickPickOptions): Promise<T | undefined>;

	// Storage operations
	getStorageValue(key: string): Promise<any>;
	setStorageValue(key: string, value: any): Promise<void>;

	// Events
	onDidChangeActiveEditor: EventEmitter<EditorAbstraction | null>;
	onDidChangeConfiguration: EventEmitter<any>;
}

export interface EditorAbstraction {
	// Document properties
	uri: string;
	languageId: string;
	getText(): string;
	getText(range?: Range): string;

	// Selection and cursor
	getSelection(): Range;
	setSelection(range: Range): void;
	getCursorPosition(): Position;
	setCursorPosition(position: Position): void;

	// Text manipulation
	replaceText(range: Range, text: string): Promise<void>;
	insertText(position: Position, text: string): Promise<void>;

	// Events
	onDidChangeTextDocument: EventEmitter<TextDocumentChangeEvent>;
	onDidChangeSelection: EventEmitter<SelectionChangeEvent>;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface Position {
	line: number;
	character: number;
}

export interface QuickPickOptions {
	placeHolder?: string;
	canPickMany?: boolean;
}

export interface TextDocumentChangeEvent {
	uri: string;
	changes: TextChange[];
}

export interface TextChange {
	range: Range;
	text: string;
}

export interface SelectionChangeEvent {
	selections: Range[];
}

// Browser implementation that will be injected by the host IDE
export class BrowserPlatformAbstraction implements PlatformAbstraction {
	public onDidChangeActiveEditor = new EventEmitter<EditorAbstraction | null>();
	public onDidChangeConfiguration = new EventEmitter<any>();

	constructor(private hostInterface: any) {
		// hostInterface will be provided by the Vue.js IDE integration
	}

	async readFile(path: string): Promise<string> {
		return this.hostInterface.readFile(path);
	}

	async writeFile(path: string, content: string): Promise<void> {
		return this.hostInterface.writeFile(path, content);
	}

	getActiveEditor(): EditorAbstraction | null {
		const editor = this.hostInterface.getActiveEditor();
		return editor ? new BrowserEditorAbstraction(editor) : null;
	}

	async showDocument(uri: string): Promise<EditorAbstraction> {
		const editor = await this.hostInterface.showDocument(uri);
		return new BrowserEditorAbstraction(editor);
	}

	showMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
		this.hostInterface.showMessage(message, type);
	}

	async showQuickPick<T>(items: T[], options?: QuickPickOptions): Promise<T | undefined> {
		return this.hostInterface.showQuickPick(items, options);
	}

	async getStorageValue(key: string): Promise<any> {
		return this.hostInterface.getStorageValue(key);
	}

	async setStorageValue(key: string, value: any): Promise<void> {
		return this.hostInterface.setStorageValue(key, value);
	}
}

class BrowserEditorAbstraction implements EditorAbstraction {
	public onDidChangeTextDocument = new EventEmitter<TextDocumentChangeEvent>();
	public onDidChangeSelection = new EventEmitter<SelectionChangeEvent>();

	constructor(private hostEditor: any) {
		// Set up event forwarding from host editor
		this.hostEditor.onDidChangeContent?.((event: any) => {
			this.onDidChangeTextDocument.emit(event);
		});

		this.hostEditor.onDidChangeSelection?.((event: any) => {
			this.onDidChangeSelection.emit(event);
		});
	}

	get uri(): string {
		return this.hostEditor.uri;
	}

	get languageId(): string {
		return this.hostEditor.languageId;
	}

	getText(range?: Range): string {
		return this.hostEditor.getText(range);
	}

	getSelection(): Range {
		return this.hostEditor.getSelection();
	}

	setSelection(range: Range): void {
		this.hostEditor.setSelection(range);
	}

	getCursorPosition(): Position {
		return this.hostEditor.getCursorPosition();
	}

	setCursorPosition(position: Position): void {
		this.hostEditor.setCursorPosition(position);
	}

	async replaceText(range: Range, text: string): Promise<void> {
		return this.hostEditor.replaceText(range, text);
	}

	async insertText(position: Position, text: string): Promise<void> {
		return this.hostEditor.insertText(position, text);
	}
}
