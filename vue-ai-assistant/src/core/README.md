# Vue AI Assistant - Core Service Architecture

This directory contains the foundational service architecture for the Vue AI Assistant application, providing a browser-compatible replacement for VS Code/Node.js dependencies.

## Architecture Overview

The core service architecture consists of five key components that work together to provide a complete dependency injection, lifecycle management, configuration, and error handling system suitable for browser environments.

### Key Components

#### 1. Dependency Injection (`instantiation.ts`)
A lightweight dependency injection container that replaces VS Code's service architecture:
- **Service Creation**: Factory-based service instantiation
- **Dependency Resolution**: Automatic dependency injection
- **Lazy Loading**: Services are created only when needed
- **Type Safety**: Full TypeScript support for service dependencies

```typescript
const instantiationService = new InstantiationService();
instantiationService.set(IMyService, new MyService());
const myService = instantiationService.get(IMyService);
```

#### 2. Lifecycle Management (`lifecycle.ts`)
Manages application and service lifecycle states:
- **State Management**: Starting, Started, Stopping, Stopped states
- **Event System**: Subscribe to lifecycle state changes
- **Service Coordination**: Ensures proper startup/shutdown order
- **Async Support**: Handles asynchronous lifecycle operations

```typescript
const lifecycle = new LifecycleManager();
lifecycle.onStateChange.on((state) => {
  console.log('Application state changed to:', state);
});
await lifecycle.start();
```

#### 3. Service Registry (`serviceRegistry.ts`)
Central registry for managing all application services:
- **Service Registration**: Dynamic service registration with metadata
- **Status Tracking**: Monitor service health and status
- **Dependency Management**: Resolve service dependencies
- **Lifecycle Integration**: Start/stop services based on lifecycle

```typescript
const registry = new ServiceRegistry(lifecycle, instantiation);
registry.register({
  id: 'my-service',
  factory: () => new MyService(),
  metadata: { name: 'My Service', lazy: false }
});
```

#### 4. Configuration Service (`configuration.ts`)
Browser-compatible configuration management:
- **Persistent Storage**: Uses localStorage for persistence
- **Change Events**: React to configuration changes
- **Sections**: Organize configuration into logical sections
- **Type Safety**: Strongly typed configuration access
- **Multi-tab Sync**: Synchronize configuration across browser tabs

```typescript
const config = new ConfigurationService();
await config.set('ai.model', 'gpt-4');
const model = config.get('ai.model'); // 'gpt-4'

config.onDidChangeConfiguration.on((event) => {
  console.log('Configuration changed:', event.keys);
});
```

#### 5. Error Handling (`errorHandling.ts`)
Comprehensive error handling and logging system:
- **Error Reporting**: Centralized error collection
- **Severity Levels**: Info, Warning, Error severity classification
- **Global Handlers**: Catch unhandled errors and promise rejections
- **Logging**: Named loggers for different components
- **Browser Compatible**: Works in all modern browsers

```typescript
const errorHandler = new ErrorHandlingService();
errorHandler.reportError('Something went wrong', ErrorSeverity.Error);

const logger = errorHandler.getLogger('MyComponent');
logger.info('Operation completed');
logger.warn('Potential issue detected');
```

## Application Bootstrap (`application.ts`)

The `VueAIAssistantApplication` class demonstrates how all these services work together:

```typescript
const app = new VueAIAssistantApplication();
const context = await app.initialize({
  ai: {
    model: 'gpt-4',
    temperature: 0.7
  },
  services: [
    // Custom service registrations
  ]
});

await app.start();
// Application is now running with all services active

await app.stop();
// Clean shutdown of all services
```

## Integration with Vue.js

The core services are designed to integrate seamlessly with Vue.js applications:

### 1. Service Injection
```typescript
// In a Vue component
import { inject } from 'vue';
import { IConfigurationService } from '@/core/configuration';

export default {
  setup() {
    const config = inject<IConfigurationService>('configurationService');
    const aiModel = config?.get('ai.model');
    return { aiModel };
  }
};
```

### 2. Reactive Configuration
```typescript
// Using composition API
import { ref, onMounted } from 'vue';
import type { IConfigurationService } from '@/core/configuration';

export function useConfiguration() {
  const config = inject<IConfigurationService>('configurationService');
  const settings = ref({});

  onMounted(() => {
    config?.onDidChangeConfiguration.on(() => {
      // Update reactive settings
      settings.value = { ...config.getAllSettings() };
    });
  });

  return { settings };
}
```

## Testing

The architecture includes comprehensive tests that verify:
- Service initialization and coordination
- Lifecycle management
- Configuration persistence
- Error handling
- Dependency injection
- Platform abstraction

Run tests with:
```bash
npm run test:unit src/core/__tests__/serviceArchitecture.spec.ts
```

## Browser Compatibility

All services are designed to work in modern browsers (ES2020+) without Node.js dependencies:
- **Storage**: Uses localStorage/sessionStorage instead of file system
- **Events**: Custom event system instead of Node.js EventEmitter
- **Modules**: ES modules with proper tree-shaking support
- **TypeScript**: Full type safety and IntelliSense support

## Migration from VS Code

This architecture replaces several VS Code-specific concepts:

| VS Code API | Core Service Replacement |
|-------------|-------------------------|
| `IInstantiationService` | `InstantiationService` |
| `ILifecycleService` | `LifecycleManager` |
| `IConfigurationService` | `ConfigurationService` |
| `ILogService` | `ErrorHandlingService` |
| Extension Host | `ServiceRegistry` |
| Disposables | Lifecycle integration |

## Next Steps

With the core service architecture complete, the next phase involves implementing platform-specific services:
1. Communication Layer (HTTP/WebSocket)
2. File System Abstraction
3. Storage Services
4. Search and Indexing

This foundation provides the architectural base for building a complete browser-based AI assistant application.
