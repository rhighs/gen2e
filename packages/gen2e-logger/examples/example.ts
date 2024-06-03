import logger, { Gen2eLogger, makeLogger } from "../src";

const logStuff = (logger: Gen2eLogger) => {
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
