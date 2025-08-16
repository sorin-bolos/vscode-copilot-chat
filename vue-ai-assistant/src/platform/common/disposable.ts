// Common Disposable Implementation for Monaco Editor Service

export interface IDisposable {
	dispose(): void;
}

export function isDisposable(thing: any): thing is IDisposable {
	return typeof thing?.dispose === 'function';
}

export abstract class Disposable implements IDisposable {
	static readonly None = Object.freeze<IDisposable>({ dispose() { } });

	private _store = new Set<IDisposable>();
	private _isDisposed = false;

	protected get isDisposed(): boolean {
		return this._isDisposed;
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this.clear();
	}

	protected _register<T extends IDisposable>(disposable: T): T {
		if (this._isDisposed) {
			disposable.dispose();
			return disposable;
		}

		this._store.add(disposable);
		return disposable;
	}

	protected _unregister(disposable: IDisposable): void {
		this._store.delete(disposable);
	}

	private clear(): void {
		try {
			for (const disposable of this._store) {
				try {
					disposable.dispose();
				} catch (error) {
					console.error('Error disposing resource:', error);
				}
			}
		} finally {
			this._store.clear();
		}
	}
}

export class DisposableStore implements IDisposable {
	static DISABLE_DISPOSED_WARNING = false;

	private _store = new Set<IDisposable>();
	private _isDisposed = false;

	dispose(): void {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this.clear();
	}

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	clear(): void {
		if (this._store.size === 0) {
			return;
		}

		try {
			for (const disposable of this._store) {
				try {
					disposable.dispose();
				} catch (error) {
					console.error('Error disposing resource:', error);
				}
			}
		} finally {
			this._store.clear();
		}
	}

	add<T extends IDisposable>(disposable: T): T {
		if (!disposable) {
			return disposable;
		}

		if (this._isDisposed) {
			if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
				console.warn('Trying to add disposable to disposed store');
			}
			disposable.dispose();
			return disposable;
		}

		this._store.add(disposable);
		return disposable;
	}

	delete(disposable: IDisposable): void {
		if (!disposable) {
			return;
		}

		this._store.delete(disposable);
	}

	deleteAndDispose(disposable: IDisposable): void {
		if (!disposable) {
			return;
		}

		this._store.delete(disposable);
		disposable.dispose();
	}
}

export class MutableDisposable<T extends IDisposable = IDisposable> implements IDisposable {
	private _value?: T;
	private _isDisposed = false;

	constructor() {
	}

	get value(): T | undefined {
		return this._isDisposed ? undefined : this._value;
	}

	set value(value: T | undefined) {
		if (this._isDisposed || value === this._value) {
			return;
		}

		this._value?.dispose();
		this._value = value;
	}

	clear(): T | undefined {
		const value = this._value;
		this._value = undefined;
		return value;
	}

	dispose(): void {
		this._isDisposed = true;
		this._value?.dispose();
		this._value = undefined;
	}
}

export class SafeDisposable implements IDisposable {
	private _disposed = false;
	private _disposable?: IDisposable;

	constructor(disposable?: IDisposable) {
		this._disposable = disposable;
	}

	set(disposable: IDisposable | undefined): void {
		if (this._disposed) {
			disposable?.dispose();
			return;
		}

		this._disposable?.dispose();
		this._disposable = disposable;
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this._disposable?.dispose();
		this._disposable = undefined;
	}
}

// Utility functions for disposables
export function dispose<T extends IDisposable>(disposable: T): T;
export function dispose<T extends IDisposable>(disposable: T | undefined): T | undefined;
export function dispose<T extends IDisposable[]>(...disposables: T): T;
export function dispose<T extends ReadonlyArray<IDisposable>>(disposables: T): T;
export function dispose<T extends IDisposable | IDisposable[] | ReadonlyArray<IDisposable>>(arg: T): T {
	if (Array.isArray(arg)) {
		for (const disposable of arg) {
			disposable?.dispose();
		}
		return arg;
	} else if (arg && !Array.isArray(arg)) {
		arg.dispose();
		return arg;
	} else {
		return arg;
	}
}

export function combinedDisposable(...disposables: IDisposable[]): IDisposable {
	const store = new DisposableStore();
	disposables.forEach(d => store.add(d));
	return store;
}

export function toDisposable(fn: () => void): IDisposable {
	return {
		dispose: fn
	};
}

export function markAsSafeDisposable<T extends IDisposable>(disposable: T): T & { __isSafeDisposable: true } {
	return disposable as T & { __isSafeDisposable: true };
}

// Lifecycle utilities
export abstract class LifecyclePhase {
	private _disposables = new DisposableStore();
	private _phase: 'starting' | 'started' | 'stopping' | 'stopped' = 'starting';

	get phase(): 'starting' | 'started' | 'stopping' | 'stopped' {
		return this._phase;
	}

	protected setPhase(phase: 'starting' | 'started' | 'stopping' | 'stopped'): void {
		this._phase = phase;
	}

	protected register<T extends IDisposable>(disposable: T): T {
		return this._disposables.add(disposable);
	}

	dispose(): void {
		if (this._phase === 'stopping' || this._phase === 'stopped') {
			return;
		}

		this.setPhase('stopping');
		this._disposables.dispose();
		this.setPhase('stopped');
	}
}

// Timeout utilities with disposal
export function timeout(ms: number): Promise<void> & IDisposable {
	let timeoutId: number;
	let disposed = false;

	const promise = new Promise<void>((resolve) => {
		timeoutId = window.setTimeout(() => {
			if (!disposed) {
				resolve();
			}
		}, ms);
	}) as Promise<void> & IDisposable;

	promise.dispose = () => {
		disposed = true;
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	};

	return promise;
}

export function interval(ms: number, callback: () => void): IDisposable {
	const intervalId = window.setInterval(callback, ms);
	return toDisposable(() => clearInterval(intervalId));
}

// Event listener utilities with disposal
export function addDisposableListener(
	element: EventTarget,
	type: string,
	listener: EventListener,
	options?: boolean | AddEventListenerOptions
): IDisposable {
	element.addEventListener(type, listener, options);
	return toDisposable(() => element.removeEventListener(type, listener, options));
}
