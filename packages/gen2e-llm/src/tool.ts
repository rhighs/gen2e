import type { z } from "zod";

export type Gen2EAgentToolResult = {
  output: string;
  isError?: boolean;
  terminate?: boolean;
};

export type Gen2EAgentToolContext = {
  signal?: AbortSignal;
};

export type Gen2EAgentTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (
    input: unknown,
    ctx: Gen2EAgentToolContext,
  ) => Promise<Gen2EAgentToolResult> | Gen2EAgentToolResult;
};

export const defineTool = <S extends z.ZodType>(def: {
  name: string;
  description: string;
  inputSchema: S;
  execute: (
    input: z.output<S>,
    ctx: Gen2EAgentToolContext,
  ) => Promise<Gen2EAgentToolResult> | Gen2EAgentToolResult;
}): Gen2EAgentTool => ({
  name: def.name,
  description: def.description,
  inputSchema: def.inputSchema,
  execute: (input, ctx) => {
    const parsed = def.inputSchema.safeParse(input);
    if (!parsed.success) {
      return { output: `invalid input: ${parsed.error.message}`, isError: true };
    }
    return def.execute(parsed.data, ctx);
  },
});
