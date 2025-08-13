// Browser-compatible configuration service (replacement for Node.js file-based config)

import type { Disposable } from '../utils/events';
import { EventEmitter } from '../utils/events';

// Configuration value types
export type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue };

// Configuration change event
export interface ConfigurationChangeEvent {
	keys: string[];
	source: 'user' | 'default' | 'system';
}

// Configuration section interface
export interface IConfigurationSection {
	get<T extends ConfigValue>(key: string): T | undefined;
	get<T extends ConfigValue>(key: string, defaultValue: T): T;
	set(key: string, value: ConfigValue): Promise<void>;
	has(key: string): boolean;
	remove(key: string): Promise<void>;
	keys(): string[];
}

// Main configuration service interface
export interface IConfigurationService extends Disposable {
	readonly onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;

	getSection(section: string): IConfigurationSection;
	get<T extends ConfigValue>(key: string): T | undefined;
	get<T extends ConfigValue>(key: string, defaultValue: T): T;
	set(key: string, value: ConfigValue, source?: 'user' | 'system'): Promise<void>;
	has(key: string): boolean;
	remove(key: string): Promise<void>;
	getAllKeys(): string[];
	exportConfiguration(): Record<string, ConfigValue>;
	importConfiguration(config: Record<string, ConfigValue>): Promise<void>;
	reset(): Promise<void>;
}

// Browser configuration service implementation
export class BrowserConfigurationService implements IConfigurationService {
	private static readonly STORAGE_KEY = 'vue-ai-assistant-config';
	private static readonly DEFAULTS_KEY = 'vue-ai-assistant-defaults';

	private _onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
	public readonly onDidChangeConfiguration = this._onDidChangeConfiguration;

	private userConfig = new Map<string, ConfigValue>();
	private defaultConfig = new Map<string, ConfigValue>();

	constructor() {
		this.loadConfiguration();
		this.setupStorageListener();
	}

	public getSection(section: string): IConfigurationSection {
		return new BrowserConfigurationSection(this, section);
	}

	public get<T extends ConfigValue>(key: string): T | undefined;
	public get<T extends ConfigValue>(key: string, defaultValue: T): T;
	public get<T extends ConfigValue>(key: string, defaultValue?: T): T | undefined {
		// Check user config first
		if (this.userConfig.has(key)) {
			return this.userConfig.get(key) as T;
		}

		// Check default config
		if (this.defaultConfig.has(key)) {
			return this.defaultConfig.get(key) as T;
		}

		return defaultValue;
	}

	public async set(key: string, value: ConfigValue, source: 'user' | 'system' = 'user'): Promise<void> {
		const targetMap = source === 'user' ? this.userConfig : this.defaultConfig;
		const oldValue = targetMap.get(key);

		if (oldValue === value) {
			return; // No change
		}

		targetMap.set(key, value);

		// Persist user config
		if (source === 'user') {
			await this.persistUserConfiguration();
		} else {
			await this.persistDefaultConfiguration();
		}

		// Emit change event
		this._onDidChangeConfiguration.emit({
			keys: [key],
			source
		});
	}

	public has(key: string): boolean {
		return this.userConfig.has(key) || this.defaultConfig.has(key);
	}

	public async remove(key: string): Promise<void> {
		const hadUserValue = this.userConfig.has(key);

		if (hadUserValue) {
			this.userConfig.delete(key);
			await this.persistUserConfiguration();

			this._onDidChangeConfiguration.emit({
				keys: [key],
				source: 'user'
			});
		}
	}

	public getAllKeys(): string[] {
		const keys = new Set<string>();

		for (const key of this.defaultConfig.keys()) {
			keys.add(key);
		}

		for (const key of this.userConfig.keys()) {
			keys.add(key);
		}

		return Array.from(keys);
	}

	public exportConfiguration(): Record<string, ConfigValue> {
		const result: Record<string, ConfigValue> = {};

		// Add defaults first
		for (const [key, value] of this.defaultConfig.entries()) {
			result[key] = value;
		}

		// Override with user values
		for (const [key, value] of this.userConfig.entries()) {
			result[key] = value;
		}

		return result;
	}

	public async importConfiguration(config: Record<string, ConfigValue>): Promise<void> {
		const changedKeys: string[] = [];

		for (const [key, value] of Object.entries(config)) {
			const oldValue = this.userConfig.get(key);
			if (oldValue !== value) {
				this.userConfig.set(key, value);
				changedKeys.push(key);
			}
		}

		if (changedKeys.length > 0) {
			await this.persistUserConfiguration();
			this._onDidChangeConfiguration.emit({
				keys: changedKeys,
				source: 'user'
			});
		}
	}

	public async reset(): Promise<void> {
		const userKeys = Array.from(this.userConfig.keys());
		this.userConfig.clear();

		await this.persistUserConfiguration();

		if (userKeys.length > 0) {
			this._onDidChangeConfiguration.emit({
				keys: userKeys,
				source: 'user'
			});
		}
	}

	public setDefaults(defaults: Record<string, ConfigValue>): void {
		const changedKeys: string[] = [];

		for (const [key, value] of Object.entries(defaults)) {
			const oldValue = this.defaultConfig.get(key);
			if (oldValue !== value) {
				this.defaultConfig.set(key, value);
				changedKeys.push(key);
			}
		}

		if (changedKeys.length > 0) {
			this.persistDefaultConfiguration();
			this._onDidChangeConfiguration.emit({
				keys: changedKeys,
				source: 'default'
			});
		}
	}

	private loadConfiguration(): void {
		try {
			// Load user configuration
			const userConfigJson = localStorage.getItem(BrowserConfigurationService.STORAGE_KEY);
			if (userConfigJson) {
				const userConfigObj = JSON.parse(userConfigJson);
				for (const [key, value] of Object.entries(userConfigObj)) {
					this.userConfig.set(key, value as ConfigValue);
				}
			}

			// Load default configuration
			const defaultConfigJson = localStorage.getItem(BrowserConfigurationService.DEFAULTS_KEY);
			if (defaultConfigJson) {
				const defaultConfigObj = JSON.parse(defaultConfigJson);
				for (const [key, value] of Object.entries(defaultConfigObj)) {
					this.defaultConfig.set(key, value as ConfigValue);
				}
			}
		} catch (error) {
			console.error('Failed to load configuration:', error);
		}
	}

	private async persistUserConfiguration(): Promise<void> {
		try {
			const configObj: Record<string, ConfigValue> = {};
			for (const [key, value] of this.userConfig.entries()) {
				configObj[key] = value;
			}
			localStorage.setItem(BrowserConfigurationService.STORAGE_KEY, JSON.stringify(configObj));
		} catch (error) {
			console.error('Failed to persist user configuration:', error);
		}
	}

	private async persistDefaultConfiguration(): Promise<void> {
		try {
			const configObj: Record<string, ConfigValue> = {};
			for (const [key, value] of this.defaultConfig.entries()) {
				configObj[key] = value;
			}
			localStorage.setItem(BrowserConfigurationService.DEFAULTS_KEY, JSON.stringify(configObj));
		} catch (error) {
			console.error('Failed to persist default configuration:', error);
		}
	}

	private setupStorageListener(): void {
		// Listen for storage changes from other tabs/windows
		window.addEventListener('storage', (event) => {
			if (event.key === BrowserConfigurationService.STORAGE_KEY && event.newValue) {
				try {
					const newConfig = JSON.parse(event.newValue);
					const changedKeys: string[] = [];

					// Update our in-memory config
					this.userConfig.clear();
					for (const [key, value] of Object.entries(newConfig)) {
						this.userConfig.set(key, value as ConfigValue);
						changedKeys.push(key);
					}

					if (changedKeys.length > 0) {
						this._onDidChangeConfiguration.emit({
							keys: changedKeys,
							source: 'user'
						});
					}
				} catch (error) {
					console.error('Failed to handle storage change:', error);
				}
			}
		});
	}

	public dispose(): void {
		this._onDidChangeConfiguration.dispose();
	}
}

// Configuration section implementation
class BrowserConfigurationSection implements IConfigurationSection {
	constructor(
		private configService: IConfigurationService,
		private sectionPrefix: string
	) { }

	private getFullKey(key: string): string {
		return `${this.sectionPrefix}.${key}`;
	}

	public get<T extends ConfigValue>(key: string): T | undefined;
	public get<T extends ConfigValue>(key: string, defaultValue: T): T;
	public get<T extends ConfigValue>(key: string, defaultValue?: T): T | undefined {
		return this.configService.get(this.getFullKey(key), defaultValue as any);
	}

	public async set(key: string, value: ConfigValue): Promise<void> {
		return this.configService.set(this.getFullKey(key), value);
	}

	public has(key: string): boolean {
		return this.configService.has(this.getFullKey(key));
	}

	public async remove(key: string): Promise<void> {
		return this.configService.remove(this.getFullKey(key));
	}

	public keys(): string[] {
		const prefix = this.sectionPrefix + '.';
		return this.configService.getAllKeys()
			.filter(key => key.startsWith(prefix))
			.map(key => key.substring(prefix.length));
	}
}

// Service identifier for dependency injection
export const IConfigurationServiceId = 'IConfigurationService';
