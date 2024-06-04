import logger, { Gen2ELogger, makeLogger } from "../src";

const logStuff = (logger: Gen2ELogger) => {
  const obj = {
    glossary: {
      title: "example glossary",
      GlossDiv: {
        title: "S",
        GlossList: {
          GlossEntry: {
            ID: "SGML",
            SortAs: "SGML",
            GlossTerm: "Standard Generalized Markup Language",
            Acronym: "SGML",
            Abbrev: "ISO 8879:1986",
            GlossDef: {
              para: "A meta-markup language, used to create markup languages such as DocBook.",
              GlossSeeAlso: ["GML", "XML"],
            },
            GlossSee: "markup",
          },
        },
      },
    },
  };

  logger.debug(
    "This is a debug message",
    { key: "value" },
    [1, 2, 3],
    "additional info"
  );
  logger.info("This is an info message", obj, [4, 5, 6], "extra details");
  logger.warn(
    "This is a warning message",
    { warning: "low memory" },
    ["warning1", "warning2"],
    "check system resources"
  );
  logger.error("This is an error message", new Error("Something went wrong"), {
    errorCode: 123,
  });
};

const previewLog = makeLogger("LOG_PREVIEW", undefined, (s) =>
  s.length > 77 ? s.slice(0, 77) + "..." : s
);
const tagEdit = makeLogger("ANOTHER LOGGER??");

const logs: string[] = [];
const customSink = makeLogger(undefined, undefined, (s) => logs.push(s));

logStuff(logger);
logStuff(previewLog);
logStuff(tagEdit);
logStuff(customSink);

process.stdout.write("logs[] = ");
console.dir(logs);

const newSinks = {
  debug: (msg: string) => console.log("Debug:", msg),
  info: (msg: string) => console.log("Info:", msg),
  warn: (msg: string) => console.warn("Warn:", msg),
  error: (msg: string) => console.error("Error:", msg),
};

const newSerializer = (tag, color, ...args) => {
  const formattedArgs = args.map((arg) => JSON.stringify(arg)).join(" | ");
  return `${tag} [${color}]: ${formattedArgs}`;
};

const loggerWithConfig = makeLogger("CONFIG_LOGGER");
loggerWithConfig.config({ fmt: newSerializer, sinks: newSinks });

loggerWithConfig.debug("This is a debug message");
loggerWithConfig.info("This is an info message");
loggerWithConfig.warn("This is a warning message");
loggerWithConfig.error("This is an error message");

const anotherLogger = makeLogger("ANOTHER_LOGGER", newSerializer, newSinks);

const loggerToConfigure = makeLogger("LOGGER_TO_CONFIGURE");
loggerToConfigure.config(anotherLogger);

loggerToConfigure.debug("This is a debug message");
loggerToConfigure.info("This is an info message");
loggerToConfigure.warn("This is a warning message");
loggerToConfigure.error("This is an error message");
