// Browser-compatible dependency injection system (replacement for VS Code's IInstantiationService)

import type { Disposable } from '../utils/events';

// Service identifier interface
export interface ServiceIdentifier<T> {
	readonly id: string;
}

// Service descriptor for lazy instantiation
export interface ServiceDescriptor<T> {
	readonly id: ServiceIdentifier<T>;
	readonly factory: (accessor: ServiceAccessor) => T;
	readonly singleton?: boolean;
}

// Service accessor for dependency resolution
export interface ServiceAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
}

// Main instantiation service
export interface IInstantiationService {
	createInstance<T>(ctor: new (...args: any[]) => T, ...args: any[]): T;
	invokeFunction<R>(fn: (accessor: ServiceAccessor, ...args: any[]) => R, ...args: any[]): R;
	createChild(services?: ServiceCollection): IInstantiationService;
}

// Service collection for registration
export class ServiceCollection {
	private services = new Map<string, ServiceDescriptor<any>>();

	public set<T>(id: ServiceIdentifier<T>, factory: (accessor: ServiceAccessor) => T): void {
		this.services.set(id.id, {
			id,
			factory,
			singleton: true
		});
	}

	public setInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
		this.services.set(id.id, {
			id,
			factory: () => instance,
			singleton: true
		});
	}

	public get<T>(id: ServiceIdentifier<T>): ServiceDescriptor<T> | undefined {
		return this.services.get(id.id);
	}

	public has<T>(id: ServiceIdentifier<T>): boolean {
		return this.services.has(id.id);
	}

	public entries(): IterableIterator<[string, ServiceDescriptor<any>]> {
		return this.services.entries();
	}
}

// Browser implementation of instantiation service
export class BrowserInstantiationService implements IInstantiationService, Disposable {
	private services: ServiceCollection;
	private instances = new Map<string, any>();

	constructor(services: ServiceCollection = new ServiceCollection()) {
		this.services = services;
	}

	public createInstance<T>(ctor: new (...args: any[]) => T, ...args: any[]): T {
		// For browser environment, we'll do basic constructor injection
		// This is a simplified version - a full implementation would handle parameter decoration
		return new ctor(...args);
	}

	public invokeFunction<R>(fn: (accessor: ServiceAccessor, ...args: any[]) => R, ...args: any[]): R {
		const accessor: ServiceAccessor = {
			get: <T>(id: ServiceIdentifier<T>): T => this.getService(id)
		};
		return fn(accessor, ...args);
	}

	public createChild(services?: ServiceCollection): IInstantiationService {
		const childServices = new ServiceCollection();

		// Copy parent services
		for (const [key, service] of this.services.entries()) {
			childServices.set(service.id, service.factory);
		}

		// Add child services
		if (services) {
			for (const [key, service] of services.entries()) {
				childServices.set(service.id, service.factory);
			}
		}

		return new BrowserInstantiationService(childServices);
	}

	private getService<T>(id: ServiceIdentifier<T>): T {
		const serviceId = id.id;

		// Check if already instantiated
		if (this.instances.has(serviceId)) {
			return this.instances.get(serviceId);
		}

		// Get service descriptor
		const descriptor = this.services.get(id);
		if (!descriptor) {
			throw new Error(`Service not found: ${serviceId}`);
		}

		// Create instance
		const accessor: ServiceAccessor = {
			get: <U>(nestedId: ServiceIdentifier<U>): U => this.getService(nestedId)
		};

		const instance = descriptor.factory(accessor);

		// Cache if singleton
		if (descriptor.singleton !== false) {
			this.instances.set(serviceId, instance);
		}

		return instance;
	}

	public dispose(): void {
		// Dispose all disposable instances
		for (const instance of this.instances.values()) {
			if (instance && typeof instance.dispose === 'function') {
				instance.dispose();
			}
		}
		this.instances.clear();
	}
}

// Helper function to create service identifiers
export function createServiceIdentifier<T>(id: string): ServiceIdentifier<T> {
	return { id };
}

// Decorator for service injection (simplified version)
export function createDecorator<T>(id: string): ServiceIdentifier<T> {
	return createServiceIdentifier<T>(id);
}
