/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Maximum number of chunks that we can provide to the model.
 */
export const MAX_CHUNKS_RESULTS = 128;

/**
 * Maximum number of tokens we will ever use for chunks.
 */
export const MAX_CHUNK_TOKEN_COUNT = 32_000;

export const MAX_TOOL_CHUNK_TOKEN_COUNT = 20_000;
