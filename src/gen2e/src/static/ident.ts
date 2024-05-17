export type MakeIdentFunction = (testTitle: string, task: string) => string;

export const defaultMakeIdent: MakeIdentFunction = (
  testTitle: string,
  task: string
) => `gen2e.lib.static - [${testTitle}](${task})`;
