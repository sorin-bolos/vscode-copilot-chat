<template>
	<div class="vue-copilot-assistant">
		<div class="assistant-header">
			<h2>AI Assistant</h2>
			<div class="status-indicator" :class="{ 'loading': isLoading }">
				{{ isLoading ? 'Processing...' : 'Ready' }}
			</div>
		</div>

		<div class="editor-info" v-if="activeEditor">
			<h3>Active Editor</h3>
			<p><strong>File:</strong> {{ activeEditor.uri || 'Untitled' }}</p>
			<p><strong>Language:</strong> {{ activeEditor.languageId || 'Unknown' }}</p>
			<p><strong>Selection:</strong>
				{{ selection ? `"${selection.substring(0, 50)}${selection.length > 50 ? '...' : ''}"` : 'None' }}
			</p>
		</div>

		<div class="chat-interface">
			<div class="messages" ref="messagesContainer">
				<div v-for="(message, index) in messages" :key="index"
					class="message" :class="message.type">
					<div class="message-content">{{ message.content }}</div>
					<div class="message-time">{{ formatTime(message.timestamp) }}</div>
				</div>
			</div>

			<div class="input-area">
				<textarea
					v-model="inputMessage"
					@keydown.ctrl.enter="sendMessage"
					@keydown.meta.enter="sendMessage"
					placeholder="Ask AI for help with your code... (Ctrl/Cmd + Enter to send)"
					:disabled="isLoading"
					rows="3"
				></textarea>
				<div class="input-actions">
					<button @click="sendMessage" :disabled="!inputMessage.trim() || isLoading">
						{{ isLoading ? 'Processing...' : 'Send' }}
					</button>
					<button @click="applyLastCode" :disabled="!lastGeneratedCode">
						Apply Code
					</button>
				</div>
			</div>
		</div>

		<div class="error-message" v-if="error">
			{{ error }}
			<button @click="error = null">✕</button>
		</div>

		<div class="storage-demo">
			<h3>Storage Demo</h3>
			<div class="storage-controls">
				<input v-model="storageKey" placeholder="Storage key" />
				<input v-model="storageValue" placeholder="Storage value" />
				<button @click="saveToStorage">Save</button>
				<button @click="loadFromStorage">Load</button>
				<span v-if="loadedValue">Loaded: {{ loadedValue }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, nextTick, provide } from 'vue';
import {
	useEditor,
	useAIChat,
	useStorage,
	PLATFORM_ABSTRACTION_KEY,
	STORAGE_SERVICE_KEY
} from '../utils/composables';
import type { PlatformAbstraction } from '../platform/platformAbstraction';
import type { IStorageService } from '../platform/storage';

// Props for dependency injection
interface Props {
	platformAbstraction: PlatformAbstraction;
	storageService: IStorageService;
	config?: any;
}

const props = withDefaults(defineProps<Props>(), {
	config: () => ({})
});

// Emits
const emit = defineEmits<{
	codeChange: [change: any]
	toolResult: [result: any]
}>()

// Provide platform services for composables
provide(PLATFORM_ABSTRACTION_KEY, props.platformAbstraction);
provide(STORAGE_SERVICE_KEY, props.storageService);

// Use composables
const { activeEditor, selection, replaceSelection } = useEditor();
const { isLoading, error, sendMessage: sendAIMessage, applyCodeChange } = useAIChat();
const { getValue, setValue } = useStorage();

// Component state
const inputMessage = ref('');
const messages = ref<Array<{
	type: 'user' | 'assistant';
	content: string;
	timestamp: Date;
}>>([]);
const lastGeneratedCode = ref<string>('');
const messagesContainer = ref<HTMLElement>();

// Storage demo state
const storageKey = ref('demo-key');
const storageValue = ref('demo-value');
const loadedValue = ref<string>('');

// Chat functionality
async function sendMessage() {
	if (!inputMessage.value.trim() || isLoading.value) return;

	const userMessage = inputMessage.value.trim();
	messages.value.push({
		type: 'user',
		content: userMessage,
		timestamp: new Date()
	});

	inputMessage.value = '';

	try {
		const response = await sendAIMessage(userMessage);
		messages.value.push({
			type: 'assistant',
			content: response,
			timestamp: new Date()
		});

		// Extract code blocks from response (simple regex for demo)
		const codeMatch = response.match(/```[\s\S]*?```/);
		if (codeMatch) {
			lastGeneratedCode.value = codeMatch[0].replace(/```\w*\n?/g, '').replace(/```$/g, '');
		}

		await nextTick();
		scrollToBottom();
	} catch (err) {
		console.error('Failed to send message:', err);
	}
}

async function applyLastCode() {
	if (!lastGeneratedCode.value) return;

	try {
		await applyCodeChange(lastGeneratedCode.value);
		lastGeneratedCode.value = '';
		emit('codeChange', { code: lastGeneratedCode.value });
	} catch (err) {
		console.error('Failed to apply code:', err);
	}
}

function scrollToBottom() {
	if (messagesContainer.value) {
		messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
	}
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Storage demo functions
async function saveToStorage() {
	if (!storageKey.value || !storageValue.value) return;

	try {
		await setValue(storageKey.value, storageValue.value);
		loadedValue.value = `Saved: ${storageValue.value}`;
	} catch (err) {
		console.error('Failed to save to storage:', err);
	}
}

async function loadFromStorage() {
	if (!storageKey.value) return;

	try {
		const value = await getValue<string>(storageKey.value);
		loadedValue.value = value || 'Not found';
	} catch (err) {
		console.error('Failed to load from storage:', err);
	}
}
</script>

<style scoped>
.vue-copilot-assistant {
	max-width: 800px;
	margin: 0 auto;
	padding: 20px;
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.assistant-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20px;
	padding-bottom: 10px;
	border-bottom: 1px solid #e0e0e0;
}

.status-indicator {
	padding: 4px 12px;
	border-radius: 12px;
	background: #e8f5e8;
	color: #2d5a2d;
	font-size: 0.9em;
}

.status-indicator.loading {
	background: #fff3cd;
	color: #856404;
}

.editor-info {
	background: #f8f9fa;
	padding: 15px;
	border-radius: 8px;
	margin-bottom: 20px;
}

.editor-info h3 {
	margin-top: 0;
	margin-bottom: 10px;
}

.editor-info p {
	margin: 5px 0;
}

.chat-interface {
	border: 1px solid #e0e0e0;
	border-radius: 8px;
	overflow: hidden;
	margin-bottom: 20px;
}

.messages {
	height: 300px;
	overflow-y: auto;
	padding: 15px;
	background: white;
}

.message {
	margin-bottom: 15px;
	display: flex;
	flex-direction: column;
}

.message.user {
	align-items: flex-end;
}

.message.assistant {
	align-items: flex-start;
}

.message-content {
	max-width: 70%;
	padding: 10px 15px;
	border-radius: 15px;
	word-wrap: break-word;
	white-space: pre-wrap;
}

.message.user .message-content {
	background: #007acc;
	color: white;
}

.message.assistant .message-content {
	background: #f1f3f4;
	color: #333;
}

.message-time {
	font-size: 0.8em;
	color: #666;
	margin-top: 5px;
}

.input-area {
	border-top: 1px solid #e0e0e0;
	padding: 15px;
	background: #f8f9fa;
}

.input-area textarea {
	width: 100%;
	border: 1px solid #ddd;
	border-radius: 6px;
	padding: 10px;
	resize: vertical;
	font-family: inherit;
	margin-bottom: 10px;
}

.input-actions {
	display: flex;
	gap: 10px;
}

.input-actions button {
	padding: 8px 16px;
	border: none;
	border-radius: 6px;
	background: #007acc;
	color: white;
	cursor: pointer;
	font-size: 0.9em;
}

.input-actions button:disabled {
	background: #ccc;
	cursor: not-allowed;
}

.input-actions button:not(:disabled):hover {
	background: #005a9e;
}

.error-message {
	background: #f8d7da;
	color: #721c24;
	padding: 10px 15px;
	border-radius: 6px;
	margin-bottom: 20px;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.error-message button {
	background: none;
	border: none;
	color: #721c24;
	cursor: pointer;
	font-size: 1.2em;
}

.storage-demo {
	background: #f8f9fa;
	padding: 15px;
	border-radius: 8px;
	border: 1px solid #e0e0e0;
}

.storage-demo h3 {
	margin-top: 0;
	margin-bottom: 15px;
}

.storage-controls {
	display: flex;
	gap: 10px;
	align-items: center;
	flex-wrap: wrap;
}

.storage-controls input {
	padding: 6px 10px;
	border: 1px solid #ddd;
	border-radius: 4px;
	font-size: 0.9em;
}

.storage-controls button {
	padding: 6px 12px;
	border: none;
	border-radius: 4px;
	background: #28a745;
	color: white;
	cursor: pointer;
	font-size: 0.9em;
}

.storage-controls button:hover {
	background: #1e7e34;
}

.storage-controls span {
	font-size: 0.9em;
	color: #666;
}
</style>
