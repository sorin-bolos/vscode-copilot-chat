// Browser-compatible service registry (replacement for Node.js specific services)

import type { Disposable } from '../utils/events';
import { EventEmitter } from '../utils/events';
import type { IErrorHandlerService } from './errorHandling';
import type { IInstantiationService, ServiceAccessor, ServiceIdentifier } from './instantiation';
import type { BrowserLifecycleManager, ILifecycleAware } from './lifecycle';

// Service status
export enum ServiceStatus {
	NotRegistered = 'not-registered',
	Registered = 'registered',
	Starting = 'starting',
	Running = 'running',
	Stopping = 'stopping',
	Stopped = 'stopped',
	Failed = 'failed'
}

// Service metadata
export interface ServiceMetadata {
	id: string;
	name: string;
	description?: string;
	dependencies?: string[];
	optional?: boolean;
	lazy?: boolean;
}

// Service registration options
export interface ServiceRegistrationOptions {
	metadata: ServiceMetadata;
	factory: (accessor: ServiceAccessor) => any;
	dispose?: (instance: any) => void;
}

// Service registry events
export interface ServiceRegistryEvents {
	onServiceRegistered: EventEmitter<string>;
	onServiceStarted: EventEmitter<string>;
	onServiceStopped: EventEmitter<string>;
	onServiceFailed: EventEmitter<{ id: string; error: Error }>;
}

// Main service registry interface
export interface IServiceRegistry extends Disposable {
	readonly events: ServiceRegistryEvents;
	register<T>(id: ServiceIdentifier<T>, options: ServiceRegistrationOptions): void;
	unregister<T>(id: ServiceIdentifier<T>): void;
	get<T>(id: ServiceIdentifier<T>): T | undefined;
	has<T>(id: ServiceIdentifier<T>): boolean;
	getStatus<T>(id: ServiceIdentifier<T>): ServiceStatus;
	getMetadata<T>(id: ServiceIdentifier<T>): ServiceMetadata | undefined;
	getAllServices(): Array<{ id: string; status: ServiceStatus; metadata: ServiceMetadata }>;
	startService<T>(id: ServiceIdentifier<T>): Promise<void>;
	stopService<T>(id: ServiceIdentifier<T>): Promise<void>;
}

// Browser service registry implementation
export class BrowserServiceRegistry implements IServiceRegistry, ILifecycleAware {
	private services = new Map<string, {
		options: ServiceRegistrationOptions;
		instance?: any;
		status: ServiceStatus;
	}>();

	private readonly _events: ServiceRegistryEvents = {
		onServiceRegistered: new EventEmitter<string>(),
		onServiceStarted: new EventEmitter<string>(),
		onServiceStopped: new EventEmitter<string>(),
		onServiceFailed: new EventEmitter<{ id: string; error: Error }>()
	};

	public readonly events = this._events;

	constructor(
		private instantiationService: IInstantiationService,
		private lifecycleManager: BrowserLifecycleManager,
		private errorHandler: IErrorHandlerService
	) {
		// Register this registry with lifecycle manager
		this.lifecycleManager.registerService(this);

		// Setup error handling for service failures
		this.setupErrorHandling();
	}

	public register<T>(id: ServiceIdentifier<T>, options: ServiceRegistrationOptions): void {
		const serviceId = id.id;

		if (this.services.has(serviceId)) {
			throw new Error(`Service already registered: ${serviceId}`);
		}

		// Validate dependencies
		this.validateDependencies(options.metadata);

		this.services.set(serviceId, {
			options,
			status: ServiceStatus.Registered
		});

		this.errorHandler.getLogger('ServiceRegistry').info(
			`Service registered: ${options.metadata.name}`,
			{ serviceId, metadata: options.metadata }
		);

		this._events.onServiceRegistered.emit(serviceId);
	}

	public unregister<T>(id: ServiceIdentifier<T>): void {
		const serviceId = id.id;
		const service = this.services.get(serviceId);

		if (!service) {
			return;
		}

		// Stop service if running
		if (service.status === ServiceStatus.Running) {
			this.stopService(id).catch(error => {
				this.errorHandler.getLogger('ServiceRegistry').error(
					`Failed to stop service during unregistration: ${serviceId}`,
					error
				);
			});
		}

		// Dispose instance if exists
		if (service.instance && service.options.dispose) {
			try {
				service.options.dispose(service.instance);
			} catch (error) {
				this.errorHandler.getLogger('ServiceRegistry').error(
					`Error disposing service: ${serviceId}`,
					error as Error
				);
			}
		}

		this.services.delete(serviceId);
	}

	public get<T>(id: ServiceIdentifier<T>): T | undefined {
		const serviceId = id.id;
		const service = this.services.get(serviceId);

		if (!service) {
			return undefined;
		}

		// Create instance if not exists and not lazy
		if (!service.instance) {
			if (service.options.metadata.lazy === false || service.status === ServiceStatus.Running) {
				try {
					service.instance = this.instantiationService.invokeFunction(service.options.factory);
					this.errorHandler.getLogger('ServiceRegistry').info(
						`Service instantiated: ${service.options.metadata.name}`,
						{ serviceId }
					);
				} catch (error) {
					this.errorHandler.getLogger('ServiceRegistry').error(
						`Failed to instantiate service: ${serviceId}`,
						error as Error
					);
					service.status = ServiceStatus.Failed;
					this._events.onServiceFailed.emit({ id: serviceId, error: error as Error });
					return undefined;
				}
			}
		}

		return service.instance;
	}

	public has<T>(id: ServiceIdentifier<T>): boolean {
		return this.services.has(id.id);
	}

	public getStatus<T>(id: ServiceIdentifier<T>): ServiceStatus {
		const service = this.services.get(id.id);
		return service ? service.status : ServiceStatus.NotRegistered;
	}

	public getMetadata<T>(id: ServiceIdentifier<T>): ServiceMetadata | undefined {
		const service = this.services.get(id.id);
		return service?.options.metadata;
	}

	public getAllServices(): Array<{ id: string; status: ServiceStatus; metadata: ServiceMetadata }> {
		const result: Array<{ id: string; status: ServiceStatus; metadata: ServiceMetadata }> = [];

		for (const [id, service] of this.services.entries()) {
			result.push({
				id,
				status: service.status,
				metadata: service.options.metadata
			});
		}

		return result;
	}

	public async startService<T>(id: ServiceIdentifier<T>): Promise<void> {
		const serviceId = id.id;
		const service = this.services.get(serviceId);

		if (!service) {
			throw new Error(`Service not found: ${serviceId}`);
		}

		if (service.status === ServiceStatus.Running) {
			return;
		}

		try {
			service.status = ServiceStatus.Starting;

			// Start dependencies first
			await this.startDependencies(service.options.metadata);

			// Get or create instance
			const instance = this.get(id);
			if (!instance) {
				throw new Error(`Failed to get service instance: ${serviceId}`);
			}

			// Start if lifecycle aware
			if (instance && typeof instance === 'object' && 'onWillStart' in instance && typeof instance.onWillStart === 'function') {
				await instance.onWillStart();
			}

			service.status = ServiceStatus.Running;

			if (instance && typeof instance === 'object' && 'onDidStart' in instance && typeof instance.onDidStart === 'function') {
				await instance.onDidStart();
			}

			this._events.onServiceStarted.emit(serviceId);
		} catch (error) {
			service.status = ServiceStatus.Failed;
			this._events.onServiceFailed.emit({ id: serviceId, error: error as Error });
			throw error;
		}
	}

	public async stopService<T>(id: ServiceIdentifier<T>): Promise<void> {
		const serviceId = id.id;
		const service = this.services.get(serviceId);

		if (!service || service.status !== ServiceStatus.Running) {
			return;
		}

		try {
			service.status = ServiceStatus.Stopping;

			const instance = service.instance;
			if (instance && typeof instance === 'object' && 'onWillStop' in instance && typeof instance.onWillStop === 'function') {
				await instance.onWillStop();
			}

			service.status = ServiceStatus.Stopped;

			if (instance && typeof instance === 'object' && 'onDidStop' in instance && typeof instance.onDidStop === 'function') {
				await instance.onDidStop();
			}

			this._events.onServiceStopped.emit(serviceId);
		} catch (error) {
			service.status = ServiceStatus.Failed;
			this._events.onServiceFailed.emit({ id: serviceId, error: error as Error });
			throw error;
		}
	}

	// ILifecycleAware implementation
	public async onDidStart(): Promise<void> {
		// Start all non-lazy services
		for (const [serviceId, service] of this.services.entries()) {
			if (!service.options.metadata.lazy) {
				try {
					await this.startService({ id: serviceId } as ServiceIdentifier<any>);
				} catch (error) {
					this.errorHandler.getLogger('ServiceRegistry').error(
						`Failed to start service during registry startup: ${serviceId}`,
						error as Error
					);
				}
			}
		}
	}

	public async onWillStop(): Promise<void> {
		// Stop all running services
		const runningServices = Array.from(this.services.entries())
			.filter(([, service]) => service.status === ServiceStatus.Running);

		for (const [serviceId] of runningServices) {
			try {
				await this.stopService({ id: serviceId } as ServiceIdentifier<any>);
			} catch (error) {
				this.errorHandler.getLogger('ServiceRegistry').error(
					`Failed to stop service during registry shutdown: ${serviceId}`,
					error as Error
				);
			}
		}
	}

	private validateDependencies(metadata: ServiceMetadata): void {
		if (!metadata.dependencies) {
			return;
		}

		for (const depId of metadata.dependencies) {
			if (!this.services.has(depId) && !metadata.optional) {
				throw new Error(`Missing required dependency: ${depId} for service: ${metadata.id}`);
			}
		}
	}

	private async startDependencies(metadata: ServiceMetadata): Promise<void> {
		if (!metadata.dependencies) {
			return;
		}

		for (const depId of metadata.dependencies) {
			const depService = this.services.get(depId);
			if (depService && depService.status !== ServiceStatus.Running) {
				await this.startService({ id: depId } as ServiceIdentifier<any>);
			}
		}
	}

	private setupErrorHandling(): void {
		// Listen for service failures and log them
		this._events.onServiceFailed.on(({ id, error }) => {
			this.errorHandler.getLogger('ServiceRegistry').error(
				`Service failed: ${id}`,
				error,
				{ serviceId: id }
			);
		});
	}

	public dispose(): void {
		// Stop all services
		this.onWillStop().catch(error => {
			this.errorHandler.getLogger('ServiceRegistry').error(
				'Error stopping services during disposal',
				error as Error
			);
		});

		// Dispose all event emitters
		this._events.onServiceRegistered.dispose();
		this._events.onServiceStarted.dispose();
		this._events.onServiceStopped.dispose();
		this._events.onServiceFailed.dispose();

		this.services.clear();
	}
}
