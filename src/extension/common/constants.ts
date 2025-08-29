/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatLocation } from '../../platform/chat/common/commonTypes';

export const enum Intent {
	Explain = 'explain',
	Review = 'review',
	Tests = 'tests',
	Fix = 'fix',
	New = 'new',
	NewNotebook = 'newNotebook',
	notebookEditor = 'notebookEditor',
	Search = 'search',
	SemanticSearch = 'semanticSearch',
	Terminal = 'terminal',
	TerminalExplain = 'terminalExplain',
	VSCode = 'vscode',
	Unknown = 'unknown',
	StartDebugging = 'startDebugging',
	SetupTests = 'setupTests',
	Editor = 'editor',
	Doc = 'doc',
	Edit = 'edit',
	Edit2 = 'edit2',
	Agent = 'editAgent',
	Generate = 'generate',
	SearchPanel = 'searchPanel',
	SearchKeywords = 'searchKeywords',
	AskAgent = 'askAgent',
}

export const GITHUB_PLATFORM_AGENT = 'github.copilot-dynamic.platform';

// TODO@jrieken THIS IS WEIRD. We should read this from package.json
export const agentsToCommands: Partial<Record<Intent, Record<string, Intent>>> = {
	[Intent.VSCode]: {
		'search': Intent.Search,
		'startDebugging': Intent.StartDebugging,
	},
	[Intent.Terminal]: {
		'explain': Intent.TerminalExplain
	},
	[Intent.Editor]: {
		'doc': Intent.Doc,
		'fix': Intent.Fix,
		'explain': Intent.Explain,
		'review': Intent.Review,
		'tests': Intent.Tests,
		'edit': Intent.Edit,
		'generate': Intent.Generate
	}
};

// TODO@roblourens gotta tighten up the terminology of "commands", "intents", etc...
export function getAgentForIntent(intentId: Intent, location: ChatLocation): { agent: string; command?: string } | undefined {
	if (Object.keys(agentsToCommands).includes(intentId)) {
		return { agent: intentId };
	}

	for (const [agent, commands] of Object.entries(agentsToCommands)) {
		if (location === ChatLocation.Editor && agent !== Intent.Editor) {
			continue;
		}

		if (Object.values(commands).includes(intentId)) {
			return { agent, command: intentId };
		}
	}
}

export const EXTENSION_ID = 'GitHub.copilot-chat';

// Workspace-related constants moved from deleted workspaceContext
export const MAX_CHUNK_TITLE_LENGTH = 60;
export const MAX_CHUNKS_IN_WORKSPACE_SEARCH_INSTRUCTION = 40;

// Types that were in the deleted workspaceContext
export interface ChunksToolProps {
	readonly query?: string;
	readonly maxChunks?: number;
	readonly tokenBudget?: number;
}