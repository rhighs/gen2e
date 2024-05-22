# Gen2E CLI

A simple CLI program allowing interfacing with the Gen2E interpreter via both __interpret__ and ***REPL*** mode. Via CLI arguments, you can convert a `.gen2e` file into straight Playwright code or `gen2e` IL.

## What is a `.gen2e` file?

This type of file is really just a list of phrases in plain English. Each phrase is put into a new line and tells the AI agent what actions it must perform to achieve your final goal.

e.g.
```
# Perform a google search

Navigate to google.com
Click on "accept all" if a modal about privacy is present
Type "Where the aliens at?" in the search bar and press enter on the keyboard
```

These three simple tasks will be converted each to a gen2e library expression; which in turn will be evaluated by the gen2e agent and converted into Playwright test code.

The output format for the default command can be selected via params `gen2e` or `playwright` using `--imode <param>`.

## Commands

### Default command

The default command interprets the tasks specified in a `.gen2e` file and outputs either gen2e IL or Playwright code based on the `--imode` parameter.

#### Usage

```sh
gen2e-cli <file> [options]
```

#### Important options

- `--imode <imode>`: Interpreter output mode, either `gen2e` IL or plain generated Playwright code.
- `--debug`: Enables debug mode, showing debug logs and more.
- `--openai-api-key <openaiApiKey>`: API key for OpenAI services.
- `--model <model>`: Model to use for each task, set this to use this model for all tasks.
- `--gen2e-model <gen2eModel>`: Model to use for gen2e source code generation.
- `--pw-model <pwModel>`: Model to use for Playwright source code generation.
- `--stats`: Show interpreter stats report, number of tokens being used, and total LLM calls.
- `--verbose`: Show the generated expression at each step in stderr (has no effect with debug mode enabled).

#### Example

```sh
gen2e-cli tasks.gen2e --imode playwright --openai-api-key YOUR_API_KEY --model gpt-3.5-turbo
```

### REPL command

The REPL command starts an interactive session for generating gen2e expressions with a live browser view. This is useful for debugging and iteratively developing tests.

#### Usage

```sh
gen2e-cli repl [options]
```

#### Important options

- `--debug`: Enables debug mode, showing debug logs and more.
- `--openai-api-key <openaiApiKey>`: API key for OpenAI services.
- `--model <model>`: OpenAI model to use for each task.
- `--browser <browser>`: Playwright browser to use (e.g., `chromium`, `firefox`).
- `--headless`: Start browser in headless mode.
- `--verbose`: Show more REPL activity logging.

#### Example

```sh
gen2e-cli repl --openai-api-key YOUR_API_KEY --model gpt-3.5-turbo --browser chromium
```

### Other commands

For a complete list of commands and options, use the `--help` flag:

```sh
gen2e-cli --help
```

## Demo showcase

WIP
