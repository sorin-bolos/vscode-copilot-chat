import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPLICATION_CONFIG, VueAIAssistantApplication } from '../application';
import { ErrorSeverity } from '../errorHandling';
import { LifecycleState } from '../lifecycle';
import { ServiceStatus } from '../serviceRegistry';

describe('Core Service Architecture', () => {
	let app: VueAIAssistantApplication;

	beforeEach(() => {
		app = new VueAIAssistantApplication();
	});

	afterEach(async () => {
		if (app) {
			await app.dispose();
		}
	});

	it('should initialize application with all core services', async () => {
		const context = await app.initialize(DEFAULT_APPLICATION_CONFIG);

		// Verify all services are available
		expect(context.instantiationService).toBeDefined();
		expect(context.lifecycleManager).toBeDefined();
		expect(context.errorHandler).toBeDefined();
		expect(context.serviceRegistry).toBeDefined();
		expect(context.configurationService).toBeDefined();
		expect(context.platformAbstraction).toBeDefined();

		// Verify lifecycle state
		expect(context.lifecycleManager.currentState).toBe(LifecycleState.Stopped);
	});

	it('should start and stop application lifecycle', async () => {
		const context = await app.initialize();

		// Start application
		await app.start();
		expect(app.isRunning()).toBe(true);
		expect(context.lifecycleManager.currentState).toBe(LifecycleState.Started);

		// Stop application
		await app.stop();
		expect(app.isRunning()).toBe(false);
		expect(context.lifecycleManager.currentState).toBe(LifecycleState.Stopped);
	});

	it('should handle configuration changes', async () => {
		const context = await app.initialize();
		const config = context.configurationService;

		// Test setting and getting configuration
		await config.set('test.value', 42);
		expect(config.get('test.value')).toBe(42);

		// Test default values
		expect(config.get('ai.model')).toBe('gpt-4');
		expect(config.get('ai.temperature')).toBe(0.7);

		// Test configuration sections
		const aiSection = config.getSection('ai');
		expect(aiSection.get('model')).toBe('gpt-4');
		expect(aiSection.get('temperature')).toBe(0.7);
	});

	it('should handle error reporting and logging', async () => {
		const context = await app.initialize();
		const errorHandler = context.errorHandler;

		const errors: any[] = [];
		errorHandler.onError.on((error) => {
			errors.push(error);
		});

		// Test error reporting
		errorHandler.reportError('Test error', ErrorSeverity.Error);

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe('Test error');
		expect(errors[0].severity).toBe(ErrorSeverity.Error);

		// Test logger
		const logger = errorHandler.getLogger('Test');
		logger.warn('Test warning');

		expect(errors).toHaveLength(2);
		expect(errors[1].severity).toBe(ErrorSeverity.Warning);
	});

	it('should register and manage custom services', async () => {
		let customServiceCalled = false;

		const config = {
			...DEFAULT_APPLICATION_CONFIG,
			services: [{
				id: 'custom-service',
				factory: () => {
					customServiceCalled = true;
					return {
						doSomething: () => 'custom service result'
					};
				},
				metadata: {
					name: 'Custom Service',
					description: 'A test service',
					lazy: false
				}
			}]
		};

		const context = await app.initialize(config);
		await app.start();

		// Verify service was registered
		const serviceRegistry = context.serviceRegistry;
		const services = serviceRegistry.getAllServices();

		const customService = services.find(s => s.id === 'custom-service');
		expect(customService).toBeDefined();
		expect(customService?.status).toBe(ServiceStatus.Running);

		// Verify service was instantiated (because lazy: false)
		expect(customServiceCalled).toBe(true);
	});

	it('should handle service dependencies correctly', async () => {
		const instantiationOrder: string[] = [];

		const config = {
			services: [{
				id: 'service-a',
				factory: () => {
					instantiationOrder.push('service-a');
					return { name: 'Service A' };
				},
				metadata: {
					name: 'Service A',
					lazy: false
				}
			}, {
				id: 'service-b',
				factory: () => {
					instantiationOrder.push('service-b');
					return { name: 'Service B' };
				},
				metadata: {
					name: 'Service B',
					dependencies: ['service-a'],
					lazy: false
				}
			}]
		};

		const context = await app.initialize(config);
		await app.start();

		// Verify dependency order
		expect(instantiationOrder).toEqual(['service-a', 'service-b']);
	});

	it('should handle platform abstraction integration', async () => {
		const mockHostInterface = {
			readFile: vi.fn().mockResolvedValue('mock file content'),
			writeFile: vi.fn().mockResolvedValue(undefined),
			getActiveEditor: vi.fn().mockReturnValue({
				uri: 'test.js',
				languageId: 'javascript',
				getText: () => 'test content'
			}),
			showMessage: vi.fn()
		};

		const context = await app.initialize({
			platform: { hostInterface: mockHostInterface }
		});

		// Test platform abstraction
		const platform = context.platformAbstraction;

		const content = await platform.readFile('test.txt');
		expect(content).toBe('mock file content');
		expect(mockHostInterface.readFile).toHaveBeenCalledWith('test.txt');

		await platform.writeFile('test.txt', 'new content');
		expect(mockHostInterface.writeFile).toHaveBeenCalledWith('test.txt', 'new content');

		const editor = platform.getActiveEditor();
		expect(editor?.uri).toBe('test.js');
	});

	it('should persist configuration across instances', async () => {
		// First instance
		const context1 = await app.initialize();
		await context1.configurationService.set('persistent.test', 'test value');
		app.dispose();

		// Second instance should have the same configuration
		const app2 = new VueAIAssistantApplication();
		const context2 = await app2.initialize();

		expect(context2.configurationService.get('persistent.test')).toBe('test value');

		app2.dispose();
	});

	it('should handle disposal correctly', async () => {
		const context = await app.initialize();
		await app.start();

		// Verify running
		expect(app.isRunning()).toBe(true);

		// Dispose and wait for completion
		await app.dispose();

		// Verify stopped
		expect(context.lifecycleManager.currentState).toBe(LifecycleState.Stopped);
	});
});
