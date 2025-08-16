import type { FileSystemChangeEvent, FileSystemEntry, FileSystemOptions, FileSystemProvider, FileSystemWatcher } from './virtualFileSystem';

/**
 * In-memory file system provider for testing and development
 * Stores files in memory with a tree structure
 */
export class MemoryFileSystemProvider implements FileSystemProvider {
	private files = new Map<string, FileSystemEntry>();
	private watchers = new Map<string, Set<(event: FileSystemChangeEvent) => void>>();

	constructor() {
		// Create root directory
		this.files.set('/', {
			uri: '/',
			name: '',
			type: 'directory',
			lastModified: new Date(),
			children: []
		});
	}

	/**
	 * Parse URI to get path components
	 */
	private parsePath(uri: string): string[] {
		// Remove scheme if present (memory:/path -> /path)
		const path = uri.replace(/^memory:/, '');
		return path.split('/').filter(part => part.length > 0);
	}

	/**
	 * Get normalized path from URI
	 */
	private getNormalizedPath(uri: string): string {
		const path = uri.replace(/^memory:/, '');
		return path === '' ? '/' : path;
	}

	/**
	 * Get parent directory path
	 */
	private getParentPath(path: string): string {
		if (path === '/') return '/';
		const lastSlash = path.lastIndexOf('/');
		return lastSlash <= 0 ? '/' : path.substring(0, lastSlash);
	}

	/**
	 * Get file name from path
	 */
	private getFileName(path: string): string {
		if (path === '/') return '';
		const lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
	}

	/**
	 * Emit change event to watchers
	 */
	private emitChange(event: FileSystemChangeEvent): void {
		// Notify watchers for the specific path
		const watchers = this.watchers.get(event.uri);
		if (watchers) {
			watchers.forEach(callback => {
				try {
					callback(event);
				} catch (error) {
					console.error('Error in file watcher callback:', error);
				}
			});
		}

		// Notify watchers for parent directories
		let parentPath = this.getParentPath(event.uri);
		while (parentPath !== event.uri) {
			const parentWatchers = this.watchers.get(parentPath);
			if (parentWatchers) {
				parentWatchers.forEach(callback => {
					try {
						callback(event);
					} catch (error) {
						console.error('Error in parent directory watcher callback:', error);
					}
				});
			}
			if (parentPath === '/') break;
			parentPath = this.getParentPath(parentPath);
		}
	}

	async readFile(uri: string, options?: FileSystemOptions): Promise<string | Uint8Array> {
		const path = this.getNormalizedPath(uri);
		const entry = this.files.get(path);

		if (!entry) {
			throw new Error(`File not found: ${uri}`);
		}

		if (entry.type !== 'file') {
			throw new Error(`Not a file: ${uri}`);
		}

		const content = entry.content || '';

		if (options?.encoding === 'base64') {
			return btoa(content);
		} else if (options?.encoding === 'binary') {
			return new TextEncoder().encode(content);
		}

		return content;
	}

	async writeFile(uri: string, content: string | Uint8Array, options?: FileSystemOptions): Promise<void> {
		const path = this.getNormalizedPath(uri);
		const parentPath = this.getParentPath(path);
		const fileName = this.getFileName(path);

		// Ensure parent directory exists
		if (options?.createDirectories && parentPath !== '/') {
			await this.ensureDirectoryExists(parentPath);
		}

		const parent = this.files.get(parentPath);
		if (!parent || parent.type !== 'directory') {
			throw new Error(`Parent directory not found: ${parentPath}`);
		}

		// Convert content to string
		let stringContent: string;
		if (content instanceof Uint8Array) {
			stringContent = new TextDecoder().decode(content);
		} else {
			stringContent = content;
		}

		const now = new Date();
		const existingEntry = this.files.get(path);
		const isNew = !existingEntry;

		const entry: FileSystemEntry = {
			uri: path,
			name: fileName,
			type: 'file',
			size: stringContent.length,
			lastModified: now,
			encoding: options?.encoding || 'utf8',
			content: stringContent
		};

		this.files.set(path, entry);

		// Update parent directory
		if (!parent.children) {
			parent.children = [];
		}

		const existingIndex = parent.children.findIndex(child => child.name === fileName);
		if (existingIndex >= 0) {
			parent.children[existingIndex] = entry;
		} else {
			parent.children.push(entry);
		}

		// Emit change event
		this.emitChange({
			type: isNew ? 'created' : 'modified',
			uri: path,
			entry
		});
	}

	async createDirectory(uri: string, options?: FileSystemOptions): Promise<void> {
		const path = this.getNormalizedPath(uri);
		const parentPath = this.getParentPath(path);
		const dirName = this.getFileName(path);

		// Ensure parent directory exists if recursive
		if (options?.recursive && parentPath !== '/') {
			await this.ensureDirectoryExists(parentPath);
		}

		const parent = this.files.get(parentPath);
		if (!parent || parent.type !== 'directory') {
			throw new Error(`Parent directory not found: ${parentPath}`);
		}

		// Check if directory already exists
		if (this.files.has(path)) {
			if (!options?.overwrite) {
				throw new Error(`Directory already exists: ${uri}`);
			}
		}

		const entry: FileSystemEntry = {
			uri: path,
			name: dirName,
			type: 'directory',
			lastModified: new Date(),
			children: []
		};

		this.files.set(path, entry);

		// Update parent directory
		if (!parent.children) {
			parent.children = [];
		}

		const existingIndex = parent.children.findIndex(child => child.name === dirName);
		if (existingIndex >= 0) {
			parent.children[existingIndex] = entry;
		} else {
			parent.children.push(entry);
		}

		// Emit change event
		this.emitChange({
			type: 'created',
			uri: path,
			entry
		});
	}

	async delete(uri: string, options?: FileSystemOptions): Promise<void> {
		const path = this.getNormalizedPath(uri);
		const entry = this.files.get(path);

		if (!entry) {
			throw new Error(`File or directory not found: ${uri}`);
		}

		// If it's a directory, check if it's empty or if recursive delete is allowed
		if (entry.type === 'directory') {
			const children = entry.children || [];
			if (children.length > 0 && !options?.recursive) {
				throw new Error(`Directory not empty: ${uri}`);
			}

			// Recursively delete children
			if (options?.recursive) {
				for (const child of children) {
					await this.delete(child.uri, options);
				}
			}
		}

		// Remove from parent directory
		const parentPath = this.getParentPath(path);
		const parent = this.files.get(parentPath);
		if (parent && parent.children) {
			parent.children = parent.children.filter(child => child.uri !== path);
		}

		// Remove from files map
		this.files.delete(path);

		// Emit change event
		this.emitChange({
			type: 'deleted',
			uri: path,
			entry
		});
	}

	async rename(oldUri: string, newUri: string): Promise<void> {
		const oldPath = this.getNormalizedPath(oldUri);
		const newPath = this.getNormalizedPath(newUri);

		const entry = this.files.get(oldPath);
		if (!entry) {
			throw new Error(`File or directory not found: ${oldUri}`);
		}

		// Check if target already exists
		if (this.files.has(newPath)) {
			throw new Error(`Target already exists: ${newUri}`);
		}

		// Update entry
		const newName = this.getFileName(newPath);
		const updatedEntry: FileSystemEntry = {
			...entry,
			uri: newPath,
			name: newName,
			lastModified: new Date()
		};

		// Update files map
		this.files.delete(oldPath);
		this.files.set(newPath, updatedEntry);

		// Update parent directories
		const oldParentPath = this.getParentPath(oldPath);
		const newParentPath = this.getParentPath(newPath);

		// Remove from old parent
		const oldParent = this.files.get(oldParentPath);
		if (oldParent && oldParent.children) {
			oldParent.children = oldParent.children.filter(child => child.uri !== oldPath);
		}

		// Add to new parent
		const newParent = this.files.get(newParentPath);
		if (newParent && newParent.children) {
			newParent.children.push(updatedEntry);
		}

		// Emit change event
		this.emitChange({
			type: 'renamed',
			uri: newPath,
			oldUri: oldPath,
			entry: updatedEntry
		});
	}

	async exists(uri: string): Promise<boolean> {
		const path = this.getNormalizedPath(uri);
		return this.files.has(path);
	}

	async stat(uri: string): Promise<FileSystemEntry> {
		const path = this.getNormalizedPath(uri);
		const entry = this.files.get(path);

		if (!entry) {
			throw new Error(`File or directory not found: ${uri}`);
		}

		return { ...entry };
	}

	async readDirectory(uri: string): Promise<FileSystemEntry[]> {
		const path = this.getNormalizedPath(uri);
		const entry = this.files.get(path);

		if (!entry) {
			throw new Error(`Directory not found: ${uri}`);
		}

		if (entry.type !== 'directory') {
			throw new Error(`Not a directory: ${uri}`);
		}

		return [...(entry.children || [])];
	}

	watch(uri: string, callback: (event: FileSystemChangeEvent) => void): FileSystemWatcher {
		const path = this.getNormalizedPath(uri);

		if (!this.watchers.has(path)) {
			this.watchers.set(path, new Set());
		}

		this.watchers.get(path)!.add(callback);

		return {
			dispose: () => {
				const pathWatchers = this.watchers.get(path);
				if (pathWatchers) {
					pathWatchers.delete(callback);
					if (pathWatchers.size === 0) {
						this.watchers.delete(path);
					}
				}
			}
		};
	}

	/**
	 * Ensure directory exists, creating parent directories as needed
	 */
	private async ensureDirectoryExists(path: string): Promise<void> {
		if (this.files.has(path)) {
			return;
		}

		const parentPath = this.getParentPath(path);
		if (parentPath !== path && parentPath !== '/') {
			await this.ensureDirectoryExists(parentPath);
		}

		await this.createDirectory(`memory:${path}`, { recursive: true });
	}

	/**
	 * Clear all files (useful for testing)
	 */
	clear(): void {
		this.files.clear();
		this.watchers.clear();

		// Recreate root directory
		this.files.set('/', {
			uri: '/',
			name: '',
			type: 'directory',
			lastModified: new Date(),
			children: []
		});
	}

	/**
	 * Get all files as a flat array (useful for debugging)
	 */
	getAllFiles(): FileSystemEntry[] {
		return Array.from(this.files.values());
	}
}
