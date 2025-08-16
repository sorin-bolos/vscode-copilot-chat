// Monaco Editor Service Types and Interfaces

export interface IMonacoEditorService {
	readonly activeEditorId: string | undefined;
	readonly activeEditor: MonacoEditor | undefined;
	readonly allEditors: MonacoEditor[];

	readonly onEditorCreated: (listener: (editor: MonacoEditor) => void) => () => void;
	readonly onEditorDestroyed: (listener: (editorId: string) => void) => () => void;
	readonly onContentChanged: (listener: (event: { editorId: string; content: string }) => void) => () => void;
	readonly onSelectionChanged: (listener: (event: { editorId: string; selection: EditorSelection }) => void) => () => void;
	readonly onCursorPositionChanged: (listener: (event: { editorId: string; position: EditorPosition }) => void) => () => void;

	getEditor(editorId: string): MonacoEditor | undefined;
	createEditor(container: HTMLElement, options?: EditorOptions): MonacoEditor;
	destroyEditor(editorId: string): void;
	setActiveEditor(editorId: string): void;

	// Content operations
	getContent(editorId?: string): string;
	setContent(content: string, editorId?: string): void;

	// Selection operations
	getSelection(editorId?: string): EditorSelection | undefined;
	setSelection(selection: EditorSelection, editorId?: string): void;
	getSelectedText(editorId?: string): string;
	replaceSelection(text: string, editorId?: string): void;

	// Cursor operations
	getCursorPosition(editorId?: string): EditorPosition | undefined;
	setCursorPosition(position: EditorPosition, editorId?: string): void;

	// Text editing operations
	insertText(text: string, position?: EditorPosition, editorId?: string): void;
	applyTextEdits(edits: TextEdit[], editorId?: string): void;
	formatDocument(editorId?: string): Promise<void>;

	// Language operations
	getLanguage(editorId?: string): string;
	setLanguage(language: string, editorId?: string): void;
	detectLanguage(filename: string): LanguageDetection;

	// State management
	getEditorState(editorId?: string): EditorState | undefined;
	saveEditorState(editorId?: string): EditorState | undefined;
	restoreEditorState(state: EditorState, editorId?: string): void;

	// Utility
	focus(editorId?: string): void;

	// Code Edit Suggestions
	readonly onSuggestionCreated: (listener: (event: SuggestionCreatedEvent) => void) => () => void;
	readonly onSuggestionStatusChanged: (listener: (event: SuggestionStatusChangedEvent) => void) => () => void;
	readonly onSuggestionApplied: (listener: (event: SuggestionAppliedEvent) => void) => () => void;

	// Suggestion management
	createSuggestion(suggestion: Omit<CodeEditSuggestion, 'id' | 'status' | 'timestamp'>, editorId?: string): string;
	getSuggestion(suggestionId: string): CodeEditSuggestion | undefined;
	getAllSuggestions(editorId?: string): CodeEditSuggestion[];
	getPendingSuggestions(editorId?: string): CodeEditSuggestion[];
	applySuggestion(suggestionId: string): Promise<boolean>;
	rejectSuggestion(suggestionId: string): void;
	clearSuggestions(editorId?: string): void;

	// Inline suggestions
	showInlineSuggestion(suggestion: InlineSuggestion, editorId?: string): string;
	hideInlineSuggestion(suggestionId: string): void;
	acceptInlineSuggestion(suggestionId: string): Promise<boolean>;

	// Diff viewer
	showDiffView(original: string, modified: string, options?: DiffViewOptions, editorId?: string): string;
	hideDiffView(diffViewId: string): void;
	createDiffEditor(container: HTMLElement, original: string, modified: string, options?: DiffViewOptions): MonacoEditor;

	// Suggestion providers
	registerSuggestionProvider(provider: SuggestionProvider): () => void;
	getSuggestionProviders(): SuggestionProvider[];
	requestSuggestions(context?: CodeContext, editorId?: string): Promise<CodeEditSuggestion[]>;
	requestInlineSuggestions(context?: CodeContext, editorId?: string): Promise<InlineSuggestion[]>;

	// Preview and highlighting
	previewSuggestion(suggestionId: string, editorId?: string): void;
	clearPreview(editorId?: string): void;
	highlightRange(range: EditorRange, className?: string, editorId?: string): string;
	clearHighlight(highlightId: string): void;
}

export interface MonacoEditor {
	id: string;
	monacoInstance: any; // Monaco editor instance
	container: HTMLElement;
	language: string;
	theme: string;
	options: EditorOptions;
	created: number;
}

export interface EditorOptions {
	value?: string;
	language?: string;
	theme?: string;
	readOnly?: boolean;
	automaticLayout?: boolean;
	minimap?: { enabled: boolean };
	fontSize?: number;
	fontFamily?: string;
	lineHeight?: number;
	wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
	lineNumbers?: 'on' | 'off' | 'relative' | 'interval';
	renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all';
	scrollBeyondLastLine?: boolean;
	smoothScrolling?: boolean;
	cursorBlinking?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid';
	cursorSmoothCaretAnimation?: 'off' | 'explicit' | 'on';
	cursorStyle?: 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';
	suggest?: {
		showStatusBar?: boolean;
		insertMode?: 'insert' | 'replace';
		filterGraceful?: boolean;
		localityBonus?: boolean;
		shareSuggestSelections?: boolean;
		showIcons?: boolean;
		maxVisibleSuggestions?: number;
		showMethods?: boolean;
		showFunctions?: boolean;
		showConstructors?: boolean;
		showFields?: boolean;
		showVariables?: boolean;
		showClasses?: boolean;
		showStructs?: boolean;
		showInterfaces?: boolean;
		showModules?: boolean;
		showProperties?: boolean;
		showEvents?: boolean;
		showOperators?: boolean;
		showUnits?: boolean;
		showValues?: boolean;
		showConstants?: boolean;
		showEnums?: boolean;
		showEnumMembers?: boolean;
		showKeywords?: boolean;
		showWords?: boolean;
		showColors?: boolean;
		showFiles?: boolean;
		showReferences?: boolean;
		showFolders?: boolean;
		showTypeParameters?: boolean;
		showSnippets?: boolean;
		showUsers?: boolean;
		showIssues?: boolean;
	};
	quickSuggestions?: boolean | {
		other?: boolean;
		comments?: boolean;
		strings?: boolean;
	};
	tabCompletion?: 'on' | 'off' | 'onlySnippets';
	acceptSuggestionOnEnter?: 'on' | 'off' | 'smart';
	acceptSuggestionOnCommitCharacter?: boolean;
	snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none';
	emptySelectionClipboard?: boolean;
	copyWithSyntaxHighlighting?: boolean;
	selectionHighlight?: boolean;
	occurrencesHighlight?: boolean;
	codeLens?: boolean;
	folding?: boolean;
	foldingStrategy?: 'auto' | 'indentation';
	showFoldingControls?: 'always' | 'mouseover';
	unfoldOnClickAfterEndOfLine?: boolean;
	matchBrackets?: 'never' | 'near' | 'always';
	renderControlCharacters?: boolean;
	renderIndentGuides?: boolean;
	highlightActiveIndentGuide?: boolean;
	renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
	useTabStops?: boolean;
	tabSize?: number;
	insertSpaces?: boolean;
	detectIndentation?: boolean;
	trimAutoWhitespace?: boolean;
	largeFileOptimizations?: boolean;
}

export interface EditorPosition {
	lineNumber: number;
	column: number;
}

export interface EditorSelection {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
	isEmpty: boolean;
}

export interface EditorRange {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
}

export interface TextEdit {
	range: EditorRange;
	text: string;
}

export interface EditorState {
	content: string;
	selection?: EditorSelection;
	cursorPosition?: EditorPosition;
	language: string;
	isDirty: boolean;
	lastModified: number;
}

export interface LanguageDetection {
	language: string;
	confidence: number;
}

// Context extraction types
export interface CodeContext {
	fullContent: string;
	selectedText: string;
	linesBefore: string[];
	linesAfter: string[];
	currentLine: string;
	cursorPosition: EditorPosition;
	language: string;
	filename?: string;
}

export interface CodeAnalysis {
	syntax: {
		isValid: boolean;
		errors: SyntaxError[];
		warnings: SyntaxWarning[];
	};
	structure: {
		functions: FunctionInfo[];
		classes: ClassInfo[];
		imports: ImportInfo[];
		exports: ExportInfo[];
		variables: VariableInfo[];
	};
	complexity: {
		cyclomatic: number;
		cognitive: number;
		lines: number;
		maintainabilityIndex: number;
	};
	dependencies: {
		internal: string[];
		external: string[];
		missing: string[];
	};
}

export interface SyntaxError {
	line: number;
	column: number;
	message: string;
	severity: 'error' | 'warning' | 'info';
	code?: string;
}

export interface SyntaxWarning extends SyntaxError {
	severity: 'warning';
}

export interface FunctionInfo {
	name: string;
	startLine: number;
	endLine: number;
	parameters: ParameterInfo[];
	returnType?: string;
	isAsync: boolean;
	isExported: boolean;
	comments?: string;
}

export interface ClassInfo {
	name: string;
	startLine: number;
	endLine: number;
	methods: FunctionInfo[];
	properties: PropertyInfo[];
	extends?: string;
	implements?: string[];
	isExported: boolean;
	comments?: string;
}

export interface ImportInfo {
	source: string;
	imports: string[];
	isDefault: boolean;
	line: number;
}

export interface ExportInfo {
	name: string;
	type: 'function' | 'class' | 'variable' | 'constant' | 'default';
	line: number;
}

export interface VariableInfo {
	name: string;
	type?: string;
	line: number;
	scope: 'global' | 'function' | 'block' | 'class';
	isConstant: boolean;
}

export interface ParameterInfo {
	name: string;
	type?: string;
	optional: boolean;
	defaultValue?: string;
}

export interface PropertyInfo {
	name: string;
	type?: string;
	visibility: 'public' | 'private' | 'protected';
	isStatic: boolean;
	isReadonly: boolean;
	line: number;
}

// Editor event types
export interface EditorContentChangeEvent {
	editorId: string;
	content: string;
	changes: ContentChange[];
}

export interface ContentChange {
	range: EditorRange;
	text: string;
	rangeLength: number;
}

export interface EditorSelectionChangeEvent {
	editorId: string;
	selection: EditorSelection;
	previousSelection?: EditorSelection;
}

export interface EditorCursorPositionChangeEvent {
	editorId: string;
	position: EditorPosition;
	previousPosition?: EditorPosition;
}

// AI integration types
export interface AIEditSuggestion {
	id: string;
	description: string;
	edits: TextEdit[];
	confidence: number;
	reasoning?: string;
	category: 'refactor' | 'fix' | 'optimize' | 'generate' | 'explain';
	preview?: string;
	status: 'pending' | 'accepted' | 'rejected' | 'applied';
	timestamp: number;
}

// Code Edit Suggestion System
export interface CodeEditSuggestion {
	id: string;
	title: string;
	description?: string;
	edits: TextEdit[];
	originalText: string;
	suggestedText: string;
	range: EditorRange;
	confidence: number;
	category: SuggestionCategory;
	reasoning?: string;
	status: SuggestionStatus;
	timestamp: number;
	previewDecorations?: string[];
	diffViewOptions?: DiffViewOptions;
}

export type SuggestionCategory =
	| 'refactor'
	| 'fix'
	| 'optimize'
	| 'generate'
	| 'explain'
	| 'format'
	| 'import'
	| 'typing'
	| 'security'
	| 'performance';

export type SuggestionStatus =
	| 'pending'
	| 'accepted'
	| 'rejected'
	| 'applied'
	| 'expired';

export interface DiffViewOptions {
	renderSideBySide?: boolean;
	showInlineChanges?: boolean;
	highlightStyle?: 'line' | 'word' | 'character';
	showLineNumbers?: boolean;
	readOnly?: boolean;
	theme?: 'light' | 'dark' | 'auto';
}

export interface InlineSuggestion {
	id: string;
	text: string;
	position: EditorPosition;
	triggerCharacters?: string[];
	confidence: number;
	category: SuggestionCategory;
	ghostText?: boolean;
	showAfterDelay?: number;
	previewDecorations?: string[];
	// Enhanced inline display options
	displayMode?: InlineDisplayMode;
	widget?: InlineWidgetOptions;
	styling?: InlineStylingOptions;
}

export type InlineDisplayMode =
	| 'ghost-text'      // Faded text at cursor (like Copilot)
	| 'tooltip'         // Hover tooltip with suggestion
	| 'popup'           // Small popup window
	| 'decoration'      // Editor decoration/highlight
	| 'widget'          // Custom inline widget
	| 'lightbulb';      // VS Code-style lightbulb icon

export interface InlineWidgetOptions {
	showAcceptReject?: boolean;
	showConfidence?: boolean;
	showKeyboardShortcuts?: boolean;
	position?: 'above' | 'below' | 'beside' | 'overlay';
	maxWidth?: number;
	autoHide?: boolean;
	hideOnTyping?: boolean;
}

export interface InlineStylingOptions {
	ghostTextOpacity?: number;           // 0.0 - 1.0
	ghostTextColor?: string;             // CSS color
	backgroundColor?: string;            // Background highlight
	borderColor?: string;                // Border color
	borderStyle?: 'solid' | 'dashed' | 'dotted';
	borderWidth?: number;
	fontSize?: string;                   // CSS font size
	fontStyle?: 'normal' | 'italic';
	textDecoration?: 'none' | 'underline' | 'line-through';
	animation?: InlineAnimationOptions;
}

export interface InlineAnimationOptions {
	fadeIn?: boolean;
	fadeInDuration?: number;             // milliseconds
	typewriter?: boolean;                // Typewriter effect
	typewriterSpeed?: number;            // characters per second
	pulse?: boolean;                     // Pulsing effect
	pulseInterval?: number;              // milliseconds
}

export interface SuggestionProvider {
	id: string;
	name: string;
	provideSuggestions(context: CodeContext): Promise<CodeEditSuggestion[]>;
	provideInlineSuggestions(context: CodeContext): Promise<InlineSuggestion[]>;
	priority: number;
	enabled: boolean;
}

// Suggestion Events
export interface SuggestionCreatedEvent {
	suggestion: CodeEditSuggestion;
	editorId: string;
}

export interface SuggestionStatusChangedEvent {
	suggestionId: string;
	oldStatus: SuggestionStatus;
	newStatus: SuggestionStatus;
	editorId: string;
}

export interface SuggestionAppliedEvent {
	suggestionId: string;
	editorId: string;
	success: boolean;
	error?: string;
}

export interface CodeCompletionSuggestion {
	id: string;
	text: string;
	insertText: string;
	detail?: string;
	documentation?: string;
	kind: 'method' | 'function' | 'constructor' | 'field' | 'variable' | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet' | 'text' | 'color' | 'file' | 'reference' | 'customcolor';
	sortText?: string;
	filterText?: string;
	preselect?: boolean;
	insertTextRules?: number;
	range?: EditorRange;
	commitCharacters?: string[];
	additionalTextEdits?: TextEdit[];
	command?: {
		id: string;
		title: string;
		arguments?: any[];
	};
}

// Single-file AI assistant context
export interface SingleFileContext {
	editor: MonacoEditor;
	content: string;
	selection: EditorSelection;
	cursorPosition: EditorPosition;
	language: string;
	analysis: CodeAnalysis;
	recentChanges: ContentChange[];
	userIntent?: string;
	conversationHistory: string[];
}
