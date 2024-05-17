import {
  TestInfo as PlayrightTestInfo,
  type PlaywrightTestArgs,
  type TestType,
} from "@playwright/test";

export { type Page };
import { type Page } from "@playwright/test";
import { StaticStore } from "./static/store/store";

export type Test = TestType<any, any>;

export type StepOptions = {
  debug?: boolean;
  model?: string;
  openaiApiKey?: string;
};

export type TaskMessage = {
  task: string;
  snapshot: {
    dom: string;
  };
  options?: StepOptions;
};

export type TaskResult<T> =
  | {
      type: "error";
      errorMessage: string;
    }
  | {
      type: "success";
      result: T;
    };

export type TestArgs = PlaywrightTestArgs & { gen: GenStepFunction };
export type TestInfo = PlayrightTestInfo;

export type PlaywrightTestFunction = (
  args: PlaywrightTestArgs,
  testInfo: PlayrightTestInfo
) => Promise<void> | void;

export type TestFunction = (
  args: TestArgs,
  testInfo: TestInfo
) => Promise<void> | void;

export interface GenFunction {
  (
    task: string,
    config: { page: Page; test?: Test },
    options?: StepOptions,
    evalCode?: (code: string, p: Page) => Function
  ): Promise<any>;
}

export type GenTestFunction = (
  testFunction: TestFunction,
  store?: StaticStore
) => PlaywrightTestFunction;

export interface GenStepFunction {
  (
    task: string,
    config: { page: Page; test: Test },
    options?: StepOptions,
    evalCode?: (code: string, p: Page) => Function
  ): Promise<any>;
}

export interface GenType extends GenFunction {
  test: GenTestFunction;
}

export type StaticGenStep = {
  ident: string;
  expression: string;
};
