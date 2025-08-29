/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	BasePromptElementProps,
	PromptElement,
	PromptSizing,
} from '@vscode/prompt-tsx';
import { Diagnostic } from '../../../../vscodeTypes';
import { ChunksToolProps } from '../../../common/constants';
import { IDocumentContext } from '../../../prompt/node/documentContext';

// Simple stub for WorkspaceChunks since the codebase tool was removed
const WorkspaceChunks = ({
	query,
	maxChunks,
	tokenBudget,
}: ChunksToolProps) => {
	// Return empty since workspace search functionality was removed
	return null;
};

interface InlineChatWorkspaceSearchProps extends BasePromptElementProps {
	readonly documentContext: IDocumentContext;
	readonly diagnostics: Diagnostic[];
	readonly useWorkspaceChunksFromSelection?: boolean;
	readonly useWorkspaceChunksFromDiagnostics?: boolean;
}

export class InlineChatWorkspaceSearch extends PromptElement<InlineChatWorkspaceSearchProps> {
	render(state: void, sizing: PromptSizing) {
		const {
			useWorkspaceChunksFromSelection,
			useWorkspaceChunksFromDiagnostics,
		} = this.props;

		if (
			!useWorkspaceChunksFromSelection &&
			!useWorkspaceChunksFromDiagnostics
		) {
			return null;
		}

		let tokenBudget = sizing.tokenBudget;
		if (
			useWorkspaceChunksFromSelection &&
			useWorkspaceChunksFromDiagnostics
		) {
			tokenBudget = tokenBudget / 2;
		}
		return (
			<>
				{useWorkspaceChunksFromSelection && (
					<WorkspaceChunks
						{...this.getChunkSearchPropsForSelection()}
					/>
				)}
				{useWorkspaceChunksFromDiagnostics && (
					<WorkspaceChunks
						{...this.getChunkSearchPropsForDiagnostics(tokenBudget)}
					/>
				)}
			</>
		);
	}

	private getChunkSearchPropsForSelection(): ChunksToolProps {
		const { document, wholeRange } = this.props.documentContext;
		let range = document.validateRange(wholeRange);
		this.props.diagnostics.forEach((d) => {
			range = range.union(d.range);
		});
		const selectedText = document.getText(range);

		return {
			query: `Please find code that is similar to the following code block:\n\`\`\`\n${selectedText}\n\`\`\``,
			maxChunks: 3,
		};
	}

	private getChunkSearchPropsForDiagnostics(
		tokenBudget: number,
	): ChunksToolProps {
		const messages = this.props.diagnostics.map((d) => d.message).join(' ');
		const query = `Please find code that can help me fix the following problems: ${messages}`;
		return {
			query,
			maxChunks: 3,
			tokenBudget,
		};
	}
}
