import { StaticStore, StaticGenStep } from "@rhighs/gen2e";

export type Gen2EInterpreterInMemStatic = { [key: string]: StaticGenStep };

export const inMemStore = (
  id: string
): [() => Gen2EInterpreterInMemStatic, StaticStore] => {
  const inMemoryStatic: Gen2EInterpreterInMemStatic = {};
  const staticStore: StaticStore = {
    makeIdent: (title, task) => `[${title}](${task}) ${id}`,
    fetchStatic: (ident: string) => inMemoryStatic[ident],
    makeStatic: (ident: string, content: StaticGenStep) =>
      (inMemoryStatic[ident] = content),
  };
  return [() => inMemoryStatic, staticStore];
};
