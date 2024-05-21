import {
  ChatCompletionRunner,
  ChatCompletionStreamingRunner,
  RunnableFunctionWithParse,
} from "openai/resources/beta/chat/completions";

export interface TracedRunnableFunctionWithParse<T extends object>
  extends RunnableFunctionWithParse<T> {
  callCount(): number;
}

export const makeTracedTool = <T extends object>(
  toolFunction: RunnableFunctionWithParse<T>
): TracedRunnableFunctionWithParse<T> => {
  let _callCount = 0;
  return {
    ...toolFunction,
    function: (
      args: T,
      _runner: ChatCompletionRunner | ChatCompletionStreamingRunner
    ): Promise<any> | any => {
      _callCount += 1;
      return toolFunction.function(args, _runner);
    },
    callCount: () => _callCount,
  };
};
