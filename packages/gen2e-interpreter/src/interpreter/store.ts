import { StaticStore } from "@rhighs/gen2e";

export type Gen2EInterpreterInMemStatic = { [key: string]: string };

export const inMemStore = (): [
  () => Gen2EInterpreterInMemStatic,
  StaticStore
] => {
  const inMemoryStatic: { [key: string]: string } = {};
  const staticStore: StaticStore = {
    makeIdent: (title, task) => `gen2.interpreter - [${title}](${task})`,
    fetchStatic: (ident: string) => ({
      ident,
      expression: inMemoryStatic[ident],
    }),
    makeStatic: (content) =>
      (inMemoryStatic[content.ident] = content.expression),
  };
  return [() => inMemoryStatic, staticStore];
};
