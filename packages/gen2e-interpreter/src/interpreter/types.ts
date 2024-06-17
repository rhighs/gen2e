import { Gen2EGenPolicies } from "@rhighs/gen2e";
import { Gen2EBrowserOptions } from "./browser";
import { Gen2ELogger } from "@rhighs/gen2e-logger";
import { Gen2EInterpreterInMemStatic } from "./store";

export type Gen2EInterpreterEvent =
  | "start"
  | "end"
  | "task-success"
  | "task-error"
  | "ai-message";
export type Gen2EInterpreterEventCallback = (...args: any[]) => void;

export type Gen2EInterpreterOptions = {
  debug?: boolean;
  model?: string;
  gen2eModel?: string;
  playwrightModel?: string;
  openaiApiKey?: string;
  recordUsage?: boolean;
  policies?: Gen2EGenPolicies;
};

export type Gen2EInterpreterMode = "gen2e" | "playwright";

export type Gen2EInterpreterConfig = {
  mode?: Gen2EInterpreterMode;
  browserOptions?: Gen2EBrowserOptions;
  logger?: Gen2ELogger;
};

export type Gen2EInpterpreterPerModelStats = {
  model: string;
  completionTokens: number;
  totalTokens: number;
  promptTokens: number;
  toolCalls?: number;
};

export type Gen2EInterpreterUsageStats = {
  perModel: Gen2EInpterpreterPerModelStats[];
  totalCalls: number;
  completionTokens: number;
  totalTokens: number;
  promptTokens: number;
};

export type Gen2EInterpreterResult = {
  result: string;
  usageStats?: Gen2EInterpreterUsageStats;
};

export type Gen2ERecordingResult = {
  tasks: string[];
  gen2eCode: string;
  code: string;
};

export type Gen2ERecordingStep = {
  result: string;
};

export type Gen2ERecordingPeekResult = {
  tasks: string[];
  gen2eCode: string;
  code: string;
  mem: Gen2EInterpreterInMemStatic;
};

export type Gen2ERecordingDump = {
  testId: string;
  blocks: Gen2ECodeBlock[];
  compiledTestCode: string;
  gen2eTestCode: string;
};

export type Gen2ECodeBlock = {
  task: string;
  blocks: Gen2EPlaywrightBlock[];
};

export type Gen2EPlaywrightBlock = {
  body: string;
  context?: Gen2EPlaywrightGenContext;
};

export type Gen2EPlaywrightGenContext = {
  task?: string;
  testTitle?: string;
  notes?: string;
  refs?: {
    screenshotPath?: string;
    htmlPath?: string;
    pageUrl: string;
  };
};
