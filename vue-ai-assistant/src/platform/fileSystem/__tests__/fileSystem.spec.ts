import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	BrowserMonacoEditorService,
	createVirtualFileSystem,
	FileSystemFactory,
	FileSystemUtils,
	MemoryFileSystemProvider,
	VirtualFileSystem,
	type EditorSelection,
	type FileSystemChangeEvent,
	type MonacoEditorInstance
} from '../index';

describe('File System Abstraction Layer', () => {
	describe('VirtualFileSystem', () => {
		let vfs: VirtualFileSystem;
		let memoryProvider: MemoryFileSystemProvider;

		beforeEach(() => {
			vfs = createVirtualFileSystem();
			memoryProvider = new MemoryFileSystemProvider();
			vfs.registerProvider('memory', memoryProvider);
			vfs.registerProvider('file', memoryProvider);
		});

		afterEach(() => {
			vfs.dispose();
		});

		describe('Basic file operations', () => {
			it('should write and read a file', async () => {
				const uri = 'memory:/test.txt';
				const content = 'Hello, World!';

				await vfs.writeFile(uri, content);
				const readContent = await vfs.readFile(uri);

				expect(readContent).toBe(content);
			});

			it('should create directories recursively', async () => {
				const uri = 'memory:/deep/nested/directory';

				await vfs.createDirectory(uri, { recursive: true });
				const exists = await vfs.exists(uri);

				expect(exists).toBe(true);
			});

			it('should list directory contents', async () => {
				await vfs.createDirectory('memory:/testdir', { recursive: true });
				await vfs.writeFile('memory:/testdir/file1.txt', 'content1');
				await vfs.writeFile('memory:/testdir/file2.txt', 'content2');

				const entries = await vfs.readDirectory('memory:/testdir');

				expect(entries).toHaveLength(2);
				expect(entries.map(e => e.name)).toContain('file1.txt');
				expect(entries.map(e => e.name)).toContain('file2.txt');
			});

			it('should delete files and directories', async () => {
				const fileUri = 'memory:/deleteme.txt';
				const dirUri = 'memory:/deletemedir';

				await vfs.writeFile(fileUri, 'content');
				await vfs.createDirectory(dirUri);

				await vfs.delete(fileUri);
				await vfs.delete(dirUri);

				expect(await vfs.exists(fileUri)).toBe(false);
				expect(await vfs.exists(dirUri)).toBe(false);
			});

			it('should rename files and directories', async () => {
				const oldUri = 'memory:/oldname.txt';
				const newUri = 'memory:/newname.txt';
				const content = 'test content';

				await vfs.writeFile(oldUri, content);
				await vfs.rename(oldUri, newUri);

				expect(await vfs.exists(oldUri)).toBe(false);
				expect(await vfs.exists(newUri)).toBe(true);
				expect(await vfs.readFile(newUri)).toBe(content);
			});

			it('should get file statistics', async () => {
				const uri = 'memory:/stats.txt';
				const content = 'test content for stats';

				await vfs.writeFile(uri, content);
				const stats = await vfs.stat(uri);

				expect(stats.type).toBe('file');
				expect(stats.name).toBe('stats.txt');
				expect(stats.size).toBe(content.length);
				expect(stats.lastModified).toBeInstanceOf(Date);
			});
		});

		describe('File watching', () => {
			it('should emit events when files change', async () => {
				const uri = 'memory:/watched.txt';
				const events: FileSystemChangeEvent[] = [];

				const watcher = vfs.watchFile(uri, (event) => {
					events.push(event);
				});

				await vfs.writeFile(uri, 'initial content');
				await vfs.writeFile(uri, 'updated content');
				await vfs.delete(uri);

				watcher.dispose();

				expect(events).toHaveLength(3);
				expect(events[0].type).toBe('created');
				expect(events[1].type).toBe('modified');
				expect(events[2].type).toBe('deleted');
			});

			it('should watch directory changes', async () => {
				const dirUri = 'memory:/watcheddir';
				const fileUri = 'memory:/watcheddir/newfile.txt';
				const events: FileSystemChangeEvent[] = [];

				await vfs.createDirectory(dirUri);

				const watcher = vfs.watchFile(dirUri, (event) => {
					events.push(event);
				});

				await vfs.writeFile(fileUri, 'content');

				watcher.dispose();

				expect(events.length).toBeGreaterThan(0);
			});
		});

		describe('Advanced operations', () => {
			it('should copy files', async () => {
				const sourceUri = 'memory:/source.txt';
				const targetUri = 'memory:/target.txt';
				const content = 'content to copy';

				await vfs.writeFile(sourceUri, content);
				await vfs.copy(sourceUri, targetUri);

				expect(await vfs.readFile(targetUri)).toBe(content);
			});

			it('should copy directories recursively', async () => {
				await vfs.createDirectory('memory:/sourcedir/subdir', { recursive: true });
				await vfs.writeFile('memory:/sourcedir/file.txt', 'content');
				await vfs.writeFile('memory:/sourcedir/subdir/subfile.txt', 'subcontent');

				await vfs.copy('memory:/sourcedir', 'memory:/targetdir');

				expect(await vfs.exists('memory:/targetdir')).toBe(true);
				expect(await vfs.exists('memory:/targetdir/file.txt')).toBe(true);
				expect(await vfs.exists('memory:/targetdir/subdir/subfile.txt')).toBe(true);
				expect(await vfs.readFile('memory:/targetdir/file.txt')).toBe('content');
			});

			it('should find files by pattern', async () => {
				await vfs.createDirectory('memory:/searchtest', { recursive: true });
				await vfs.writeFile('memory:/searchtest/test1.js', 'js content');
				await vfs.writeFile('memory:/searchtest/test2.ts', 'ts content');
				await vfs.writeFile('memory:/searchtest/readme.md', 'md content');

				const jsFiles = await vfs.findFiles('memory:/searchtest', /\.js$/);
				const tsFiles = await vfs.findFiles('memory:/searchtest', '.*\\.ts$');

				expect(jsFiles).toHaveLength(1);
				expect(jsFiles[0].name).toBe('test1.js');
				expect(tsFiles).toHaveLength(1);
				expect(tsFiles[0].name).toBe('test2.ts');
			});

			it('should get all files recursively', async () => {
				await vfs.createDirectory('memory:/recursive/deep/nested', { recursive: true });
				await vfs.writeFile('memory:/recursive/file1.txt', 'content1');
				await vfs.writeFile('memory:/recursive/deep/file2.txt', 'content2');
				await vfs.writeFile('memory:/recursive/deep/nested/file3.txt', 'content3');

				const allFiles = await vfs.getAllFiles('memory:/recursive');

				expect(allFiles).toHaveLength(3);
				expect(allFiles.map(f => f.name)).toContain('file1.txt');
				expect(allFiles.map(f => f.name)).toContain('file2.txt');
				expect(allFiles.map(f => f.name)).toContain('file3.txt');
			});
		});

		describe('Event system', () => {
			it('should emit file read events', async () => {
				const uri = 'memory:/eventtest.txt';
				const content = 'event test content';
				let readEvent: any = null;

				const disposable = vfs.on('fileRead', (event) => {
					readEvent = event;
				});

				await vfs.writeFile(uri, content);
				await vfs.readFile(uri);

				disposable.dispose();

				expect(readEvent).toBeTruthy();
				expect(readEvent.uri).toBe(uri);
				expect(readEvent.content).toBe(content);
			});

			it('should emit error events', async () => {
				let errorEvent: any = null;

				const disposable = vfs.on('error', (event) => {
					errorEvent = event;
				});

				try {
					await vfs.readFile('memory:/nonexistent.txt');
				} catch (error) {
					// Expected error
				}

				disposable.dispose();

				expect(errorEvent).toBeTruthy();
				expect(errorEvent.operation).toBe('readFile');
				expect(errorEvent.uri).toBe('memory:/nonexistent.txt');
			});
		});
	});

	describe('MemoryFileSystemProvider', () => {
		let provider: MemoryFileSystemProvider;

		beforeEach(() => {
			provider = new MemoryFileSystemProvider();
		});

		it('should handle different encodings', async () => {
			const uri = 'memory:/encoding-test.txt';
			const content = 'Hello, encoding!';

			await provider.writeFile(uri, content, { encoding: 'utf8' });

			const utf8Content = await provider.readFile(uri, { encoding: 'utf8' });
			const base64Content = await provider.readFile(uri, { encoding: 'base64' });
			const binaryContent = await provider.readFile(uri, { encoding: 'binary' });

			expect(utf8Content).toBe(content);
			expect(typeof base64Content).toBe('string');
			// Check if it's a Uint8Array by checking it has the expected properties
			expect(binaryContent).toHaveProperty('length');
			expect(binaryContent).toHaveProperty('byteLength');
			expect(typeof (binaryContent as any).at).toBe('function');
			expect(Array.from(binaryContent as Uint8Array).slice(0, 5)).toEqual([72, 101, 108, 108, 111]); // "Hello"
		});

		it('should clear all files', () => {
			provider.clear();
			const allFiles = provider.getAllFiles();

			// Should only have root directory
			expect(allFiles).toHaveLength(1);
			expect(allFiles[0].uri).toBe('/');
		});
	});

	describe('BrowserMonacoEditorService', () => {
		let editorService: BrowserMonacoEditorService;

		beforeEach(() => {
			editorService = new BrowserMonacoEditorService();
		});

		it('should register and manage editor instances', async () => {
			const editor: MonacoEditorInstance = {
				id: 'test-editor',
				uri: 'file:///test.ts',
				language: 'typescript',
				isDirty: false
			};

			editorService.registerEditor(editor);

			expect(editorService.getEditor(editor.uri)).toBe(editor);
			expect(editorService.getActiveEditor()).toBe(editor);
			expect(editorService.getEditors()).toContain(editor);
		});

		it('should handle active editor changes', async () => {
			let activeEditorChanges: (MonacoEditorInstance | null)[] = [];

			const disposable = editorService.onDidChangeActiveEditor((editor) => {
				activeEditorChanges.push(editor);
			});

			const editor1: MonacoEditorInstance = {
				id: 'editor1',
				uri: 'file:///test1.ts',
				language: 'typescript',
				isDirty: false
			};

			const editor2: MonacoEditorInstance = {
				id: 'editor2',
				uri: 'file:///test2.ts',
				language: 'typescript',
				isDirty: false
			};

			editorService.registerEditor(editor1);
			editorService.registerEditor(editor2);
			editorService.unregisterEditor(editor1.uri);

			disposable.dispose();

			expect(activeEditorChanges.length).toBeGreaterThan(0);
		});

		it('should detect language from file extension', async () => {
			const testCases = [
				{ uri: 'file:///test.ts', expected: 'typescript' },
				{ uri: 'file:///test.js', expected: 'javascript' },
				{ uri: 'file:///test.py', expected: 'python' },
				{ uri: 'file:///test.html', expected: 'html' },
				{ uri: 'file:///test.css', expected: 'css' },
				{ uri: 'file:///test.unknown', expected: 'plaintext' }
			];

			for (const testCase of testCases) {
				const editor = await editorService.openEditor(testCase.uri);
				expect(editor.language).toBe(testCase.expected);
			}
		});

		it('should handle selection changes', async () => {
			const uri = 'file:///test.ts';
			let selectionChanges: Array<{ uri: string; selection: EditorSelection }> = [];

			const disposable = editorService.onDidChangeSelection((uri, selection) => {
				selectionChanges.push({ uri, selection });
			});

			await editorService.openEditor(uri);

			const selection: EditorSelection = {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 10
			};

			await editorService.setSelection(uri, selection);

			disposable.dispose();

			expect(selectionChanges).toHaveLength(1);
			expect(selectionChanges[0].uri).toBe(uri);
			expect(selectionChanges[0].selection).toEqual(selection);
		});

		it('should simulate content changes', () => {
			const uri = 'file:///test.ts';
			let contentChanges: any[] = [];

			const disposable = editorService.onDidChangeContent((event) => {
				contentChanges.push(event);
			});

			editorService.simulateContentChange(uri, [{
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				text: 'Hello',
				rangeLength: 0
			}]);

			disposable.dispose();

			expect(contentChanges).toHaveLength(1);
			expect(contentChanges[0].uri).toBe(uri);
		});
	});

	describe('FileSystemFactory', () => {
		it('should create memory file system', () => {
			const vfs = FileSystemFactory.createMemoryFileSystem();

			expect(vfs).toBeInstanceOf(VirtualFileSystem);
		});

		it('should create Monaco editor service', () => {
			const editorService = FileSystemFactory.createMonacoEditorService();

			expect(editorService).toBeInstanceOf(BrowserMonacoEditorService);
		});

		it('should create complete file system setup', () => {
			const { fileSystem, editorService } = FileSystemFactory.createCompleteFileSystem();

			expect(fileSystem).toBeInstanceOf(VirtualFileSystem);
			expect(editorService).toBeInstanceOf(BrowserMonacoEditorService);
		});
	});

	describe('FileSystemUtils', () => {
		let vfs: VirtualFileSystem;

		beforeEach(() => {
			vfs = FileSystemFactory.createMemoryFileSystem();
		});

		afterEach(() => {
			vfs.dispose();
		});

		it('should create sample project structure', async () => {
			await FileSystemUtils.createSampleProject(vfs);

			// Check that key files were created
			expect(await vfs.exists('memory:/package.json')).toBe(true);
			expect(await vfs.exists('memory:/src/index.ts')).toBe(true);
			expect(await vfs.exists('memory:/src/components/Button.vue')).toBe(true);
			expect(await vfs.exists('memory:/src/services/apiService.ts')).toBe(true);
			expect(await vfs.exists('memory:/README.md')).toBe(true);

			// Check directory structure
			const srcEntries = await vfs.readDirectory('memory:/src');
			expect(srcEntries.some(e => e.name === 'components')).toBe(true);
			expect(srcEntries.some(e => e.name === 'services')).toBe(true);
			expect(srcEntries.some(e => e.name === 'utils')).toBe(true);
		});

		it('should get file extension correctly', () => {
			expect(FileSystemUtils.getFileExtension('test.ts')).toBe('ts');
			expect(FileSystemUtils.getFileExtension('path/to/file.vue')).toBe('vue');
			expect(FileSystemUtils.getFileExtension('noextension')).toBe('');
			expect(FileSystemUtils.getFileExtension('.gitignore')).toBe('gitignore');
		});

		it('should identify text files', () => {
			expect(FileSystemUtils.isTextFile('test.ts')).toBe(true);
			expect(FileSystemUtils.isTextFile('test.js')).toBe(true);
			expect(FileSystemUtils.isTextFile('test.vue')).toBe(true);
			expect(FileSystemUtils.isTextFile('test.md')).toBe(true);
			expect(FileSystemUtils.isTextFile('test.json')).toBe(true);
			expect(FileSystemUtils.isTextFile('image.png')).toBe(false);
			expect(FileSystemUtils.isTextFile('archive.zip')).toBe(false);
		});

		it('should get correct MIME types', () => {
			expect(FileSystemUtils.getMimeType('test.js')).toBe('application/javascript');
			expect(FileSystemUtils.getMimeType('test.ts')).toBe('application/typescript');
			expect(FileSystemUtils.getMimeType('test.html')).toBe('text/html');
			expect(FileSystemUtils.getMimeType('test.css')).toBe('text/css');
			expect(FileSystemUtils.getMimeType('test.json')).toBe('application/json');
			expect(FileSystemUtils.getMimeType('image.png')).toBe('image/png');
			expect(FileSystemUtils.getMimeType('unknown.xyz')).toBe('application/octet-stream');
		});
	});
});
