// Main application bootstrapper demonstrating the complete service architecture

import { BrowserPlatformAbstraction } from '../platform/platformAbstraction';
import { BrowserStorageService } from '../platform/storage';
import { PLATFORM_ABSTRACTION_KEY, STORAGE_SERVICE_KEY } from '../utils/composables';
import type { Disposable } from '../utils/events';
import { BrowserConfigurationService, IConfigurationServiceId } from './configuration';
import { BrowserErrorHandlerService, IErrorHandlerServiceId } from './errorHandling';
import { BrowserInstantiationService, ServiceCollection, createServiceIdentifier } from './instantiation';
import { BrowserLifecycleManager, LifecycleState } from './lifecycle';
import { BrowserServiceRegistry, type IServiceRegistry } from './serviceRegistry';

// Application context interface
export interface IApplicationContext {
	readonly instantiationService: BrowserInstantiationService;
	readonly lifecycleManager: BrowserLifecycleManager;
	readonly errorHandler: BrowserErrorHandlerService;
	readonly serviceRegistry: IServiceRegistry;
	readonly configurationService: BrowserConfigurationService;
	readonly platformAbstraction: BrowserPlatformAbstraction;
}

// Application configuration interface
export interface ApplicationConfig {
	// Platform configuration
	platform?: {
		hostInterface?: any;
	};

	// Error handling configuration
	errorHandling?: {
		maxErrorQueueSize?: number;
		enableGlobalHandlers?: boolean;
	};

	// Configuration defaults
	defaults?: Record<string, any>;

	// Service registration options
	services?: Array<{
		id: string;
		factory: (context: IApplicationContext) => any;
		metadata: {
			name: string;
			description?: string;
			dependencies?: string[];
			lazy?: boolean;
		};
	}>;
}

// Main application class
export class VueAIAssistantApplication implements Disposable {
	private context!: IApplicationContext;
	private disposables: Disposable[] = [];

	public async initialize(config: ApplicationConfig = {}): Promise<IApplicationContext> {
		try {
			// 1. Create core services
			const serviceCollection = new ServiceCollection();
			const instantiationService = new BrowserInstantiationService(serviceCollection);
			const lifecycleManager = new BrowserLifecycleManager();
			const errorHandler = new BrowserErrorHandlerService();

			// 2. Create platform abstraction
			const platformAbstraction = new BrowserPlatformAbstraction(
				config.platform?.hostInterface || this.createDefaultHostInterface()
			);

			// 3. Create configuration service with defaults
			const configurationService = new BrowserConfigurationService();
			if (config.defaults) {
				configurationService.setDefaults(config.defaults);
			}

			// 4. Create storage service
			const storageService = new BrowserStorageService();

			// 5. Create service registry
			const serviceRegistry = new BrowserServiceRegistry(
				instantiationService,
				lifecycleManager,
				errorHandler
			);

			// 6. Register core services with DI container
			serviceCollection.setInstance(
				createServiceIdentifier<BrowserErrorHandlerService>(IErrorHandlerServiceId),
				errorHandler
			);

			serviceCollection.setInstance(
				createServiceIdentifier<BrowserConfigurationService>(IConfigurationServiceId),
				configurationService
			);

			serviceCollection.setInstance(
				createServiceIdentifier<BrowserStorageService>(STORAGE_SERVICE_KEY.toString()),
				storageService
			);

			serviceCollection.setInstance(
				createServiceIdentifier<BrowserPlatformAbstraction>(PLATFORM_ABSTRACTION_KEY.toString()),
				platformAbstraction
			);

			// 7. Register custom services
			if (config.services) {
				for (const serviceConfig of config.services) {
					const serviceId = createServiceIdentifier<any>(serviceConfig.id);
					serviceRegistry.register(serviceId, {
						metadata: {
							...serviceConfig.metadata,
							id: serviceConfig.id
						},
						factory: (accessor) => serviceConfig.factory(this.context)
					});
				}
			}

			// 8. Create application context
			this.context = {
				instantiationService,
				lifecycleManager,
				errorHandler,
				serviceRegistry,
				configurationService,
				platformAbstraction
			};

			// 9. Track disposables
			this.disposables.push(
				instantiationService,
				lifecycleManager,
				errorHandler,
				serviceRegistry,
				configurationService,
				storageService
			);

			// 10. Set up error handling
			this.setupErrorHandling();

			errorHandler.getLogger('Application').info('Application initialized successfully');

			return this.context;
		} catch (error) {
			throw new Error(`Failed to initialize application: ${error}`);
		}
	}

	public async start(): Promise<void> {
		if (!this.context) {
			throw new Error('Application not initialized. Call initialize() first.');
		}

		try {
			this.context.errorHandler.getLogger('Application').info('Starting application...');

			await this.context.lifecycleManager.start();

			this.context.errorHandler.getLogger('Application').info('Application started successfully');
		} catch (error) {
			this.context.errorHandler.getLogger('Application').critical(
				'Failed to start application',
				error as Error
			);
			throw error;
		}
	}

	public async stop(): Promise<void> {
		if (!this.context) {
			return;
		}

		try {
			this.context.errorHandler.getLogger('Application').info('Stopping application...');

			await this.context.lifecycleManager.stop();

			this.context.errorHandler.getLogger('Application').info('Application stopped successfully');
		} catch (error) {
			this.context.errorHandler.getLogger('Application').error(
				'Error stopping application',
				error as Error
			);
			throw error;
		}
	}

	public getContext(): IApplicationContext {
		if (!this.context) {
			throw new Error('Application not initialized');
		}
		return this.context;
	}

	public isRunning(): boolean {
		return this.context?.lifecycleManager.currentState === LifecycleState.Started;
	}

	private setupErrorHandling(): void {
		// Listen for lifecycle errors
		this.context.lifecycleManager.events.onError.on((error) => {
			this.context.errorHandler.getLogger('Lifecycle').critical(
				'Lifecycle error occurred',
				error
			);
		});

		// Listen for service registry errors
		this.context.serviceRegistry.events.onServiceFailed.on(({ id, error }) => {
			this.context.errorHandler.getLogger('ServiceRegistry').error(
				`Service '${id}' failed`,
				error
			);
		});

		// Log configuration changes
		this.context.configurationService.onDidChangeConfiguration.on((event) => {
			this.context.errorHandler.getLogger('Configuration').info(
				`Configuration changed: ${event.keys.join(', ')}`,
				{ source: event.source, keys: event.keys }
			);
		});
	}

	private createDefaultHostInterface(): any {
		// Default host interface for demo/testing purposes
		return {
			readFile: async (path: string) => {
				return `// Mock file content for: ${path}\nconsole.log('Mock file');`;
			},
			writeFile: async (path: string, content: string) => {
				console.log(`Mock write to ${path}:`, content);
			},
			getActiveEditor: () => ({
				uri: 'mock-file.js',
				languageId: 'javascript',
				getText: () => 'mock content',
				getSelection: () => ({ start: 0, end: 0 }),
				getCursorPosition: () => 0,
				replaceText: async () => { },
				insertText: async () => { },
				setSelection: async () => { },
				setCursorPosition: async () => { },
				onDidChangeTextDocument: { on: () => ({ dispose: () => { } }) },
				onDidChangeSelection: { on: () => ({ dispose: () => { } }) }
			}),
			showMessage: (message: string, type: string) => {
				console.log(`[${type.toUpperCase()}] ${message}`);
			},
			showDocument: async (uri: string) => {
				console.log(`Mock show document: ${uri}`);
				return this.createDefaultHostInterface().getActiveEditor();
			},
			showQuickPick: async (items: any[]) => {
				return items[0]; // Return first item for demo
			}
		};
	}

	public async dispose(): Promise<void> {
		// Stop if running
		if (this.isRunning()) {
			try {
				await this.stop();
			} catch (error) {
				console.error('Error stopping application during disposal:', error);
			}
		}

		// Dispose all services
		for (const disposable of this.disposables) {
			try {
				disposable.dispose();
			} catch (error) {
				console.error('Error disposing service:', error);
			}
		}

		this.disposables = [];
	}
}

// Factory function for easy application creation
export function createVueAIAssistantApplication(config?: ApplicationConfig): VueAIAssistantApplication {
	return new VueAIAssistantApplication();
}

// Default configuration
export const DEFAULT_APPLICATION_CONFIG: ApplicationConfig = {
	defaults: {
		'ai.model': 'gpt-4',
		'ai.temperature': 0.7,
		'ai.maxTokens': 2048,
		'editor.fontSize': 14,
		'editor.theme': 'vs-dark',
		'chat.historyLimit': 100,
		'tools.enabled': true,
		'debug.enabled': false
	},
	errorHandling: {
		maxErrorQueueSize: 1000,
		enableGlobalHandlers: true
	}
};
