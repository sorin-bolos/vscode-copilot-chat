import { Disposable } from '../common/disposable';
import { EventEmitter } from '../common/event';
import type {
	CodeContext,
	CodeEditSuggestion,
	DiffViewOptions,
	EditorOptions,
	EditorPosition,
	EditorRange,
	EditorSelection,
	EditorState,
	IMonacoEditorService,
	InlineSuggestion,
	LanguageDetection,
	MonacoEditor,
	SuggestionAppliedEvent,
	SuggestionCreatedEvent,
	SuggestionProvider,
	SuggestionStatusChangedEvent,
	TextEdit
} from './types';

export class MonacoEditorService extends Disposable implements IMonacoEditorService {
	private readonly _onEditorCreated = this._register(new EventEmitter<MonacoEditor>());
	readonly onEditorCreated = this._onEditorCreated.event;

	private readonly _onEditorDestroyed = this._register(new EventEmitter<string>());
	readonly onEditorDestroyed = this._onEditorDestroyed.event;

	private readonly _onContentChanged = this._register(new EventEmitter<{ editorId: string; content: string }>());
	readonly onContentChanged = this._onContentChanged.event;

	private readonly _onSelectionChanged = this._register(new EventEmitter<{ editorId: string; selection: EditorSelection }>());
	readonly onSelectionChanged = this._onSelectionChanged.event;

	private readonly _onCursorPositionChanged = this._register(new EventEmitter<{ editorId: string; position: EditorPosition }>());
	readonly onCursorPositionChanged = this._onCursorPositionChanged.event;

	// Suggestion events
	private readonly _onSuggestionCreated = this._register(new EventEmitter<SuggestionCreatedEvent>());
	readonly onSuggestionCreated = this._onSuggestionCreated.event;

	private readonly _onSuggestionStatusChanged = this._register(new EventEmitter<SuggestionStatusChangedEvent>());
	readonly onSuggestionStatusChanged = this._onSuggestionStatusChanged.event;

	private readonly _onSuggestionApplied = this._register(new EventEmitter<SuggestionAppliedEvent>());
	readonly onSuggestionApplied = this._onSuggestionApplied.event;

	private _activeEditorId: string | undefined;
	private _editors = new Map<string, MonacoEditor>();
	private _editorStates = new Map<string, EditorState>();

	// Suggestion management
	private _suggestions = new Map<string, CodeEditSuggestion>();
	private _inlineSuggestions = new Map<string, InlineSuggestion>();
	private _suggestionProviders = new Map<string, SuggestionProvider>();
	private _diffEditors = new Map<string, MonacoEditor>();
	private _decorations = new Map<string, string[]>();
	private _suggestionCounter = 0;

	constructor() {
		super();
	}

	get activeEditorId(): string | undefined {
		return this._activeEditorId;
	}

	get activeEditor(): MonacoEditor | undefined {
		return this._activeEditorId ? this._editors.get(this._activeEditorId) : undefined;
	}

	get allEditors(): MonacoEditor[] {
		return Array.from(this._editors.values());
	}

	getEditor(editorId: string): MonacoEditor | undefined {
		return this._editors.get(editorId);
	}

	createEditor(container: HTMLElement, options: EditorOptions = {}): MonacoEditor {
		const editorId = this.generateEditorId();

		// Default options
		const defaultOptions = {
			theme: 'vs-dark',
			language: 'typescript',
			automaticLayout: true,
			minimap: { enabled: true },
			fontSize: 14,
			wordWrap: 'on' as const,
			lineNumbers: 'on' as const,
			renderWhitespace: 'selection' as const,
			scrollBeyondLastLine: false,
			smoothScrolling: true,
			cursorBlinking: 'smooth' as const,
			cursorSmoothCaretAnimation: 'on' as const,
			suggest: { showStatusBar: true },
			quickSuggestions: true,
			tabCompletion: 'on' as const,
			acceptSuggestionOnEnter: 'on' as const,
			acceptSuggestionOnCommitCharacter: true,
			...options
		};

		// Create Monaco editor instance
		// Note: This assumes Monaco Editor is already loaded globally
		if (typeof window === 'undefined' || !(window as any).monaco) {
			throw new Error('Monaco Editor is not available. Make sure it is loaded before creating an editor.');
		}

		const monaco = (window as any).monaco;
		const monacoEditor = monaco.editor.create(container, defaultOptions);

		const editor: MonacoEditor = {
			id: editorId,
			monacoInstance: monacoEditor,
			container,
			language: defaultOptions.language,
			theme: defaultOptions.theme,
			options: defaultOptions,
			created: Date.now()
		};

		// Set up event listeners
		this.setupEditorEventListeners(editor);

		// Store editor
		this._editors.set(editorId, editor);
		this._editorStates.set(editorId, {
			content: monacoEditor.getValue(),
			selection: this.getSelectionFromMonaco(monacoEditor.getSelection()),
			cursorPosition: this.getPositionFromMonaco(monacoEditor.getPosition()),
			language: defaultOptions.language,
			isDirty: false,
			lastModified: Date.now()
		});

		// Set as active if it's the first editor
		if (!this._activeEditorId) {
			this._activeEditorId = editorId;
		}

		this._onEditorCreated.fire(editor);
		return editor;
	}

	private setupEditorEventListeners(editor: MonacoEditor): void {
		const monacoEditor = editor.monacoInstance;

		// Content change listener
		monacoEditor.onDidChangeModelContent(() => {
			const content = monacoEditor.getValue();
			this.updateEditorState(editor.id, {
				content,
				isDirty: true,
				lastModified: Date.now()
			});
			this._onContentChanged.fire({ editorId: editor.id, content });
		});

		// Selection change listener
		monacoEditor.onDidChangeCursorSelection((e: any) => {
			const selection = this.getSelectionFromMonaco(e.selection);
			this.updateEditorState(editor.id, { selection });
			this._onSelectionChanged.fire({ editorId: editor.id, selection });
		});

		// Cursor position change listener
		monacoEditor.onDidChangeCursorPosition((e: any) => {
			const position = this.getPositionFromMonaco(e.position);
			this.updateEditorState(editor.id, { cursorPosition: position });
			this._onCursorPositionChanged.fire({ editorId: editor.id, position });
		});

		// Focus listener
		monacoEditor.onDidFocusEditorWidget(() => {
			this._activeEditorId = editor.id;
		});
	}

	destroyEditor(editorId: string): void {
		const editor = this._editors.get(editorId);
		if (!editor) {
			return;
		}

		// Dispose Monaco editor
		editor.monacoInstance.dispose();

		// Clean up
		this._editors.delete(editorId);
		this._editorStates.delete(editorId);

		// Update active editor
		if (this._activeEditorId === editorId) {
			const remainingEditors = Array.from(this._editors.keys());
			this._activeEditorId = remainingEditors.length > 0 ? remainingEditors[0] : undefined;
		}

		this._onEditorDestroyed.fire(editorId);
	}

	setActiveEditor(editorId: string): void {
		if (this._editors.has(editorId)) {
			this._activeEditorId = editorId;
			const editor = this._editors.get(editorId);
			if (editor) {
				editor.monacoInstance.focus();
			}
		}
	}

	getContent(editorId?: string): string {
		const editor = this.getTargetEditor(editorId);
		return editor ? editor.monacoInstance.getValue() : '';
	}

	setContent(content: string, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (editor) {
			editor.monacoInstance.setValue(content);
			this.updateEditorState(editor.id, {
				content,
				isDirty: false,
				lastModified: Date.now()
			});
		}
	}

	getSelection(editorId?: string): EditorSelection | undefined {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return undefined;

		const monacoSelection = editor.monacoInstance.getSelection();
		return monacoSelection ? this.getSelectionFromMonaco(monacoSelection) : undefined;
	}

	setSelection(selection: EditorSelection, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (editor) {
			const monacoRange = new (window as any).monaco.Range(
				selection.startLineNumber,
				selection.startColumn,
				selection.endLineNumber,
				selection.endColumn
			);
			editor.monacoInstance.setSelection(monacoRange);
			this.updateEditorState(editor.id, { selection });
		}
	}

	getCursorPosition(editorId?: string): EditorPosition | undefined {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return undefined;

		const monacoPosition = editor.monacoInstance.getPosition();
		return monacoPosition ? this.getPositionFromMonaco(monacoPosition) : undefined;
	}

	setCursorPosition(position: EditorPosition, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (editor) {
			const monacoPosition = new (window as any).monaco.Position(
				position.lineNumber,
				position.column
			);
			editor.monacoInstance.setPosition(monacoPosition);
			this.updateEditorState(editor.id, { cursorPosition: position });
		}
	}

	getSelectedText(editorId?: string): string {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return '';

		const selection = editor.monacoInstance.getSelection();
		if (!selection || selection.isEmpty()) {
			return '';
		}

		return editor.monacoInstance.getModel()?.getValueInRange(selection) || '';
	}

	replaceSelection(text: string, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return;

		const selection = editor.monacoInstance.getSelection();
		if (selection) {
			editor.monacoInstance.executeEdits('ai-assistant', [{
				range: selection,
				text: text
			}]);
		}
	}

	insertText(text: string, position?: EditorPosition, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return;

		const insertPosition = position || editor.monacoInstance.getPosition();
		if (insertPosition) {
			const monacoPosition = new (window as any).monaco.Position(
				insertPosition.lineNumber,
				insertPosition.column
			);
			editor.monacoInstance.executeEdits('ai-assistant', [{
				range: new (window as any).monaco.Range(
					monacoPosition.lineNumber,
					monacoPosition.column,
					monacoPosition.lineNumber,
					monacoPosition.column
				),
				text: text
			}]);
		}
	}

	applyTextEdits(edits: TextEdit[], editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (!editor || edits.length === 0) return;

		const monacoEdits = edits.map(edit => ({
			range: new (window as any).monaco.Range(
				edit.range.startLineNumber,
				edit.range.startColumn,
				edit.range.endLineNumber,
				edit.range.endColumn
			),
			text: edit.text
		}));

		editor.monacoInstance.executeEdits('ai-assistant', monacoEdits);
	}

	formatDocument(editorId?: string): Promise<void> {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return Promise.resolve();

		return editor.monacoInstance.getAction('editor.action.formatDocument')?.run() || Promise.resolve();
	}

	getLanguage(editorId?: string): string {
		const editor = this.getTargetEditor(editorId);
		return editor ? editor.language : 'plaintext';
	}

	setLanguage(language: string, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (editor) {
			const monaco = (window as any).monaco;
			const model = editor.monacoInstance.getModel();
			if (model) {
				monaco.editor.setModelLanguage(model, language);
				editor.language = language;
				this.updateEditorState(editor.id, { language });
			}
		}
	}

	detectLanguage(filename: string): LanguageDetection {
		const ext = filename.split('.').pop()?.toLowerCase() || '';

		const languageMap: Record<string, LanguageDetection> = {
			'js': { language: 'javascript', confidence: 1.0 },
			'jsx': { language: 'javascript', confidence: 1.0 },
			'ts': { language: 'typescript', confidence: 1.0 },
			'tsx': { language: 'typescript', confidence: 1.0 },
			'vue': { language: 'vue', confidence: 1.0 },
			'html': { language: 'html', confidence: 1.0 },
			'css': { language: 'css', confidence: 1.0 },
			'scss': { language: 'scss', confidence: 1.0 },
			'sass': { language: 'sass', confidence: 1.0 },
			'less': { language: 'less', confidence: 1.0 },
			'json': { language: 'json', confidence: 1.0 },
			'md': { language: 'markdown', confidence: 1.0 },
			'py': { language: 'python', confidence: 1.0 },
			'java': { language: 'java', confidence: 1.0 },
			'c': { language: 'c', confidence: 1.0 },
			'cpp': { language: 'cpp', confidence: 1.0 },
			'cs': { language: 'csharp', confidence: 1.0 },
			'php': { language: 'php', confidence: 1.0 },
			'rb': { language: 'ruby', confidence: 1.0 },
			'go': { language: 'go', confidence: 1.0 },
			'rs': { language: 'rust', confidence: 1.0 },
			'swift': { language: 'swift', confidence: 1.0 },
			'kt': { language: 'kotlin', confidence: 1.0 },
			'scala': { language: 'scala', confidence: 1.0 }
		};

		return languageMap[ext] || { language: 'plaintext', confidence: 0.0 };
	}

	getEditorState(editorId?: string): EditorState | undefined {
		const targetEditorId = editorId || this._activeEditorId;
		return targetEditorId ? this._editorStates.get(targetEditorId) : undefined;
	}

	saveEditorState(editorId?: string): EditorState | undefined {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return undefined;

		const state: EditorState = {
			content: editor.monacoInstance.getValue(),
			selection: this.getSelectionFromMonaco(editor.monacoInstance.getSelection()),
			cursorPosition: this.getPositionFromMonaco(editor.monacoInstance.getPosition()),
			language: editor.language,
			isDirty: this._editorStates.get(editor.id)?.isDirty || false,
			lastModified: Date.now()
		};

		this._editorStates.set(editor.id, state);
		return state;
	}

	restoreEditorState(state: EditorState, editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (!editor) return;

		editor.monacoInstance.setValue(state.content);
		this.setLanguage(state.language, editor.id);

		if (state.selection) {
			this.setSelection(state.selection, editor.id);
		}

		if (state.cursorPosition) {
			this.setCursorPosition(state.cursorPosition, editor.id);
		}

		this._editorStates.set(editor.id, { ...state });
	}

	focus(editorId?: string): void {
		const editor = this.getTargetEditor(editorId);
		if (editor) {
			editor.monacoInstance.focus();
			this._activeEditorId = editor.id;
		}
	}

	// Utility methods
	private getTargetEditor(editorId?: string): MonacoEditor | undefined {
		const targetId = editorId || this._activeEditorId;
		return targetId ? this._editors.get(targetId) : undefined;
	}

	private updateEditorState(editorId: string, updates: Partial<EditorState>): void {
		const currentState = this._editorStates.get(editorId);
		if (currentState) {
			this._editorStates.set(editorId, { ...currentState, ...updates });
		}
	}

	private getSelectionFromMonaco(monacoSelection: any): EditorSelection {
		return {
			startLineNumber: monacoSelection.startLineNumber,
			startColumn: monacoSelection.startColumn,
			endLineNumber: monacoSelection.endLineNumber,
			endColumn: monacoSelection.endColumn,
			isEmpty: monacoSelection.isEmpty()
		};
	}

	private getPositionFromMonaco(monacoPosition: any): EditorPosition {
		return {
			lineNumber: monacoPosition.lineNumber,
			column: monacoPosition.column
		};
	}

	private generateEditorId(): string {
		return `editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	// =================
	// Suggestion Management
	// =================

	createSuggestion(suggestion: Omit<CodeEditSuggestion, 'id' | 'status' | 'timestamp'>, editorId?: string): string {
		const id = `suggestion-${++this._suggestionCounter}-${Date.now()}`;
		const fullSuggestion: CodeEditSuggestion = {
			...suggestion,
			id,
			status: 'pending',
			timestamp: Date.now()
		};

		this._suggestions.set(id, fullSuggestion);

		const targetEditorId = editorId || this._activeEditorId;
		if (targetEditorId) {
			this._onSuggestionCreated.fire({
				suggestion: fullSuggestion,
				editorId: targetEditorId
			});
		}

		return id;
	}

	getSuggestion(suggestionId: string): CodeEditSuggestion | undefined {
		return this._suggestions.get(suggestionId);
	}

	getAllSuggestions(editorId?: string): CodeEditSuggestion[] {
		const suggestions = Array.from(this._suggestions.values());
		if (!editorId) {
			return suggestions;
		}
		// Note: In a full implementation, you'd track which suggestions belong to which editor
		return suggestions;
	}

	getPendingSuggestions(editorId?: string): CodeEditSuggestion[] {
		return this.getAllSuggestions(editorId).filter(s => s.status === 'pending');
	}

	async applySuggestion(suggestionId: string): Promise<boolean> {
		const suggestion = this._suggestions.get(suggestionId);
		if (!suggestion || suggestion.status !== 'pending') {
			return false;
		}

		try {
			// Apply the text edits
			this.applyTextEdits(suggestion.edits);

			// Update suggestion status
			const oldStatus = suggestion.status;
			suggestion.status = 'applied';
			this._suggestions.set(suggestionId, suggestion);

			// Fire events
			this._onSuggestionStatusChanged.fire({
				suggestionId,
				oldStatus,
				newStatus: 'applied',
				editorId: this._activeEditorId || ''
			});

			this._onSuggestionApplied.fire({
				suggestionId,
				editorId: this._activeEditorId || '',
				success: true
			});

			return true;
		} catch (error) {
			this._onSuggestionApplied.fire({
				suggestionId,
				editorId: this._activeEditorId || '',
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			return false;
		}
	}

	rejectSuggestion(suggestionId: string): void {
		const suggestion = this._suggestions.get(suggestionId);
		if (!suggestion || suggestion.status !== 'pending') {
			return;
		}

		const oldStatus = suggestion.status;
		suggestion.status = 'rejected';
		this._suggestions.set(suggestionId, suggestion);

		this._onSuggestionStatusChanged.fire({
			suggestionId,
			oldStatus,
			newStatus: 'rejected',
			editorId: this._activeEditorId || ''
		});

		// Clear any preview decorations
		this.clearPreview();
	}

	clearSuggestions(editorId?: string): void {
		if (editorId) {
			// In a full implementation, filter by editor
			this._suggestions.clear();
		} else {
			this._suggestions.clear();
		}
		this.clearPreview();
	}

	// =================
	// Inline Suggestions
	// =================

	showInlineSuggestion(suggestion: InlineSuggestion, editorId?: string): string {
		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return '';
		}

		const editor = this._editors.get(targetEditorId);
		if (!editor) {
			return '';
		}

		this._inlineSuggestions.set(suggestion.id, suggestion);

		// Use Monaco's inline suggestion API if available, or fallback to decorations
		if (suggestion.ghostText) {
			// Create ghost text decoration
			const decorationId = this.highlightRange(
				{
					startLineNumber: suggestion.position.lineNumber,
					startColumn: suggestion.position.column,
					endLineNumber: suggestion.position.lineNumber,
					endColumn: suggestion.position.column
				},
				'ghost-text-suggestion',
				targetEditorId
			);
			suggestion.previewDecorations = [decorationId];
		}

		return suggestion.id;
	}

	hideInlineSuggestion(suggestionId: string): void {
		const suggestion = this._inlineSuggestions.get(suggestionId);
		if (suggestion?.previewDecorations) {
			suggestion.previewDecorations.forEach((decorationId: string) => {
				this.clearHighlight(decorationId);
			});
		}
		this._inlineSuggestions.delete(suggestionId);
	}

	async acceptInlineSuggestion(suggestionId: string): Promise<boolean> {
		const suggestion = this._inlineSuggestions.get(suggestionId);
		if (!suggestion) {
			return false;
		}

		try {
			this.insertText(suggestion.text, suggestion.position);
			this.hideInlineSuggestion(suggestionId);
			return true;
		} catch {
			return false;
		}
	}

	// =================
	// Diff Viewer
	// =================

	showDiffView(original: string, modified: string, options?: DiffViewOptions, editorId?: string): string {
		const diffId = `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// In a full implementation, you'd create a proper diff view
		// For now, we'll simulate by showing the changes as decorations

		const targetEditorId = editorId || this._activeEditorId;
		if (targetEditorId) {
			// Highlight the differences
			// This is a simplified implementation - a real one would use a proper diff algorithm
			this.setContent(modified, targetEditorId);
		}

		return diffId;
	}

	hideDiffView(diffViewId: string): void {
		const diffEditor = this._diffEditors.get(diffViewId);
		if (diffEditor) {
			diffEditor.monacoInstance.dispose();
			this._diffEditors.delete(diffViewId);
		}
	}

	createDiffEditor(container: HTMLElement, original: string, modified: string, options?: DiffViewOptions): MonacoEditor {
		// Create a Monaco diff editor
		const diffEditor = (window as any).monaco.editor.createDiffEditor(container, {
			theme: options?.theme === 'light' ? 'vs' : 'vs-dark',
			readOnly: options?.readOnly ?? false,
			renderSideBySide: options?.renderSideBySide ?? true,
			...options
		});

		const originalModel = (window as any).monaco.editor.createModel(original, 'typescript');
		const modifiedModel = (window as any).monaco.editor.createModel(modified, 'typescript');

		diffEditor.setModel({
			original: originalModel,
			modified: modifiedModel
		});

		const editorWrapper: MonacoEditor = {
			id: this.generateEditorId(),
			monacoInstance: diffEditor,
			container,
			language: 'typescript',
			theme: options?.theme || 'vs-dark',
			options: options || {},
			created: Date.now()
		};

		this._diffEditors.set(editorWrapper.id, editorWrapper);
		return editorWrapper;
	}

	// =================
	// Suggestion Providers
	// =================

	registerSuggestionProvider(provider: SuggestionProvider): () => void {
		this._suggestionProviders.set(provider.id, provider);

		return () => {
			this._suggestionProviders.delete(provider.id);
		};
	}

	getSuggestionProviders(): SuggestionProvider[] {
		return Array.from(this._suggestionProviders.values())
			.filter(provider => provider.enabled)
			.sort((a, b) => b.priority - a.priority);
	}

	async requestSuggestions(context?: CodeContext, editorId?: string): Promise<CodeEditSuggestion[]> {
		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return [];
		}

		const suggestionContext = context || this.createCodeContext(targetEditorId);
		const providers = this.getSuggestionProviders();

		const suggestions: CodeEditSuggestion[] = [];

		for (const provider of providers) {
			try {
				const providerSuggestions = await provider.provideSuggestions(suggestionContext);
				suggestions.push(...providerSuggestions);
			} catch (error) {
				console.error(`Error getting suggestions from provider ${provider.name}:`, error);
			}
		}

		return suggestions;
	}

	async requestInlineSuggestions(context?: CodeContext, editorId?: string): Promise<InlineSuggestion[]> {
		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return [];
		}

		const suggestionContext = context || this.createCodeContext(targetEditorId);
		const providers = this.getSuggestionProviders();

		const suggestions: InlineSuggestion[] = [];

		for (const provider of providers) {
			try {
				const providerSuggestions = await provider.provideInlineSuggestions(suggestionContext);
				suggestions.push(...providerSuggestions);
			} catch (error) {
				console.error(`Error getting inline suggestions from provider ${provider.name}:`, error);
			}
		}

		return suggestions;
	}

	// =================
	// Preview and Highlighting
	// =================

	previewSuggestion(suggestionId: string, editorId?: string): void {
		const suggestion = this._suggestions.get(suggestionId);
		if (!suggestion) {
			return;
		}

		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return;
		}

		// Clear existing preview
		this.clearPreview(targetEditorId);

		// Create preview decorations
		const decorationIds: string[] = [];

		for (const edit of suggestion.edits) {
			const decorationId = this.highlightRange(
				edit.range,
				'suggestion-preview',
				targetEditorId
			);
			decorationIds.push(decorationId);
		}

		suggestion.previewDecorations = decorationIds;
		this._suggestions.set(suggestionId, suggestion);
	}

	clearPreview(editorId?: string): void {
		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return;
		}

		// Clear all preview decorations
		for (const suggestion of this._suggestions.values()) {
			if (suggestion.previewDecorations) {
				suggestion.previewDecorations.forEach((decorationId: string) => {
					this.clearHighlight(decorationId);
				});
				suggestion.previewDecorations = undefined;
			}
		}
	}

	highlightRange(range: EditorRange, className = 'highlight', editorId?: string): string {
		const targetEditorId = editorId || this._activeEditorId;
		if (!targetEditorId) {
			return '';
		}

		const editor = this._editors.get(targetEditorId);
		if (!editor) {
			return '';
		}

		const decorationId = `decoration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		const decorations = editor.monacoInstance.deltaDecorations([], [{
			range: range,
			options: {
				className: className,
				isWholeLine: false,
				glyphMarginClassName: className + '-glyph'
			}
		}]);

		this._decorations.set(decorationId, decorations);
		return decorationId;
	}

	clearHighlight(highlightId: string): void {
		const decorations = this._decorations.get(highlightId);
		if (!decorations) {
			return;
		}

		// Find the editor that contains these decorations
		for (const editor of this._editors.values()) {
			try {
				editor.monacoInstance.deltaDecorations(decorations, []);
			} catch {
				// Ignore errors if decorations don't exist in this editor
			}
		}

		this._decorations.delete(highlightId);
	}

	// =================
	// Helper Methods
	// =================

	private createCodeContext(editorId: string): CodeContext {
		const editor = this._editors.get(editorId);
		if (!editor) {
			throw new Error(`Editor ${editorId} not found`);
		}

		const content = editor.monacoInstance.getValue();
		const selection = this.getSelection(editorId);
		const position = this.getCursorPosition(editorId);

		const lines = content.split('\n');
		const currentLineIndex = (position?.lineNumber || 1) - 1;
		const currentLine = lines[currentLineIndex] || '';

		return {
			fullContent: content,
			selectedText: selection && !selection.isEmpty ? this.getSelectedText(editorId) : '',
			linesBefore: lines.slice(0, currentLineIndex),
			linesAfter: lines.slice(currentLineIndex + 1),
			currentLine,
			cursorPosition: position || { lineNumber: 1, column: 1 },
			language: editor.language
		};
	}

	dispose(): void {
		// Dispose all editors
		for (const editor of this._editors.values()) {
			editor.monacoInstance.dispose();
		}

		this._editors.clear();
		this._editorStates.clear();
		this._activeEditorId = undefined;

		super.dispose();
	}
}
