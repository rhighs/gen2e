import { program } from "commander";
import { tasksInterpreter } from "./immediate";
import * as pjson from "../package.json";
import { readFileSync } from "fs";
import { Gen2EExpression } from "@righs/gen2e";
import { info, err } from "./log";
import { makeREPL } from "./repl";

program
  .name(pjson["name"])
  .description(pjson["description"])
  .version(pjson["version"]);

program
  .argument("<file>", "file containg tasks specs")
  .option("--debug", "enabled debug mode, shows debug logs and more")
  .option("--openai-api-key", "api key for openai services")
  .option("--model", "openai model to use for each task")
  .option(
    "-v, --verbose",
    "show the generated expression at each step in stderr (has no effect with debug mode enabled)"
  )
  .action(async (file, options) => {
    const verbose = options.verbose ? true : false;
    const debug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;
    const tasksFile = readFileSync(file).toString();

    const tasks = tasksFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const result = await tasksInterpreter({
      model,
      debug,
      openaiApiKey: apiKey,
    })
      .on("start", () => {
        if (!debug) {
          info("Generating expressions...");
        }
      })
      .on("ai-message", (_, message) => {
        if (debug) {
          err(`DEBUG ai message`, message);
        }
      })
      .on("task-success", (i, result: Gen2EExpression) => {
        if (!debug) {
          if (verbose) {
            info(
              `task step "${result.task}" has generated code:\n${result.expression}`
            );
          }
        }
      })
      .on("task-error", (_, __, error: Error | string) => {
        err(`Failed generating expression due to error:`);
        err(error);
        err("Aborting...");
        process.exit(1);
      })
      .run(tasks);

    process.stdout.write(`${result}\n`);
  });

program
  .command("repl")
  .description(
    "Start in REPL generating gen2e expresison with an interctive browser view"
  )
  .option("-d, --debug", "enabled debug mode, shows debug logs and more")
  .option("--openai-api-key", "api key for openai services")
  .option("--model", "openai model to use for each task")
  .option(
    "--browser <browser>",
    "playwright browser to use (chromium, firefox)"
  )
  .option("--headless", "start browser in headless mode")
  .option("-v, --verbose", "show more REPL activity logging")
  .action(async (options) => {
    const verbose = options.verbose ? true : false;
    const debug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;

    const REPL = makeREPL({
      debug,
      model,
      openaiApiKey: apiKey,
      verbose,
    });

    await REPL.start();
  });

program.parse();
