// Browser-compatible lifecycle management (replacement for VS Code extension lifecycle)

import type { Disposable } from '../utils/events';
import { EventEmitter } from '../utils/events';

// Lifecycle states
export enum LifecycleState {
	Starting = 'starting',
	Started = 'started',
	Stopping = 'stopping',
	Stopped = 'stopped',
	Error = 'error'
}

// Lifecycle events
export interface LifecycleEvents {
	onDidChangeState: EventEmitter<LifecycleState>;
	onWillStart: EventEmitter<void>;
	onDidStart: EventEmitter<void>;
	onWillStop: EventEmitter<void>;
	onDidStop: EventEmitter<void>;
	onError: EventEmitter<Error>;
}

// Lifecycle-aware service interface
export interface ILifecycleAware {
	onWillStart?(): Promise<void> | void;
	onDidStart?(): Promise<void> | void;
	onWillStop?(): Promise<void> | void;
	onDidStop?(): Promise<void> | void;
}

// Browser lifecycle manager
export class BrowserLifecycleManager implements Disposable {
	private state: LifecycleState = LifecycleState.Stopped;
	private services: ILifecycleAware[] = [];

	public readonly events: LifecycleEvents = {
		onDidChangeState: new EventEmitter<LifecycleState>(),
		onWillStart: new EventEmitter<void>(),
		onDidStart: new EventEmitter<void>(),
		onWillStop: new EventEmitter<void>(),
		onDidStop: new EventEmitter<void>(),
		onError: new EventEmitter<Error>()
	};

	public get currentState(): LifecycleState {
		return this.state;
	}

	public registerService(service: ILifecycleAware): Disposable {
		this.services.push(service);
		return {
			dispose: () => {
				const index = this.services.indexOf(service);
				if (index !== -1) {
					this.services.splice(index, 1);
				}
			}
		};
	}

	public async start(): Promise<void> {
		if (this.state !== LifecycleState.Stopped) {
			throw new Error(`Cannot start from state: ${this.state}`);
		}

		try {
			this.setState(LifecycleState.Starting);
			this.events.onWillStart.emit();

			// Start all services
			for (const service of this.services) {
				if (service.onWillStart) {
					await service.onWillStart();
				}
			}

			this.setState(LifecycleState.Started);

			for (const service of this.services) {
				if (service.onDidStart) {
					await service.onDidStart();
				}
			}

			this.events.onDidStart.emit();
		} catch (error) {
			this.setState(LifecycleState.Error);
			this.events.onError.emit(error as Error);
			throw error;
		}
	}

	public async stop(): Promise<void> {
		if (this.state !== LifecycleState.Started) {
			return;
		}

		try {
			this.setState(LifecycleState.Stopping);
			this.events.onWillStop.emit();

			// Stop all services in reverse order
			for (let i = this.services.length - 1; i >= 0; i--) {
				const service = this.services[i];
				if (service.onWillStop) {
					await service.onWillStop();
				}
			}

			this.setState(LifecycleState.Stopped);

			for (let i = this.services.length - 1; i >= 0; i--) {
				const service = this.services[i];
				if (service.onDidStop) {
					await service.onDidStop();
				}
			}

			this.events.onDidStop.emit();
		} catch (error) {
			this.setState(LifecycleState.Error);
			this.events.onError.emit(error as Error);
			throw error;
		}
	}

	private setState(newState: LifecycleState): void {
		if (this.state !== newState) {
			this.state = newState;
			this.events.onDidChangeState.emit(newState);
		}
	}

	public dispose(): void {
		if (this.state === LifecycleState.Started) {
			this.stop().catch(console.error);
		}

		this.events.onDidChangeState.dispose();
		this.events.onWillStart.dispose();
		this.events.onDidStart.dispose();
		this.events.onWillStop.dispose();
		this.events.onDidStop.dispose();
		this.events.onError.dispose();

		this.services = [];
	}
}
