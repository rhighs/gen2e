/**
 * Type definition for a function that generates an identifier.
 * @param {string} testTitle - The title of the test.
 * @param {string} task - The task description.
 * @returns {string} The generated identifier.
 */
export type MakeIdentFunction = (testTitle: string, task: string) => string;

/**
 * Default implementation of the MakeIdentFunction.
 * Generates an identifier in the format: `gen2e.lib.static - [testTitle](task)`.
 * @param {string} testTitle - The title of the test.
 * @param {string} task - The task description.
 * @returns {string} The generated identifier.
 */
export const defaultMakeIdent: MakeIdentFunction = (
  testTitle: string,
  task: string
) => `gen2e.lib.static - [${testTitle}](${task})`;
