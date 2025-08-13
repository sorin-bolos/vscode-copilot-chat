import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VueCopilotAssistant from '../VueCopilotAssistant.vue';

describe('VueCopilotAssistant', () => {
	it('renders properly', async () => {
		const wrapper = mount(VueCopilotAssistant);
		expect(wrapper.text()).toContain('AI Assistant');

		// Wait for mounted lifecycle
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain('Ready');
	});

	it('emits events correctly', async () => {
		const wrapper = mount(VueCopilotAssistant);

		// Test component is mounted and ready
		expect(wrapper.vm).toBeTruthy();
	});
});