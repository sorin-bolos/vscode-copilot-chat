import type { Disposable } from '../../utils/events';

/**
 * File system events
 */
export interface FileSystemEvents {
	fileRead: { uri: string; content: string | Uint8Array };
	fileWritten: { uri: string; content: string | Uint8Array };
	directoryCreated: { uri: string };
	fileDeleted: { uri: string };
	fileRenamed: { oldUri: string; newUri: string };
	directoryRead: { uri: string; entries: FileSystemEntry[] };
	fileChanged: FileSystemChangeEvent;
	error: { operation: string; uri: string; error: any };
}

/**
 * Event listener type
 */
export type FileSystemEventListener<K extends keyof FileSystemEvents> = (event: FileSystemEvents[K]) => void;

/**
 * Represents a file or directory in the virtual file system
 */
export interface FileSystemEntry {
	uri: string;
	name: string;
	type: 'file' | 'directory';
	size?: number;
	lastModified?: Date;
	encoding?: string;
	content?: string;
	children?: FileSystemEntry[];
	metadata?: Record<string, any>;
}

/**
 * File system operation options
 */
export interface FileSystemOptions {
	encoding?: 'utf8' | 'base64' | 'binary';
	createDirectories?: boolean;
	overwrite?: boolean;
	recursive?: boolean;
}

/**
 * File change event types
 */
export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed';

/**
 * File system change event
 */
export interface FileSystemChangeEvent {
	type: FileChangeType;
	uri: string;
	oldUri?: string; // For rename operations
	entry?: FileSystemEntry;
}

/**
 * File system watcher interface
 */
export interface FileSystemWatcher {
	dispose(): void;
}

/**
 * Abstract file system provider interface
 * Implementations can connect to different backends (IDE API, local storage, etc.)
 */
export interface FileSystemProvider {
	/**
	 * Read a file's content
	 */
	readFile(uri: string, options?: FileSystemOptions): Promise<string | Uint8Array>;

	/**
	 * Write content to a file
	 */
	writeFile(uri: string, content: string | Uint8Array, options?: FileSystemOptions): Promise<void>;

	/**
	 * Create a directory
	 */
	createDirectory(uri: string, options?: FileSystemOptions): Promise<void>;

	/**
	 * Delete a file or directory
	 */
	delete(uri: string, options?: FileSystemOptions): Promise<void>;

	/**
	 * Rename/move a file or directory
	 */
	rename(oldUri: string, newUri: string): Promise<void>;

	/**
	 * Check if a file or directory exists
	 */
	exists(uri: string): Promise<boolean>;

	/**
	 * Get file/directory information
	 */
	stat(uri: string): Promise<FileSystemEntry>;

	/**
	 * List directory contents
	 */
	readDirectory(uri: string): Promise<FileSystemEntry[]>;

	/**
	 * Watch for file system changes
	 */
	watch(uri: string, callback: (event: FileSystemChangeEvent) => void): FileSystemWatcher;
}

/**
 * Virtual File System service that abstracts file operations
 * Works with different providers (IDE, browser storage, etc.)
 */
export class VirtualFileSystem {
	private providers = new Map<string, FileSystemProvider>();
	private watchers = new Map<string, Set<FileSystemWatcher>>();
	private eventListeners = new Map<keyof FileSystemEvents, Set<FileSystemEventListener<any>>>();

	/**
	 * Add event listener
	 */
	on<K extends keyof FileSystemEvents>(event: K, listener: FileSystemEventListener<K>): Disposable {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, new Set());
		}
		this.eventListeners.get(event)!.add(listener);

		return {
			dispose: () => {
				const listeners = this.eventListeners.get(event);
				if (listeners) {
					listeners.delete(listener);
					if (listeners.size === 0) {
						this.eventListeners.delete(event);
					}
				}
			}
		};
	}

	/**
	 * Emit event to all listeners
	 */
	private emit<K extends keyof FileSystemEvents>(event: K, data: FileSystemEvents[K]): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			listeners.forEach(listener => {
				try {
					listener(data);
				} catch (error) {
					console.error(`Error in VFS event listener for ${event}:`, error);
				}
			});
		}
	}

	/**
	 * Register a file system provider for a specific scheme
	 * @param scheme - URI scheme (e.g., 'file', 'memory', 'remote')
	 * @param provider - The file system provider implementation
	 */
	registerProvider(scheme: string, provider: FileSystemProvider): void {
		this.providers.set(scheme, provider);
	}

	/**
	 * Get the appropriate provider for a URI
	 */
	private getProvider(uri: string): FileSystemProvider {
		const scheme = this.getScheme(uri);
		const provider = this.providers.get(scheme);
		if (!provider) {
			throw new Error(`No file system provider registered for scheme: ${scheme}`);
		}
		return provider;
	}

	/**
	 * Extract scheme from URI
	 */
	private getScheme(uri: string): string {
		const colonIndex = uri.indexOf(':');
		return colonIndex > 0 ? uri.substring(0, colonIndex) : 'file';
	}

	/**
	 * Read file content
	 */
	async readFile(uri: string, options?: FileSystemOptions): Promise<string | Uint8Array> {
		try {
			const provider = this.getProvider(uri);
			const content = await provider.readFile(uri, options);
			this.emit('fileRead', { uri, content });
			return content;
		} catch (error) {
			this.emit('error', { operation: 'readFile', uri, error });
			throw error;
		}
	}

	/**
	 * Write content to file
	 */
	async writeFile(uri: string, content: string | Uint8Array, options?: FileSystemOptions): Promise<void> {
		try {
			const provider = this.getProvider(uri);
			await provider.writeFile(uri, content, options);
			this.emit('fileWritten', { uri, content });
		} catch (error) {
			this.emit('error', { operation: 'writeFile', uri, error });
			throw error;
		}
	}

	/**
	 * Create a new file with content
	 */
	async createFile(uri: string, content: string = '', options?: FileSystemOptions): Promise<void> {
		if (await this.exists(uri) && !options?.overwrite) {
			throw new Error(`File already exists: ${uri}`);
		}
		return this.writeFile(uri, content, options);
	}

	/**
	 * Create a directory
	 */
	async createDirectory(uri: string, options?: FileSystemOptions): Promise<void> {
		try {
			const provider = this.getProvider(uri);
			await provider.createDirectory(uri, options);
			this.emit('directoryCreated', { uri });
		} catch (error) {
			this.emit('error', { operation: 'createDirectory', uri, error });
			throw error;
		}
	}

	/**
	 * Delete a file or directory
	 */
	async delete(uri: string, options?: FileSystemOptions): Promise<void> {
		try {
			const provider = this.getProvider(uri);
			await provider.delete(uri, options);
			this.emit('fileDeleted', { uri });
		} catch (error) {
			this.emit('error', { operation: 'delete', uri, error });
			throw error;
		}
	}

	/**
	 * Rename/move a file or directory
	 */
	async rename(oldUri: string, newUri: string): Promise<void> {
		try {
			const provider = this.getProvider(oldUri);
			await provider.rename(oldUri, newUri);
			this.emit('fileRenamed', { oldUri, newUri });
		} catch (error) {
			this.emit('error', { operation: 'rename', uri: oldUri, error });
			throw error;
		}
	}

	/**
	 * Check if file or directory exists
	 */
	async exists(uri: string): Promise<boolean> {
		try {
			const provider = this.getProvider(uri);
			return await provider.exists(uri);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get file/directory information
	 */
	async stat(uri: string): Promise<FileSystemEntry> {
		try {
			const provider = this.getProvider(uri);
			return await provider.stat(uri);
		} catch (error) {
			this.emit('error', { operation: 'stat', uri, error });
			throw error;
		}
	}

	/**
	 * List directory contents
	 */
	async readDirectory(uri: string): Promise<FileSystemEntry[]> {
		try {
			const provider = this.getProvider(uri);
			const entries = await provider.readDirectory(uri);
			this.emit('directoryRead', { uri, entries });
			return entries;
		} catch (error) {
			this.emit('error', { operation: 'readDirectory', uri, error });
			throw error;
		}
	}

	/**
	 * Watch for changes in a file or directory
	 */
	watchFile(uri: string, callback: (event: FileSystemChangeEvent) => void): FileSystemWatcher {
		const provider = this.getProvider(uri);
		const watcher = provider.watch(uri, (event) => {
			this.emit('fileChanged', event);
			callback(event);
		});

		// Track watchers for cleanup
		if (!this.watchers.has(uri)) {
			this.watchers.set(uri, new Set());
		}
		this.watchers.get(uri)!.add(watcher);

		return {
			dispose: () => {
				watcher.dispose();
				const uriWatchers = this.watchers.get(uri);
				if (uriWatchers) {
					uriWatchers.delete(watcher);
					if (uriWatchers.size === 0) {
						this.watchers.delete(uri);
					}
				}
			}
		};
	}

	/**
	 * Get all files in a directory recursively
	 */
	async getAllFiles(uri: string, filter?: (entry: FileSystemEntry) => boolean): Promise<FileSystemEntry[]> {
		const result: FileSystemEntry[] = [];

		async function traverse(currentUri: string, vfs: VirtualFileSystem) {
			try {
				const entries = await vfs.readDirectory(currentUri);
				for (const entry of entries) {
					if (entry.type === 'file') {
						if (!filter || filter(entry)) {
							result.push(entry);
						}
					} else if (entry.type === 'directory') {
						await traverse(entry.uri, vfs);
					}
				}
			} catch (error) {
				// Ignore permission errors or inaccessible directories
			}
		}

		await traverse(uri, this);
		return result;
	}

	/**
	 * Copy a file or directory
	 */
	async copy(sourceUri: string, targetUri: string, options?: FileSystemOptions): Promise<void> {
		const sourceEntry = await this.stat(sourceUri);

		if (sourceEntry.type === 'file') {
			const content = await this.readFile(sourceUri, options);
			await this.writeFile(targetUri, content, options);
		} else {
			await this.createDirectory(targetUri, options);
			const children = await this.readDirectory(sourceUri);

			for (const child of children) {
				const childTargetUri = `${targetUri}/${child.name}`;
				await this.copy(child.uri, childTargetUri, options);
			}
		}
	}

	/**
	 * Search for files matching a pattern
	 */
	async findFiles(rootUri: string, pattern: RegExp | string): Promise<FileSystemEntry[]> {
		const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
		return this.getAllFiles(rootUri, (entry) => regex.test(entry.name));
	}

	/**
	 * Clean up all watchers and resources
	 */
	dispose(): void {
		for (const watchers of this.watchers.values()) {
			for (const watcher of watchers) {
				watcher.dispose();
			}
		}
		this.watchers.clear();
		this.eventListeners.clear();
	}
}

/**
 * Create a default virtual file system instance
 */
export function createVirtualFileSystem(): VirtualFileSystem {
	return new VirtualFileSystem();
}
