import fs from "fs";
const { readFile } = fs.promises;
import {
  Gen2ELLMAgentModel,
  Gen2ELLMCodeGenAgent,
  Gen2ELLMCodeGenAgentTask,
} from "@rhighs/gen2e-llm";
import { Gen2EPOCodeAPI, Gen2EPOCodeGenOptions } from "./types";
import { FSCodeAPI } from "./code-api";
import { createPOCodeGenAgent } from "./po-gen";
import { Gen2EPlaywrightBlock } from "@rhighs/gen2e-interpreter";
import { loadImageWithLabel } from "./image";
import { Gen2ELogger, makeLogger } from "@rhighs/gen2e-logger";
import { pageObjectsDir } from "./loader";

export type Gen2EPOGeneratorOptions = {
  model?: Gen2ELLMAgentModel;
  codeGenOptions?: Gen2EPOCodeGenOptions;
  debug?: boolean;
};

export class Gen2EPOGenerator {
  codeAPI: Gen2EPOCodeAPI;
  agent: Gen2ELLMCodeGenAgent;
  options: Gen2EPOGeneratorOptions;
  logger: Gen2ELogger;

  /**
   * Creates an instance of Gen2EPOGenerator.
   *
   * @param {Gen2EPOGeneratorOptions} options - The options for the generator.
   * @param {Gen2EPOCodeAPI} [codeAPI=FSCodeAPI] - The code API to use, defaulting to FSCodeAPI.
   * @param {Gen2ELogger} [logger] - Optional logger, defaulting to a new logger instance.
   */
  constructor(
    options: Gen2EPOGeneratorOptions = {},
    codeAPI: Gen2EPOCodeAPI = FSCodeAPI,
    logger?: Gen2ELogger
  ) {
    this.options = options;
    this.codeAPI = codeAPI;
    this.logger = logger ?? makeLogger("GEN2EPO-GENERATOR");
    this.agent = createPOCodeGenAgent(
      options.model,
      codeAPI,
      options.codeGenOptions
    );
  }

  /**
   * Generates page objects based on the provided `from` and `to` blocks.
   *
   * This function loads images from the specified paths in the `from` and `to` blocks, reads HTML content,
   * constructs a task for the page object generator, and invokes the generator.
   *
   * @param {Gen2EPlaywrightBlock} from - The initial Playwright block containing context and references.
   * @param {Gen2EPlaywrightBlock} [to] - The target Playwright block containing context and references (optional).
   * @returns {Promise<void>} - A promise that resolves when the page objects have been generated.
   */
  async generate(
    from: Gen2EPlaywrightBlock,
    to?: Gen2EPlaywrightBlock
  ): Promise<void> {
    const images: Buffer[] = [];
    if (from.context?.refs?.screenshotPath) {
      images.push(
        await loadImageWithLabel(
          from.context?.refs?.screenshotPath,
          "Starting page"
        )
      );
    }
    if (to?.context?.refs?.screenshotPath) {
      images.push(
        await loadImageWithLabel(to.context.refs.screenshotPath, "Result page")
      );
    }

    const fromHtml = from.context?.refs?.htmlPath
      ? (await readFile(from.context?.refs?.htmlPath)).toString()
      : "";
    const t: Gen2ELLMCodeGenAgentTask = {
      task: JSON.stringify({
        dirStructure: await pageObjectsDir(process.cwd()),
        from: {
          expression: from.body,
          pageUrl: from.context?.refs?.pageUrl,
          task: from.context?.task,
          fromHtml,
        },
        to: {
          pageUrl: to?.context?.refs?.pageUrl,
        },
      }),
      images,
    };

    const result = await this.agent(
      {
        ...t,
        options: {
          model: "gpt-4o",
        },
      },
      {
        onMessage: (message) => {
          if (message.role === "tool") {
            this.logger.info(
              "page object generator agent - tool message >>> ",
              message
            );
          }
        },
      }
    );

    if (this.options.debug) {
      this.logger.debug("got generation end result response", result);
    }
  }
}
