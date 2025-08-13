// Browser-compatible event emitter system (replacement for VS Code EventEmitter)

export interface Listener<T = any> {
	(event: T): void;
}

export interface Disposable {
	dispose(): void;
}

export class EventEmitter<T = any> {
	private listeners: Listener<T>[] = [];

	public on(listener: Listener<T>): Disposable {
		this.listeners.push(listener);
		return {
			dispose: () => {
				const index = this.listeners.indexOf(listener);
				if (index !== -1) {
					this.listeners.splice(index, 1);
				}
			}
		};
	}

	public emit(event: T): void {
		this.listeners.forEach(listener => {
			try {
				listener(event);
			} catch (error) {
				console.error('Error in event listener:', error);
			}
		});
	}

	public dispose(): void {
		this.listeners = [];
	}
}

export class DisposableStore implements Disposable {
	private disposables: Disposable[] = [];

	public add<T extends Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}

export function toDisposable(fn: () => void): Disposable {
	return {
		dispose: fn
	};
}
