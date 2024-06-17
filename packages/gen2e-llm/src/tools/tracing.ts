import { Gen2ELLMAgentTool, Gen2LLMAgentTracedTool } from "../types";

export const makeTracedTool = <T extends object>(
  toolFunction: Gen2ELLMAgentTool<T>
): Gen2LLMAgentTracedTool<T> => {
  let _callCount = 0;
  return {
    ...toolFunction,
    function: (args: T): Promise<any> | any => {
      _callCount += 1;
      return toolFunction.function(args);
    },
    callCount: () => _callCount,
  };
};
