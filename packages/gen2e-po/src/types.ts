import { Gen2EPageObjectInfo } from "@rhighs/gen2e-interpreter";
import { Gen2ELLMAgentBuilderOptions } from "@rhighs/gen2e-llm";

export type Gen2EPOCodeGenOptions = Gen2ELLMAgentBuilderOptions;

export type Gen2EPageObjectFileContents = {
  filename: string;
  objects: Gen2EPageObjectInfo[];
  source: string;
};

export type Gen2EPOCodeAPI = {
  list: () => Promise<Gen2EPageObjectFileContents[]>;
  rm: (filepath: string) => Promise<void>;
  touch: (filepath: string, source: string) => Promise<void>;
};
