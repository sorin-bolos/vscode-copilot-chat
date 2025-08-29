/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cloneAndChange } from '../../../util/vs/base/common/objects';

export const enum ToolName {
	ApplyPatch = 'apply_patch',
	RunTests = 'run_tests',
	ReadFile = 'read_file',
	EditFile = 'insert_edit_into_file',
	ReplaceString = 'replace_string_in_file',
	Think = 'think',
	FetchWebPage = 'fetch_webpage',
	GetTaskOutput = 'get_task_output',
	CoreManageTodoList = 'manage_todo_list',
	CoreRunInTerminal = 'run_in_terminal',
	CoreGetTerminalOutput = 'get_terminal_output',
	CoreCreateAndRunTask = 'create_and_run_task',
	CoreRunTask = 'run_task',
	CoreGetTaskOutput = 'get_task_output',
	CoreRunTest = 'runTests',
	CoreTodoListTool = 'manage_todo_list',
}

// When updating this, also update contributedToolNameToToolNames
export const enum ContributedToolName {
	ApplyPatch = 'copilot_applyPatch',
	/** @deprecated moving to core soon */
	RunTests = 'copilot_runTests1',
	ReadFile = 'copilot_readFile',
	EditFile = 'copilot_insertEdit',
	ReplaceString = 'copilot_replaceString',
	Think = 'copilot_think',
	FetchWebPage = 'copilot_fetchWebPage',
	CreateAndRunTask = 'copilot_createAndRunTask',
}

const contributedToolNameToToolNames = new Map<ContributedToolName, ToolName>([
	[ContributedToolName.ApplyPatch, ToolName.ApplyPatch],
	[ContributedToolName.ReadFile, ToolName.ReadFile],
	[ContributedToolName.EditFile, ToolName.EditFile],
	[ContributedToolName.Think, ToolName.Think],
	[ContributedToolName.FetchWebPage, ToolName.FetchWebPage],
	[ContributedToolName.ReplaceString, ToolName.ReplaceString],
]);

const toolNameToContributedToolNames = new Map<ToolName, ContributedToolName>();
for (const [contributedName, name] of contributedToolNameToToolNames) {
	toolNameToContributedToolNames.set(name, contributedName);
}

export function getContributedToolName(name: string | ToolName): string | ContributedToolName {
	return toolNameToContributedToolNames.get(name as ToolName) ?? name;
}

export function getToolName(name: string | ContributedToolName): string | ToolName {
	return contributedToolNameToToolNames.get(name as ContributedToolName) ?? name;
}

export function mapContributedToolNamesInString(str: string): string {
	contributedToolNameToToolNames.forEach((value, key) => {
		const re = new RegExp(`\\b${key}\\b`, 'g');
		str = str.replace(re, value);
	});
	return str;
}

export function mapContributedToolNamesInSchema(inputSchema: object): object {
	return cloneAndChange(inputSchema, value => typeof value === 'string' ? mapContributedToolNamesInString(value) : undefined);
}
