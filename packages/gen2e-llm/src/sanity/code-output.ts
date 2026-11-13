const MARKDOWN_BLOCK_TOKEN = "```";

const MARKDOWN_TS_BLOCK_TOKEN = "```ts";

const MARKDOWN_JSON_BLOCK_TOKEN = "```json";

const MARKDOWN_JS_BLOCK_TOKEN = "```js";

const MARKDOWN_TYPESCRIPT_BLOCK_TOKEN = "```typescript";

const MARKDOWN_JAVASCRIPT_BLOCK_TOKEN = "```javascript";

export const sanitizeCodeOutput = (llmOutput: string): string => {
  // Models sometimes wrap code in markdown fences despite being told not to.
  if (llmOutput.length > 6) {
    for (let k = 0; k < llmOutput.length - 6; ++k) {
      if (llmOutput.substring(k, k + MARKDOWN_BLOCK_TOKEN.length) === "```" && k > 0) {
        llmOutput = llmOutput.slice(k);
        break;
      }
    }
  }

  for (const startToken of [
    MARKDOWN_TYPESCRIPT_BLOCK_TOKEN,
    MARKDOWN_JAVASCRIPT_BLOCK_TOKEN,
    MARKDOWN_TS_BLOCK_TOKEN,
    MARKDOWN_JSON_BLOCK_TOKEN,
    MARKDOWN_JS_BLOCK_TOKEN,
    MARKDOWN_BLOCK_TOKEN,
  ]) {
    if (llmOutput.startsWith(startToken)) {
      llmOutput = llmOutput.slice(startToken.length, llmOutput.length);
      break;
    }
  }

  if (llmOutput.endsWith(MARKDOWN_BLOCK_TOKEN) || llmOutput.endsWith(`${MARKDOWN_BLOCK_TOKEN}\n`)) {
    llmOutput = llmOutput.slice(
      0,
      llmOutput.length - (MARKDOWN_BLOCK_TOKEN.length + (llmOutput.endsWith("\n") ? 1 : 0)),
    );
    llmOutput = llmOutput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  return llmOutput;
};
