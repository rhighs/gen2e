import { ChatCompletionRunner } from "openai/lib/ChatCompletionRunner";
import { ChatCompletionStreamingRunner } from "openai/lib/ChatCompletionStreamingRunner";
import { RunnableFunctionWithParse } from "openai/lib/RunnableFunction";

import { z } from "zod";

export const makeTool = (
  validator: (args: { code: string }) => boolean,
  details: string | undefined = undefined
): RunnableFunctionWithParse<{ code: string }> => ({
  function: (
    args: { code: string },
    _runner: ChatCompletionRunner | ChatCompletionStreamingRunner
  ): Promise<any> | any => {
    return validator(args);
  },
  description: `This is a function you use to pass it generated code, this is your simple compiler.
If this function returns true you can go on and go to the next tools if there are any, otherwise you keep generating code
until this function returns true. First thing to try if this fails is to remove escaped new lines and special characters
for spacing. Also make sure to pass a valid json to this function like so: { "code": "<code_string_here>" }.
${
  details?.length
    ? `Additionally, consider these instructions as well: ${details}`
    : ""
}`,
  name: "code_validation_tool",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "Code you have generated for the task you have been asked to accomplish.",
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
