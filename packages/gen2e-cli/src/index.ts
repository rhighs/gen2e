import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { program } from "commander";
import util from "util";
import path from "path";
import readline from "readline";
import { type Gen2EExpression, StaticGenStep } from "@rhighs/gen2e";
import { makeLogger } from "@rhighs/gen2e-logger";
import { recordingInterpreter } from "@rhighs/gen2e-interpreter";
import { Gen2EPOGenerator, loadDumps } from "@rhighs/gen2e-po";

import * as pjson from "../package.json";
import { makeREPL } from "./repl";
const logger = makeLogger("GEN2E-CLI");

program
  .name(pjson["name"])
  .description(pjson["description"])
  .version(pjson["version"]);

program
  .command("generate")
  .description("Generate test code given a .gen2e file")
  .argument("<file>", "file containing tasks specs")
  .option("--debug", "enabled debug mode, shows debug logs and more")
  .option(
    "--imode <imode>",
    "interpreter output mode, either gen2e IL or plain generated playwright code",
    /^(gen2e|playwright)$/,
    "gen2e"
  )
  .option("--openai-api-key <openaiApiKey>", "api key for openai services")
  .option(
    "--model <model>",
    "model to use for each task, set this to use this model for all tasks"
  )
  .option(
    "--gen2e-model <gen2eModel>",
    "model to use for gen2e source code generation"
  )
  .option(
    "--pw-model <pwModel>",
    "model to use for playwright source code generation"
  )
  .option(
    "-s, --stats",
    "show interpreter stats report, number of tokens being used and total llm calls",
    false
  )
  .option(
    "-o, --out <out>",
    "optional output file for the generated code, overwrite any existing file"
  )
  .option(
    "-a, --append <append>",
    "optionally append generated code to an existing file"
  )
  .option(
    "-v, --verbose",
    "show the generated expression at each step in stderr (has no effect with debug mode enabled)"
  )
  .option(
    "-sp, --screenshot <screenshot>",
    "screenshotting policy to use when inspecting web pages, only used for playwright mode",
    /^(force|onfail|model|off)$/,
    "onfail"
  )
  .option(
    "-vd, --visual-debug <visualDebug>",
    "visual debug cue, determines quantity of visual info per page screenshot (no-outlines, outlines, outlines + tagnames)",
    /^(medium|high|none)$/,
    "medium"
  )
  .option(
    "-k, --max-retries <maxRetries>",
    "max number of retries allowed per each playwright instruction",
    (value: string, _prev): number => {
      const v = parseInt(value, 10);
      if (isNaN(v)) {
        return 3;
      }
      return v;
    }
  )
  .action(async (file, options) => {
    const verbose = options.verbose ? true : false;
    const isDebug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const gen2eModel = options.gen2eModel;
    const pwModel = options.pwModel;
    const imode = options.imode;
    const showStats = options.stats ?? false;
    const outFile = options.out;
    const visualDebugLevel = options.visualDebug ?? "medium";
    const appendFile = options.append;
    const maxRetries = options.maxRetries;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;
    const tasksFile = readFileSync(file).toString();
    const screenshot = options.screenshot;

    const tasks = tasksFile
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const interpreter = recordingInterpreter(
      {
        mode: imode,
        logger,
      },
      {
        model,
        playwrightModel: pwModel,
        gen2eModel: gen2eModel,
        debug: isDebug,
        openaiApiKey: apiKey,
        recordUsage: showStats,
        policies: {
          maxRetries,
          screenshot,
          visualDebugLevel,
        },
      }
    )
      .on("start", () => {
        if (!isDebug) {
          logger.debug("Generating expressions...");
        }
      })
      .on("ai-message", (_, message) => {
        if (isDebug) {
          logger.debug(`ai message`, message);
        }
      })
      .on("task-success", (i, result: Gen2EExpression) => {
        if (!isDebug) {
          if (verbose) {
            logger.info(
              `task step "${result.task}" has generated code:\n${result.expression}`
            );
          }
        }
      })
      .on("task-error", (_, error: Error | string) => {
        logger.error(`Failed generating expression due to error:`);
        logger.error(error);
        logger.error("Aborting...");
        process.exit(1);
      });

    await interpreter.start();
    for (let task of tasks) {
      await interpreter.update(task);
    }

    const result = await interpreter.finish();
    const code = result.code;
    process.stdout.write(`${code}\n`);

    // if (result.usageStats) {
    //   logger.info("interpreter usage stats report", result.usageStats);
    // }

    if (appendFile) {
      logger.info(`appending result to ${outFile}...`);
      appendFileSync(appendFile, code);
      logger.info(`done appending result to ${outFile}`);
    } else if (outFile) {
      logger.info(`writing result to ${outFile}...`);
      writeFileSync(outFile, code, {
        flag: "wx",
      });
      logger.info(`done writing result to ${outFile}`);
    }
  });

program
  .command("recorder")
  .description("Generate test code one instruction at a time")
  .option("--debug", "enabled debug mode, shows debug logs and more")
  .option(
    "--imode <imode>",
    "interpreter output mode, either gen2e IL or plain generated playwright code",
    /^(gen2e|playwright)$/,
    "gen2e"
  )
  .option("--openai-api-key <openaiApiKey>", "api key for openai services")
  .option(
    "--model <model>",
    "model to use for each task, set this to use this model for all tasks"
  )
  .option(
    "--gen2e-model <gen2eModel>",
    "model to use for gen2e source code generation"
  )
  .option(
    "--pw-model <pwModel>",
    "model to use for playwright source code generation"
  )
  .option(
    "-s, --stats",
    "show interpreter stats report, number of tokens being used and total llm calls",
    false
  )
  .option(
    "-o, --out <out>",
    "optional output file for the generated code, overwrite any existing file"
  )
  .option(
    "-a, --append <append>",
    "optionally append generated code to an existing file"
  )
  .option(
    "-v, --verbose",
    "show the generated expression at each step in stderr (has no effect with debug mode enabled)"
  )
  .option(
    "-sp, --screenshot <screenshot>",
    "screenshotting policy to use when inspecting web pages, only used for playwright mode",
    /^(force|onfail|model|off)$/,
    "onfail"
  )
  .option(
    "-vd, --visual-debug <visualDebug>",
    "visual debug cue, determines quantity of visual info per page screenshot (no-outlines, outlines, outlines + tagnames)",
    /^(medium|high|none)$/,
    "medium"
  )
  .option(
    "-k, --max-retries <maxRetries>",
    "max number of retries allowed per each playwright instruction",
    (value: string, _prev): number => {
      const v = parseInt(value, 10);
      if (isNaN(v)) {
        return 3;
      }
      return v;
    }
  )
  .action(async (options) => {
    const verbose = options.verbose ? true : false;
    const isDebug = options.debug ? true : undefined;
    const model = options.model ? String(options.model).trim() : undefined;
    const gen2eModel = options.gen2eModel;
    const pwModel = options.pwModel;
    const imode = options.imode;
    const showStats = options.stats ?? false;
    const visualDebugLevel = options.visualDebug ?? "medium";
    const maxRetries = options.maxRetries;
    const apiKey = options.openaiApiKey
      ? String(options.openaiApiKey).trim()
      : undefined;
    const screenshot = options.screenshot;

    const outFile = options.out;
    const appendFile = options.append;

    const interpreter = recordingInterpreter(
      {
        mode: imode,
        logger,
      },
      {
        model,
        playwrightModel: pwModel,
        gen2eModel: gen2eModel,
        debug: isDebug,
        openaiApiKey: apiKey,
        recordUsage: showStats,
        policies: {
          maxRetries,
          screenshot,
          visualDebugLevel,
        },
      }
    )
      .on("start", () => {
        if (!isDebug) {
          logger.debug("Generating expressions...");
        }
      })
      .on("ai-message", (_, message) => {
        if (isDebug) {
          logger.debug(`ai message`, message);
        }
      })
      .on("task-success", (i, result: Gen2EExpression) => {
        if (!isDebug) {
          if (verbose) {
            logger.info(
              `task step "${result.task}" has generated code:\n${result.expression}`
            );
          }
        }
      })
      .on("task-error", (_, error: Error | string) => {
        logger.error(`Failed generating expression due to error:`);
        logger.error(error);
        logger.error("Aborting...");
        process.exit(1);
      });

    const makePrompt = (state: "idle" | "recording") =>
      `\x1b[33mGen2E Recorder [${(state as string).toUpperCase()}] >>>\x1b[0m `;

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: makePrompt("idle"),
    });

    const evaluate = async (input: string) => {
      input = input.trim();

      const printHelp = () => {
        const helpMessage = `\
        /start - Start the interpreter
        /stop - Stop the interpreter and get the result
        /peek - Peek at the current state of the interpreter
        /dump - Dump current recorder state info to a file (playwright mode only)
        /help - Display this help message`;
        process.stdout.write(`\n${helpMessage}\n`);
      };

      if (input === "/help") {
        printHelp();
        return;
      }

      const formatCodeOutput = (peek: {
        tasks: string[] | undefined;
        gen2eCode: string;
        code: string;
        mem?: { [key: string]: StaticGenStep };
      }) => `tasks:
${peek.tasks ? peek.tasks.join("\n") : "no tasks available"}

gen2e IL:
${peek.gen2eCode}

${peek.mem ? `mem:\n${util.inspect(peek.mem)}` : ""}

playwright code:
${peek.code}`;

      if (interpreter.ready()) {
        switch (input) {
          case "/stop":
            {
              const result = await interpreter.finish();
              const out = formatCodeOutput(result);
              process.stdout.write(out + "\n");
              rl.setPrompt(makePrompt("idle"));

              if (appendFile) {
                logger.info(`appending result to ${appendFile}...`);
                appendFileSync(appendFile, result.code);
                logger.info(`done appending result to ${appendFile}`);
              } else if (outFile) {
                logger.info(`writing result to ${outFile}...`);
                writeFileSync(outFile, result.code, {
                  flag: "wx",
                });
                logger.info(`done writing result to ${outFile}`);
              }
            }
            break;
          case "/peek":
            {
              const peek = interpreter.peek();
              const out = formatCodeOutput(peek);
              process.stdout.write(out + "\n");
            }
            break;
          case "/dump":
            {
              const dump = interpreter.dump();
              const filepath = path.join(
                process.cwd(),
                `gen2e-dump_${dump.testId}.json`
              );
              writeFileSync(filepath, JSON.stringify(dump, null, 4));
              process.stdout.write(`test info dumped at ${filepath}\n`);
            }
            break;
          default:
            {
              const interm = await interpreter.update(input);
              process.stdout.write(interm.result + "\n");
            }
            break;
        }
      } else {
        if (input === "/start") {
          await interpreter.start();
          rl.setPrompt(makePrompt("recording"));
        } else {
          process.stdout.write(
            `\n        Recorder is not recording, use command / start\n`
          );
          printHelp();
        }
      }
    };

    rl.prompt();
    rl.on("line", async (input) => {
      await evaluate(input);
      rl.prompt();
    }).on("close", async () => {
      await interpreter.teardown();
    });
  });

program
  .command("po-gen")
  .description("generate a page objects via test dumps")
  .argument("[dumppath]", "directory path containing test json dumps")
  .option("-d, --root-dir <rootDir>")
  .action(async (dumppath, options) => {
    const dpath = dumppath;

    const dumps = await loadDumps(dpath);
    const generator = new Gen2EPOGenerator({
      debug: true,
      staticDataDir: options.rootDir,
    });

    for (let dump of dumps) {
      const blocks = dump.blocks.map((b) => b.blocks).flat();
      for (let i = 0; i < blocks.length; i++) {
        await generator.generate(
          blocks[i],
          i + 1 < blocks.length ? blocks[i + 1] : undefined
        );
      }
    }
  });

program
  .command("repl")
  .description("Simple repl mode with no test generation")
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

program.parse(process.argv);
