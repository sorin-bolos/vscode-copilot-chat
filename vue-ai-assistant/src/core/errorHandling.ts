// Browser-compatible error handling and logging system

import type { Disposable } from '../utils/events';
import { EventEmitter } from '../utils/events';

// Error severity levels
export enum ErrorSeverity {
	Info = 'info',
	Warning = 'warning',
	Error = 'error',
	Critical = 'critical'
}

// Error report interface
export interface ErrorReport {
	message: string;
	severity: ErrorSeverity;
	error?: Error;
	context?: Record<string, any>;
	timestamp: Date;
	source?: string;
}

// Logger interface
export interface ILogger {
	info(message: string, context?: Record<string, any>): void;
	warn(message: string, context?: Record<string, any>): void;
	error(message: string, error?: Error, context?: Record<string, any>): void;
	critical(message: string, error?: Error, context?: Record<string, any>): void;
}

// Error handler service interface
export interface IErrorHandlerService extends Disposable {
	readonly onError: EventEmitter<ErrorReport>;
	reportError(report: ErrorReport): void;
	reportError(message: string, severity: ErrorSeverity, error?: Error, context?: Record<string, any>): void;
	getLogger(source: string): ILogger;
}

// Browser error handler implementation
export class BrowserErrorHandlerService implements IErrorHandlerService {
	private _onError = new EventEmitter<ErrorReport>();
	public readonly onError = this._onError;

	private errorQueue: ErrorReport[] = [];
	private maxQueueSize = 1000;

	constructor() {
		// Set up global error handlers
		this.setupGlobalErrorHandlers();
	}

	public reportError(messageOrReport: string | ErrorReport, severity?: ErrorSeverity, error?: Error, context?: Record<string, any>): void {
		let report: ErrorReport;

		if (typeof messageOrReport === 'string') {
			report = {
				message: messageOrReport,
				severity: severity || ErrorSeverity.Error,
				error,
				context,
				timestamp: new Date()
			};
		} else {
			report = messageOrReport;
		}

		// Add to queue
		this.errorQueue.push(report);
		if (this.errorQueue.length > this.maxQueueSize) {
			this.errorQueue.shift(); // Remove oldest
		}

		// Emit event
		this._onError.emit(report);

		// Log to console based on severity
		this.logToConsole(report);
	}

	public getLogger(source: string): ILogger {
		return new BrowserLogger(this, source);
	}

	private setupGlobalErrorHandlers(): void {
		// Handle uncaught errors
		window.addEventListener('error', (event) => {
			this.reportError({
				message: `Uncaught error: ${event.message}`,
				severity: ErrorSeverity.Error,
				error: event.error,
				context: {
					filename: event.filename,
					lineno: event.lineno,
					colno: event.colno
				},
				timestamp: new Date(),
				source: 'global'
			});
		});

		// Handle unhandled promise rejections
		window.addEventListener('unhandledrejection', (event) => {
			this.reportError({
				message: `Unhandled promise rejection: ${event.reason}`,
				severity: ErrorSeverity.Error,
				error: event.reason instanceof Error ? event.reason : undefined,
				context: { reason: event.reason },
				timestamp: new Date(),
				source: 'global'
			});
		});
	}

	private logToConsole(report: ErrorReport): void {
		const prefix = `[${report.severity.toUpperCase()}] ${report.timestamp.toISOString()}`;
		const message = report.source ? `${prefix} [${report.source}] ${report.message}` : `${prefix} ${report.message}`;

		switch (report.severity) {
			case ErrorSeverity.Info:
				console.info(message, report.context, report.error);
				break;
			case ErrorSeverity.Warning:
				console.warn(message, report.context, report.error);
				break;
			case ErrorSeverity.Error:
				console.error(message, report.context, report.error);
				break;
			case ErrorSeverity.Critical:
				console.error(`🚨 CRITICAL: ${message}`, report.context, report.error);
				break;
		}
	}

	public getRecentErrors(count: number = 50): ErrorReport[] {
		return this.errorQueue.slice(-count);
	}

	public clearErrors(): void {
		this.errorQueue = [];
	}

	public dispose(): void {
		this._onError.dispose();
		this.clearErrors();
	}
}

// Logger implementation
class BrowserLogger implements ILogger {
	constructor(
		private errorHandler: IErrorHandlerService,
		private source: string
	) { }

	public info(message: string, context?: Record<string, any>): void {
		this.errorHandler.reportError(message, ErrorSeverity.Info, undefined, context);
	}

	public warn(message: string, context?: Record<string, any>): void {
		this.errorHandler.reportError(message, ErrorSeverity.Warning, undefined, context);
	}

	public error(message: string, error?: Error, context?: Record<string, any>): void {
		this.errorHandler.reportError(message, ErrorSeverity.Error, error, context);
	}

	public critical(message: string, error?: Error, context?: Record<string, any>): void {
		this.errorHandler.reportError(message, ErrorSeverity.Critical, error, context);
	}
}

// Service identifier for dependency injection
export const IErrorHandlerServiceId = 'IErrorHandlerService';
