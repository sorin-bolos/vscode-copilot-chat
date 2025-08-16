// Common Event Emitter Implementation for Monaco Editor Service

export interface Event<T> {
	(listener: (e: T) => any, thisArg?: any): () => void;
}

export interface EmitterOptions {
	onFirstListenerAdd?: () => void;
	onLastListenerRemove?: () => void;
}

export class EventEmitter<T> {
	private listeners: Array<{ listener: (e: T) => any; thisArg?: any }> = [];
	private disposed = false;
	private _options?: EmitterOptions;

	constructor(options?: EmitterOptions) {
		this._options = options;
	}

	get event(): Event<T> {
		return (listener: (e: T) => any, thisArg?: any) => {
			if (this.disposed) {
				return () => { };
			}

			const isFirstListener = this.listeners.length === 0;

			this.listeners.push({ listener, thisArg });

			if (isFirstListener && this._options?.onFirstListenerAdd) {
				this._options.onFirstListenerAdd();
			}

			return () => {
				this.removeListener(listener, thisArg);
			};
		};
	}

	fire(event: T): void {
		if (this.disposed) {
			return;
		}

		for (const { listener, thisArg } of this.listeners) {
			try {
				listener.call(thisArg, event);
			} catch (error) {
				console.error('Error in event listener:', error);
			}
		}
	}

	private removeListener(listener: (e: T) => any, thisArg?: any): void {
		const index = this.listeners.findIndex(l => l.listener === listener && l.thisArg === thisArg);
		if (index >= 0) {
			this.listeners.splice(index, 1);

			if (this.listeners.length === 0 && this._options?.onLastListenerRemove) {
				this._options.onLastListenerRemove();
			}
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.listeners.length = 0;

		if (this._options?.onLastListenerRemove) {
			this._options.onLastListenerRemove();
		}
	}

	hasListeners(): boolean {
		return this.listeners.length > 0;
	}
}

// Relay Event - forwards events from another emitter
export class RelayEvent<T> implements Event<T> {
	private relayedEvent: Event<T>;

	constructor(event: Event<T>) {
		this.relayedEvent = event;
	}

    (listener: (e: T) => any, thisArg?: any): () => void {
	return this.relayedEvent(listener, thisArg);
}
}

// Mapped Event - transforms events from another emitter
export class MappedEvent<I, O> implements Event<O> {
	private sourceEvent: Event<I>;
	private mapper: (input: I) => O;

	constructor(event: Event<I>, mapper: (input: I) => O) {
		this.sourceEvent = event;
		this.mapper = mapper;
	}

    (listener: (e: O) => any, thisArg?: any): () => void {
	return this.sourceEvent((input: I) => {
		const output = this.mapper(input);
		listener.call(thisArg, output);
	});
}
}

// Filtered Event - only fires for events that pass a condition
export class FilteredEvent<T> implements Event<T> {
	private sourceEvent: Event<T>;
	private filter: (event: T) => boolean;

	constructor(event: Event<T>, filter: (event: T) => boolean) {
		this.sourceEvent = event;
		this.filter = filter;
	}

    (listener: (e: T) => any, thisArg?: any): () => void {
	return this.sourceEvent((event: T) => {
		if (this.filter(event)) {
			listener.call(thisArg, event);
		}
	});
}
}

// Debounced Event - debounces events by a specified delay
export class DebouncedEvent<T> implements Event<T> {
	private sourceEvent: Event<T>;
	private delay: number;
	private timeout: number | undefined;
	private lastEvent: T | undefined;

	constructor(event: Event<T>, delay: number) {
		this.sourceEvent = event;
		this.delay = delay;
	}

    (listener: (e: T) => any, thisArg?: any): () => void {
	return this.sourceEvent((event: T) => {
		this.lastEvent = event;

		if (this.timeout) {
			clearTimeout(this.timeout);
		}

		this.timeout = window.setTimeout(() => {
			if (this.lastEvent) {
				listener.call(thisArg, this.lastEvent);
			}
			this.timeout = undefined;
		}, this.delay);
	});
}
}

// Event utilities
export namespace Event {
	export function once<T>(event: Event<T>): Event<T> {
		return (listener: (e: T) => any, thisArg?: any) => {
			let fired = false;
			const dispose = event((e: T) => {
				if (!fired) {
					fired = true;
					dispose();
					listener.call(thisArg, e);
				}
			});
			return dispose;
		};
	}

	export function map<I, O>(event: Event<I>, mapper: (input: I) => O): Event<O> {
		return new MappedEvent(event, mapper);
	}

	export function filter<T>(event: Event<T>, filter: (event: T) => boolean): Event<T> {
		return new FilteredEvent(event, filter);
	}

	export function debounce<T>(event: Event<T>, delay: number): Event<T> {
		return new DebouncedEvent(event, delay);
	}

	export function any<T>(...events: Event<T>[]): Event<T> {
		return (listener: (e: T) => any, thisArg?: any) => {
			const disposables = events.map(event => event(listener, thisArg));
			return () => {
				disposables.forEach(dispose => dispose());
			};
		};
	}

	export function fromPromise<T>(promise: Promise<T>): Event<T> {
		const emitter = new EventEmitter<T>();
		promise.then(
			result => emitter.fire(result),
			error => console.error('Promise rejected in fromPromise:', error)
		);
		return emitter.event;
	}

	export function toPromise<T>(event: Event<T>): Promise<T> {
		return new Promise((resolve) => {
			const dispose = event((e: T) => {
				dispose();
				resolve(e);
			});
		});
	}
}
