import { z } from "zod";
import { Gen2ELLMAgentTool } from "../types";

export const makeTool = (
  validator: (args: { code: string }) => boolean,
  details: string | undefined = undefined
): Gen2ELLMAgentTool<{ code: string }> => ({
  function: (args: { code: string }): Promise<any> | any => {
    return validator(args);
  },
  description: `This function acts as a simple compiler for the generated code. When you pass the generated code to this function,
  it will evaluate the code and return \`true\` if the code is valid. If the function returns \`true\`, you can proceed to the
  next tools (if any) or return the final result to the user.
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
