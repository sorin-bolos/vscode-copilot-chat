/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cloneAndChange } from '../../../util/vs/base/common/objects';

export const enum ToolName {
	ApplyPatch = 'apply_patch',
	RunTests = 'run_tests',
	FindTextInFiles = 'grep_search',
	ReadFile = 'read_file',
	GetErrors = 'get_errors',
	GetScmChanges = 'get_changed_files',
	Usages = 'list_code_usages',
	EditFile = 'insert_edit_into_file',
	ReplaceString = 'replace_string_in_file',
	EditNotebook = 'edit_notebook_file',
	RunNotebookCell = 'run_notebook_cell',
	GetNotebookSummary = 'copilot_getNotebookSummary',
	ReadCellOutput = 'read_notebook_cell_output',
	Think = 'think',
	FetchWebPage = 'fetch_webpage',
	FindTestFiles = 'test_search',
	SearchViewResults = 'get_search_view_results',
	DocInfo = 'get_doc_info',
	GithubRepo = 'github_repo',
	SimpleBrowser = 'open_simple_browser',
	CreateDirectory = 'create_directory',
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
	Usages = 'copilot_listCodeUsages',
	/** @deprecated moving to core soon */
	RunTests = 'copilot_runTests1',
	FindTextInFiles = 'copilot_findTextInFiles',
	ReadFile = 'copilot_readFile',
	GetErrors = 'copilot_getErrors',
	DocInfo = 'copilot_getDocInfo',
	GetScmChanges = 'copilot_getChangedFiles',
	EditFile = 'copilot_insertEdit',
	ReplaceString = 'copilot_replaceString',
	EditNotebook = 'copilot_editNotebook',
	RunNotebookCell = 'copilot_runNotebookCell',
	GetNotebookSummary = 'copilot_getNotebookSummary',
	ReadCellOutput = 'copilot_readNotebookCellOutput',
	Think = 'copilot_think',
	FetchWebPage = 'copilot_fetchWebPage',
	FindTestFiles = 'copilot_findTestFiles',
	SearchViewResults = 'copilot_getSearchResults',
	GithubRepo = 'copilot_githubRepo',
	CreateAndRunTask = 'copilot_createAndRunTask',
	SimpleBrowser = 'copilot_openSimpleBrowser',
	CreateDirectory = 'copilot_createDirectory',
}

const contributedToolNameToToolNames = new Map<ContributedToolName, ToolName>([
	[ContributedToolName.ApplyPatch, ToolName.ApplyPatch],
	[ContributedToolName.Usages, ToolName.Usages],
	[ContributedToolName.FindTextInFiles, ToolName.FindTextInFiles],
	[ContributedToolName.ReadFile, ToolName.ReadFile],
	[ContributedToolName.GetErrors, ToolName.GetErrors],
	[ContributedToolName.DocInfo, ToolName.DocInfo],
	[ContributedToolName.GetScmChanges, ToolName.GetScmChanges],
	[ContributedToolName.EditFile, ToolName.EditFile],
	[ContributedToolName.Think, ToolName.Think],
	[ContributedToolName.FetchWebPage, ToolName.FetchWebPage],
	[ContributedToolName.FindTestFiles, ToolName.FindTestFiles],
	[ContributedToolName.ReplaceString, ToolName.ReplaceString],
	[ContributedToolName.EditNotebook, ToolName.EditNotebook],
	[ContributedToolName.RunNotebookCell, ToolName.RunNotebookCell],
	[ContributedToolName.GetNotebookSummary, ToolName.GetNotebookSummary],
	[ContributedToolName.ReadCellOutput, ToolName.ReadCellOutput],
	[ContributedToolName.SearchViewResults, ToolName.SearchViewResults],
	[ContributedToolName.GithubRepo, ToolName.GithubRepo],
	[ContributedToolName.SimpleBrowser, ToolName.SimpleBrowser],
	[ContributedToolName.CreateDirectory, ToolName.CreateDirectory],
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
