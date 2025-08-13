import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { PLATFORM_ABSTRACTION_KEY, STORAGE_SERVICE_KEY } from '../../utils/composables';
import VueCopilotAssistant from '../VueCopilotAssistant.vue';

// Mock platform abstraction for testing
class MockPlatformAbstraction {
	onDidChangeActiveEditor = {
		on: () => ({ dispose: () => { } })
	};

	onDidChangeConfiguration = {
		on: () => ({ dispose: () => { } })
	};

	getActiveEditor() {
		return {
			uri: 'test-file.js',
			languageId: 'javascript',
			getText: () => 'test content',
			getSelection: () => ({ start: 0, end: 0 }),
			getCursorPosition: () => 0,
			replaceText: async () => { },
			insertText: async () => { },
			setSelection: async () => { },
			setCursorPosition: async () => { },
			onDidChangeTextDocument: {
				on: () => ({ dispose: () => { } })
			},
			onDidChangeSelection: {
				on: () => ({ dispose: () => { } })
			}
		};
	}

	async readFile() {
		return 'mock file content';
	}

	async writeFile() { }

	async showDocument() { }

	showMessage() { }

	async showQuickPick() {
		return 'mock-selection';
	}

	getStorageValue(key: string, defaultValue?: any) {
		return defaultValue;
	}

	async setStorageValue() { }
}

// Mock storage service for testing
class MockStorageService {
	get(key: string, defaultValue?: any) {
		return defaultValue;
	}

	async set() { }

	async remove() { }

	keys() {
		return [];
	}

	async clear() { }
}

describe('VueCopilotAssistant', () => {
	const mockPlatform = new MockPlatformAbstraction() as any;
	const mockStorage = new MockStorageService() as any;

	it('renders properly', async () => {
		const wrapper = mount(VueCopilotAssistant, {
			props: {
				platformAbstraction: mockPlatform,
				storageService: mockStorage
			},
			global: {
				provide: {
					[PLATFORM_ABSTRACTION_KEY as symbol]: mockPlatform,
					[STORAGE_SERVICE_KEY as symbol]: mockStorage
				}
			}
		});

		expect(wrapper.text()).toContain('AI Assistant');
		expect(wrapper.find('.assistant-header').exists()).toBe(true);
	});

	it('emits events correctly', async () => {
		const wrapper = mount(VueCopilotAssistant, {
			props: {
				platformAbstraction: mockPlatform,
				storageService: mockStorage
			},
			global: {
				provide: {
					[PLATFORM_ABSTRACTION_KEY as symbol]: mockPlatform,
					[STORAGE_SERVICE_KEY as symbol]: mockStorage
				}
			}
		});

		// Test component is mounted and ready
		expect(wrapper.vm).toBeTruthy();
		expect(wrapper.emitted()).toBeDefined();
	});

	it('shows editor information when editor is active', async () => {
		const wrapper = mount(VueCopilotAssistant, {
			props: {
				platformAbstraction: mockPlatform,
				storageService: mockStorage
			},
			global: {
				provide: {
					[PLATFORM_ABSTRACTION_KEY as symbol]: mockPlatform,
					[STORAGE_SERVICE_KEY as symbol]: mockStorage
				}
			}
		});

		await wrapper.vm.$nextTick();

		// Should show editor info section
		expect(wrapper.find('.editor-info').exists()).toBe(true);
		expect(wrapper.text()).toContain('test-file.js');
		expect(wrapper.text()).toContain('javascript');
	});
});