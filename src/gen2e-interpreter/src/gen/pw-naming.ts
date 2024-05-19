import OpenAI from "openai";
import { debug } from "../log";
import env from "../env";
import { TaskMessage, TaskResult, LLMGenericError } from "@rhighs/gen2e";

const prompt = (message: TaskMessage) => {
  return `This is your list tasks you'll give me a title for:\n ${message.task}
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
- You must only respond with plain text and your response must contains the title ONLY.
- You must not use markdown or any type of text styling format.
`;

export const generateTestName = async (
  task: TaskMessage
): Promise<TaskResult<string>> => {
  const openai = new OpenAI({ apiKey: task.options?.openaiApiKey });
  const isDebug = task.options?.debug ?? env.DEFAULT_MODEL_DEBUG;

  if (isDebug) {
    debug("generating title for tasks:\n", task.task);
  }

  const response = await openai.chat.completions.create({
    model: task.options?.model ?? env.DEFAULT_OPENAI_MODEL,
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

    if (isDebug) {
      debug('title generated: "', task.task, '"');
    }

    return {
      type: "success",
      result: title,
    };
  } catch (error) {
    if (isDebug) {
      debug("title generation gave error", error);
    }
    return {
      type: "error",
      errorMessage: error.toString(),
    };
  }
};
