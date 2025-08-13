# Vue Copilot Assistant

A browser-based AI assistant component for Vue.js IDEs with Monaco editor integration.

## Features

- Chat interface with AI assistant
- Code diff visualization and editing
- Tool system for file operations and code analysis
- MCP (Model Context Protocol) server integration
- Monaco Editor integration for code editing

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test:unit

# Type checking
npm run type-check

# Lint and format
npm run lint
npm run format
```

## Project Structure

```
src/
├── components/         # Vue components
├── core/              # Core AI assistant logic
├── platform/          # Platform services (web-adapted)
├── utils/             # Utilities (no VS Code dependencies)
└── types/             # Type definitions
```

## Integration

This component is designed to be integrated into Vue.js-based IDEs with Monaco editor support.

```vue
<template>
  <VueCopilotAssistant
    :config="assistantConfig"
    @code-change="handleCodeChange"
    @tool-result="handleToolResult"
  />
</template>

<script setup lang="ts">
import { VueCopilotAssistant } from 'vue-copilot-assistant'
// ... configuration
</script>
```
