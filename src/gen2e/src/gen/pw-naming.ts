import OpenAI from "openai";
import { type Page, TaskMessage, TaskResult } from "../types";
import consts from "../constants";
import { LLMGenericError } from "../errors";
import constants from "../constants";

const prompt = (message: TaskMessage) => {
  return `This is your task: ${message.task}
`;
};

const systemMessage = `
You are an AI specialized in inferring test names from given steps of an end-to-end (e2e) test specification.
Your task is to read through the provided list of steps and generate a concise, descriptive test title that
encapsulates the key actions and objectives of the test.

Rules: 
- Read the list of steps provided in the e2e test specification.
- Identify the primary actions and objectives described in the steps.
- Generate a test title that summarizes these actions and objectives in a clear and concise manner.
- The test title you generate must be lowercase only and must not end with '.'
`;

export const generateTestName = async (
  page: Page,
  task: TaskMessage
): Promise<TaskResult<string>> => {
  const openai = new OpenAI({ apiKey: task.options?.openaiApiKey });
  const debug = task.options?.debug ?? consts.DEBUG_MODE;

  const response = await openai.chat.completions.create({
    model: task.options?.model ?? constants.DEFAULT_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt(task) },
    ],
  });

  try {
    const message = response.choices[0].message;
    const title = message.content;
    if (!title) {
      throw new LLMGenericError("empty or null response " + title);
    }

    return {
      type: "success",
      result: title,
    };
  } catch (error) {
    console.error(error.stack);
    return {
      type: "error",
      errorMessage: error.toString(),
    };
  }
};
