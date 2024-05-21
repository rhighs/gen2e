import { ChatCompletionRunner } from "openai/lib/ChatCompletionRunner";
import { ChatCompletionStreamingRunner } from "openai/lib/ChatCompletionStreamingRunner";
import { RunnableFunctionWithParse } from "openai/lib/RunnableFunction";

import { z } from "zod";

export const makeFormatTool = (
  validator: (args: { code: string }) => { success: boolean; reason?: string }
): RunnableFunctionWithParse<{ code: string }> => ({
  function: (
    args: { code: string },
    _runner: ChatCompletionRunner | ChatCompletionStreamingRunner
  ): Promise<any> | any => {
    return validator(args);
  },
  description: `This is a function you use to pass it the generated code you would give as final response to the user.
  This function tell's you if your output format is correct or not; it does so by returning a json of the form:
  { success: <boolean>, reason?: <string> }. This means, if success is false there will be a reason field telling 
  you why the output is wrong, you must next retry and reformat you response according to what error reason you got.
  If success is true, there is no reason field and you can give the generated code to the user.`,
  name: "format_validation_tool",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "Code you have generated and are about to give to the user",
      },
    },
  },
  parse: (args: string) => {
    return z
      .object({
        code: z.string(),
      })
      .parse(JSON.parse(args));
  },
});
