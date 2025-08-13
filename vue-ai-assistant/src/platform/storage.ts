// Browser storage services (replacement for VS Code storage APIs)

import type { Disposable } from '../utils/events';

// Storage interfaces
export interface IStorageService {
	get<T>(key: string, defaultValue?: T): T | undefined;
	set(key: string, value: any): Promise<void>;
	remove(key: string): Promise<void>;
	keys(): string[];
	clear(): Promise<void>;
}

export interface ISecureStorageService {
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
}

// Browser localStorage implementation
export class BrowserStorageService implements IStorageService, Disposable {
	private prefix: string;

	constructor(prefix: string = 'vue-copilot-assistant') {
		this.prefix = prefix;
	}

	public get<T>(key: string, defaultValue?: T): T | undefined {
		try {
			const fullKey = this.getFullKey(key);
			const value = localStorage.getItem(fullKey);
			if (value === null) {
				return defaultValue;
			}
			return JSON.parse(value);
		} catch (error) {
			console.error('Error reading from localStorage:', error);
			return defaultValue;
		}
	}

	public async set(key: string, value: any): Promise<void> {
		try {
			const fullKey = this.getFullKey(key);
			const serialized = JSON.stringify(value);
			localStorage.setItem(fullKey, serialized);
		} catch (error) {
			console.error('Error writing to localStorage:', error);
			throw error;
		}
	}

	public async remove(key: string): Promise<void> {
		try {
			const fullKey = this.getFullKey(key);
			localStorage.removeItem(fullKey);
		} catch (error) {
			console.error('Error removing from localStorage:', error);
			throw error;
		}
	}

	public keys(): string[] {
		const keys: string[] = [];
		const prefixWithDot = this.prefix + '.';

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(prefixWithDot)) {
				keys.push(key.substring(prefixWithDot.length));
			}
		}

		return keys;
	}

	public async clear(): Promise<void> {
		const keys = this.keys();
		for (const key of keys) {
			await this.remove(key);
		}
	}

	private getFullKey(key: string): string {
		return `${this.prefix}.${key}`;
	}

	public dispose(): void {
		// Nothing to dispose for localStorage
	}
}

// Browser IndexedDB implementation for large data
export class BrowserIndexedDBService implements IStorageService, Disposable {
	private dbName: string;
	private version: number = 1;
	private db: IDBDatabase | null = null;
	private initPromise: Promise<void> | null = null;

	constructor(dbName: string = 'vue-copilot-assistant') {
		this.dbName = dbName;
	}

	private async ensureDB(): Promise<IDBDatabase> {
		if (this.db) {
			return this.db;
		}

		if (!this.initPromise) {
			this.initPromise = this.openDB();
		}

		await this.initPromise;
		return this.db!;
	}

	private async openDB(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains('storage')) {
					db.createObjectStore('storage', { keyPath: 'key' });
				}
			};
		});
	}

	public get<T>(key: string, defaultValue?: T): T | undefined {
		// IndexedDB is async, so we return undefined and use async methods
		console.warn('IndexedDB get() is async, use getAsync() instead');
		return defaultValue;
	}

	public async getAsync<T>(key: string, defaultValue?: T): Promise<T | undefined> {
		try {
			const db = await this.ensureDB();
			const transaction = db.transaction(['storage'], 'readonly');
			const store = transaction.objectStore('storage');
			const request = store.get(key);

			return new Promise((resolve, reject) => {
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const result = request.result;
					resolve(result ? result.value : defaultValue);
				};
			});
		} catch (error) {
			console.error('Error reading from IndexedDB:', error);
			return defaultValue;
		}
	}

	public async set(key: string, value: any): Promise<void> {
		try {
			const db = await this.ensureDB();
			const transaction = db.transaction(['storage'], 'readwrite');
			const store = transaction.objectStore('storage');
			const request = store.put({ key, value });

			return new Promise((resolve, reject) => {
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		} catch (error) {
			console.error('Error writing to IndexedDB:', error);
			throw error;
		}
	}

	public async remove(key: string): Promise<void> {
		try {
			const db = await this.ensureDB();
			const transaction = db.transaction(['storage'], 'readwrite');
			const store = transaction.objectStore('storage');
			const request = store.delete(key);

			return new Promise((resolve, reject) => {
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		} catch (error) {
			console.error('Error removing from IndexedDB:', error);
			throw error;
		}
	}

	public keys(): string[] {
		console.warn('IndexedDB keys() is async, use keysAsync() instead');
		return [];
	}

	public async keysAsync(): Promise<string[]> {
		try {
			const db = await this.ensureDB();
			const transaction = db.transaction(['storage'], 'readonly');
			const store = transaction.objectStore('storage');
			const request = store.getAllKeys();

			return new Promise((resolve, reject) => {
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result as string[]);
			});
		} catch (error) {
			console.error('Error getting keys from IndexedDB:', error);
			return [];
		}
	}

	public async clear(): Promise<void> {
		try {
			const db = await this.ensureDB();
			const transaction = db.transaction(['storage'], 'readwrite');
			const store = transaction.objectStore('storage');
			const request = store.clear();

			return new Promise((resolve, reject) => {
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve();
			});
		} catch (error) {
			console.error('Error clearing IndexedDB:', error);
			throw error;
		}
	}

	public dispose(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
		this.initPromise = null;
	}
}

// Secure storage using browser crypto APIs (basic implementation)
export class BrowserSecureStorageService implements ISecureStorageService, Disposable {
	private storageKey = 'vue-copilot-assistant-secure';

	public async get(key: string): Promise<string | undefined> {
		try {
			const encryptedData = localStorage.getItem(`${this.storageKey}.${key}`);
			if (!encryptedData) {
				return undefined;
			}
			// In a real implementation, you'd decrypt here
			// For now, we'll just base64 decode as a placeholder
			return atob(encryptedData);
		} catch (error) {
			console.error('Error reading secure storage:', error);
			return undefined;
		}
	}

	public async set(key: string, value: string): Promise<void> {
		try {
			// In a real implementation, you'd encrypt here
			// For now, we'll just base64 encode as a placeholder
			const encryptedData = btoa(value);
			localStorage.setItem(`${this.storageKey}.${key}`, encryptedData);
		} catch (error) {
			console.error('Error writing secure storage:', error);
			throw error;
		}
	}

	public async remove(key: string): Promise<void> {
		try {
			localStorage.removeItem(`${this.storageKey}.${key}`);
		} catch (error) {
			console.error('Error removing from secure storage:', error);
			throw error;
		}
	}

	public dispose(): void {
		// Nothing to dispose
	}
}
