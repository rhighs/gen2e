import { readFileSync } from "fs";

import { program } from "commander";

import { type Gen2EExpression } from "@rhighs/gen2e";
import { tasksInterpreter } from "@rhighs/gen2e-intepreter";

import { info, err, debug } from "./log";
import { makeREPL } from "./repl";
import * as pjson from "../package.json";

program
  .name(pjson["name"])
  .description(pjson["description"])
  .version(pjson["version"]);

program
  .argument("<file>", "file containg tasks specs")
  .option("--debug", "enabled debug mode, shows debug logs and more")
  .option(
    "--imode <imode>",
    "interpeter output mode, eihter gen2e IL or plain generated playwright code",
    /^(gen2e|playwright)$/,
    "gen2e"
  )
  .option("--openai-api-key <openaiApiKey>", "api key for openai services")
  .option("--model <model>", "openai model to use for each task")
  .option(
    "-s, --stats",
    "show interpreter stats report, number of tokens being used and total llm calls",
    false
  )
  .option(
    "-v, --verbose",
    "show the generated expression at each step in stderr (has no effect with debug mode enabled)"
  )
  .action(async (file, options) => {
    const verbose = options.verbose ? true : false;
    const isDebug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const imode = options.imode;
    const showStats = options.stats ?? false;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;
    const tasksFile = readFileSync(file).toString();

    const tasks = tasksFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const result = await tasksInterpreter(
      {
        mode: imode,
      },
      {
        model,
        debug: isDebug,
        openaiApiKey: apiKey,
        recordUsage: showStats,
      }
    )
      .on("start", () => {
        if (!isDebug) {
          debug("Generating expressions...");
        }
      })
      .on("ai-message", (_, message) => {
        if (isDebug) {
          debug(`ai message`, message);
        }
      })
      .on("task-success", (i, result: Gen2EExpression) => {
        if (!isDebug) {
          if (verbose) {
            info(
              `task step "${result.task}" has generated code:\n${result.expression}`
            );
          }
        }
      })
      .on("task-error", (_, error: Error | string) => {
        err(`Failed generating expression due to error:`);
        err(error);
        err("Aborting...");
        process.exit(1);
      })
      .run(tasks);

    process.stdout.write(`${result.result}\n`);

    if (result.usageStats) {
      info("interpreter usage stats report", result.usageStats);
    }
  });

program
  .command("repl")
  .description(
    "Start in REPL generating gen2e expresison with an interctive browser view"
  )
  .option("-d, --debug", "enabled debug mode, shows debug logs and more")
  .option("--openai-api-key <openaiApiKey>", "api key for openai services")
  .option("--model <model>", "openai model to use for each task")
  .option(
    "--browser <browser>",
    "playwright browser to use (chromium, firefox)",
    "chromium"
  )
  .option("--headless", "start browser in headless mode")
  .option("-v, --verbose", "show more REPL activity logging")
  .action(async (options) => {
    const verbose = options.verbose ? true : false;
    const isDebug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;

    const REPL = makeREPL({
      browserOptions: {
        browser: options.browser,
        headless: options.headless,
      },
      debug: isDebug,
      model,
      openaiApiKey: apiKey,
      verbose,
    });

    await REPL.start();
  });

program.parse();
