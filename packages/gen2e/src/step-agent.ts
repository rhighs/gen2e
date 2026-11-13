import {
  defineTool,
  fitToContext,
  type Gen2EAgentToolResult,
  type Gen2ELLMAgentModel,
  type Gen2ELLMAgentUsageStats,
  type Gen2EModelEndpoint,
  isMarkdownWrapped,
  modelId,
  modelSupportsImage,
  resolveModel,
  runAgent,
  sanitizeCodeOutput,
  validateJSCode,
} from "@rhighs/gen2e-llm";
import type { Gen2ELogger } from "@rhighs/gen2e-logger";
import type { ModelMessage, UserContent } from "ai";
import { z } from "zod";
import { GEN2E_SYSTEM_MESSAGE, stepPrompt } from "./playwright-gen";
import { type DomRevision, getDomRevision, getSnapshot, type WebSnapshotResult } from "./snapshot";
import type {
  Gen2ELadderOptions,
  Gen2ELLMCallHooks,
  Gen2EPlaywriteCodeEvalFunc,
  Gen2EScreenshotUsagePolicy,
  Gen2EVisualDebugLevel,
  Page,
} from "./types";

export type Gen2EStepAgentInit = {
  task: string;
  page: Page;
  evalCode: Gen2EPlaywriteCodeEvalFunc;
  model: Gen2ELLMAgentModel;
  endpoint: Gen2EModelEndpoint;
  maxEvals: number;
  screenshot: Gen2EScreenshotUsagePolicy;
  visualInfoLevel: Gen2EVisualDebugLevel;
  ladder?: Gen2ELadderOptions;
  snapshot?: WebSnapshotResult;
  snapshotRevision?: DomRevision;
  debug?: boolean;
  saveScreenshots?: boolean;
  logger: Gen2ELogger;
  hooks?: Gen2ELLMCallHooks;
};

export type Gen2EStepAgentResult = {
  attempts: number;
  usage: Gen2ELLMAgentUsageStats[];
} & (
  | { type: "success"; expression: string; evalResult: unknown }
  | { type: "error"; errors: string[] }
);

const RUN_EXPRESSION = "run_expression";

const shouldScreenshot = (
  policy: Gen2EScreenshotUsagePolicy,
  model: Gen2ELLMAgentModel,
  failures: number,
): boolean => {
  if (policy === "force") {
    return true;
  }
  if (!modelSupportsImage(model)) {
    return false;
  }
  return policy === "model" || (policy === "onfail" && failures > 0);
};

const screenshotMessage = (screenshot: Buffer): ModelMessage => ({
  role: "user",
  content: [
    { type: "text", text: "Screenshot of the page as it is now." },
    { type: "file", data: screenshot, mediaType: "image/jpeg" },
  ],
});

export const runStepAgent = async (init: Gen2EStepAgentInit): Promise<Gen2EStepAgentResult> => {
  const { page, evalCode, logger, debug, visualInfoLevel } = init;

  const cheapModel = init.ladder?.cheapModel ?? init.model;
  const cheapPolicy =
    init.ladder?.cheapScreenshot ?? (init.screenshot === "force" ? "force" : "off");

  const plan = (failures: number) => {
    const first = init.ladder !== undefined && failures === 0;
    const model = first ? cheapModel : init.model;
    const policy = first ? cheapPolicy : init.screenshot;
    return { model, useScreenshot: shouldScreenshot(policy, model, failures) };
  };

  let revision: DomRevision | undefined;

  // Outlines and debug tags mutate the DOM, so a capture that draws them reads the revision afterwards.
  const capture = async (useScreenshot: boolean): Promise<WebSnapshotResult> => {
    const outlines = useScreenshot && (visualInfoLevel === "medium" || visualInfoLevel === "high");
    const before = outlines ? undefined : await getDomRevision(page);
    const snap = await getSnapshot(page, debug ? logger : undefined, {
      debug,
      screenshot: useScreenshot,
      pageDataTags: useScreenshot && visualInfoLevel === "high",
      pageOutlines: outlines,
      saveScreenShot: useScreenshot && init.saveScreenshots,
      stripLevel: "medium",
    });
    revision = before ?? (await getDomRevision(page));
    return snap;
  };

  const domMoved = async (): Promise<boolean> => {
    const cur = await getDomRevision(page);
    return (
      revision === undefined ||
      cur.navigations !== revision.navigations ||
      cur.mutations !== revision.mutations
    );
  };

  let snapshot: WebSnapshotResult;
  if (init.snapshot) {
    snapshot = init.snapshot;
    revision = init.snapshotRevision ?? (await getDomRevision(page));
  } else {
    snapshot = await capture(plan(0).useScreenshot);
  }

  const errors: string[] = [];
  let attempts = 0;
  let evalResult: unknown;
  let pendingScreenshot: Buffer | undefined;

  const runExpression = defineTool({
    name: RUN_EXPRESSION,
    description:
      "Runs your Playwright code on the live page. On success the step is done. On failure you get the error, and the current DOM if the page changed; fix the code and call this tool again.",
    inputSchema: z.object({
      code: z.string().describe("Plain JavaScript using the `page` variable, without markdown."),
    }),
    execute: async ({ code }): Promise<Gen2EAgentToolResult> => {
      if (isMarkdownWrapped(code.trim())) {
        return {
          output: "Do not wrap the code in markdown; send plain JavaScript.",
          isError: true,
        };
      }

      const body = sanitizeCodeOutput(code);
      if (!validateJSCode(body)) {
        return { output: "The code does not parse as JavaScript.", isError: true };
      }

      const expression = `(async () => { ${body} })`;
      attempts++;
      try {
        evalResult = await evalCode(expression, page);
        return { output: expression, terminate: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);

        if (attempts >= init.maxEvals) {
          return { output: msg, isError: true, terminate: true };
        }

        const next = plan(attempts);
        const needsScreenshot = next.useScreenshot && !snapshot.screenshot;
        const moved = await domMoved();
        if (moved || needsScreenshot) {
          snapshot = await capture(next.useScreenshot);
        }
        if (next.useScreenshot && snapshot.screenshot) {
          pendingScreenshot = snapshot.screenshot;
        }

        const dom = moved ? `\nThe page changed. Current DOM:\n${snapshot.dom}` : "";
        return { output: `${msg.slice(0, 2000)}${dom}`, isError: true };
      }
    },
  });

  const first = plan(0);
  const content: UserContent = [
    {
      type: "text",
      text: fitToContext(first.model, stepPrompt(init.task, snapshot.dom), GEN2E_SYSTEM_MESSAGE),
    },
  ];
  if (first.useScreenshot && snapshot.screenshot) {
    content.push({ type: "file", data: snapshot.screenshot, mediaType: "image/jpeg" });
  }

  const usage: Gen2ELLMAgentUsageStats[] = [];
  let turnModel = first.model;

  const run = await runAgent({
    model: resolveModel(first.model, init.endpoint),
    instructions: GEN2E_SYSTEM_MESSAGE,
    messages: [{ role: "user", content }],
    tools: [runExpression],
    toolChoice: "required",
    maxTurns: init.maxEvals * 2 + 1,
    temperature: 0,
    prepareTurn: () => {
      turnModel = plan(attempts).model;
      const messages = pendingScreenshot ? [screenshotMessage(pendingScreenshot)] : [];
      pendingScreenshot = undefined;
      return { model: resolveModel(turnModel, init.endpoint), messages };
    },
    onEvent: async (event) => {
      if (event.type === "message") {
        if (debug) {
          logger.debug("[agent message]", event.message);
        }
        await init.hooks?.onMessage?.(event.message);
      }
      if (event.type === "turn_end") {
        const stats: Gen2ELLMAgentUsageStats = {
          model: modelId(turnModel),
          completionTokens: event.usage.outputTokens,
          promptTokens: event.usage.inputTokens,
          totalTokens: event.usage.totalTokens,
          task: { prompt: init.task, noToolCalls: event.toolCalls },
        };
        usage.push(stats);
        await init.hooks?.onUsage?.(stats);
      }
      await init.hooks?.onEvent?.(event);
    },
  });

  const terminal = run.terminal;
  if (terminal && !terminal.result.isError) {
    return { type: "success", expression: terminal.result.output, evalResult, attempts, usage };
  }

  if (run.stopReason === "error") {
    errors.push(run.error instanceof Error ? run.error.message : String(run.error));
  } else if (!terminal) {
    errors.push(`the agent stopped without a working expression (${run.stopReason})`);
  }
  return { type: "error", errors, attempts, usage };
};
