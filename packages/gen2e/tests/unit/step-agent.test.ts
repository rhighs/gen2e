import { beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { makeLogger } from "@rhighs/gen2e-logger";
import { getDomRevision, getSnapshot } from "../../src/snapshot";
import { type Gen2EStepAgentInit, runStepAgent } from "../../src/step-agent";
import type { Page } from "../../src/types";
import { promptText, scriptedModel, toolTurn } from "../support/scripted-model";

mock.module("../../src/snapshot", () => ({
  getSnapshot: jest.fn(),
  getDomRevision: jest.fn(),
  installDomRevisionTracker: jest.fn(),
}));

const mockGetSnapshot = getSnapshot as jest.Mock<typeof getSnapshot>;

const mockGetDomRevision = getDomRevision as jest.Mock<typeof getDomRevision>;

const page = { url: () => "https://example.com" } as Page;

const submit = (code: string) => toolTurn({ name: "run_expression", input: { code } });

const wrapped = (code: string) => `(async () => { ${code} })`;

const run = (overrides: Partial<Gen2EStepAgentInit> & Pick<Gen2EStepAgentInit, "model">) =>
  runStepAgent({
    task: "click go",
    page,
    evalCode: jest.fn().mockResolvedValue("ok"),
    endpoint: {},
    maxEvals: 3,
    screenshot: "off",
    visualInfoLevel: "none",
    logger: makeLogger("TEST"),
    ...overrides,
  });

describe("runStepAgent", () => {
  beforeEach(() => {
    mockGetSnapshot.mockResolvedValue({ dom: "<html>dom</html>", screenshot: Buffer.from("img") });
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
  });

  test("runs the submitted code on the page and stops on success", async () => {
    const model = scriptedModel([submit("await page.click('#go')")]);
    const evalCode = jest.fn().mockResolvedValue("clicked");

    const res = await run({ model, evalCode });

    expect(res).toMatchObject({
      type: "success",
      expression: wrapped("await page.click('#go')"),
      evalResult: "clicked",
      attempts: 1,
    });
    expect(evalCode).toHaveBeenCalledWith(wrapped("await page.click('#go')"), page);
    expect(promptText(model, 0)).toContain("<html>dom</html>");
  });

  test("returns the evaluation error to the model and retries in the same conversation", async () => {
    const model = scriptedModel([submit("await a()"), submit("await b()")]);
    const evalCode = jest
      .fn()
      .mockRejectedValueOnce(new Error("no element"))
      .mockResolvedValue("ok");

    const res = await run({ model, evalCode });

    expect(res).toMatchObject({ type: "success", expression: wrapped("await b()"), attempts: 2 });
    expect(promptText(model, 1)).toContain("no element");
  });

  test("gives up after maxEvals failed evaluations", async () => {
    const model = scriptedModel([submit("await a()"), submit("await b()"), submit("await c()")]);
    const evalCode = jest.fn().mockRejectedValue(new Error("boom"));

    const res = await run({ model, evalCode, maxEvals: 2 });

    expect(res).toMatchObject({ type: "error", errors: ["boom", "boom"], attempts: 2 });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  test("rejects code that does not parse without running it", async () => {
    const model = scriptedModel([submit("await ("), submit("await ok()")]);
    const evalCode = jest.fn().mockResolvedValue("ok");

    const res = await run({ model, evalCode });

    expect(res).toMatchObject({ type: "success", attempts: 1 });
    expect(evalCode).toHaveBeenCalledTimes(1);
  });

  test("sends the current DOM back only when the page changed", async () => {
    const moved = scriptedModel([submit("await a()"), submit("await b()")]);
    mockGetDomRevision
      .mockResolvedValueOnce({ navigations: 0, mutations: 0 })
      .mockResolvedValue({ navigations: 0, mutations: 1 });
    const evalCode = () => jest.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");

    await run({ model: moved, evalCode: evalCode() });

    expect(promptText(moved, 1)).toContain("Current DOM");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);

    mockGetSnapshot.mockClear();
    mockGetDomRevision.mockResolvedValue({ navigations: 0, mutations: 0 });
    const still = scriptedModel([submit("await a()"), submit("await b()")]);

    await run({ model: still, evalCode: evalCode() });

    expect(promptText(still, 1)).not.toContain("Current DOM");
    expect(mockGetSnapshot).toHaveBeenCalledTimes(1);
  });

  test("starts on the cheap model and escalates to the primary after a failure", async () => {
    const cheap = scriptedModel([submit("await a()")], "cheap");
    const primary = scriptedModel([submit("await b()")], "primary");
    const evalCode = jest.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");

    const res = await run({ model: primary, ladder: { cheapModel: cheap }, evalCode });

    expect(res.type).toBe("success");
    expect(cheap.doGenerateCalls).toHaveLength(1);
    expect(primary.doGenerateCalls).toHaveLength(1);
    expect(res.usage.map((u) => u.model)).toEqual(["mock-provider:cheap", "mock-provider:primary"]);
  });

  test("attaches the screenshot for a vision model under the model policy", async () => {
    const vision = scriptedModel([submit("await a()")], "gpt-4o");
    const text = scriptedModel([submit("await a()")], "text-only");

    await run({ model: vision, screenshot: "model" });
    await run({ model: text, screenshot: "model" });

    expect(promptText(vision, 0)).toContain("image/jpeg");
    expect(promptText(text, 0)).not.toContain("image/jpeg");
  });

  test("adds a screenshot only after the first failure under the onfail policy", async () => {
    const model = scriptedModel([submit("await a()"), submit("await b()")], "gpt-4o");
    const evalCode = jest.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");

    await run({ model, screenshot: "onfail", evalCode });

    expect(promptText(model, 0)).not.toContain("image/jpeg");
    expect(promptText(model, 1)).toContain("image/jpeg");
  });

  test("reports a model error as a failed step", async () => {
    const model = scriptedModel([]);
    model.doGenerate = () => {
      throw new Error("provider down");
    };

    const res = await run({ model });

    expect(res.type).toBe("error");
    expect(res.type === "error" && res.errors.join()).toContain("provider down");
  });
});
