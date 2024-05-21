# Gen2E Interpreter

This npm package contains implementations for NL interpretations into gen2e code. With this interpreter you can navigate web pages interactively or convert a list of plain english tasks into compiled playwright code.

## Configuration

TODO: this is still work in progress, some Configuration options are available both as CLI commands or environment variables

## Environment variables

### Gen2E Interpreter
- **GEN2E_SANDBOX_DEBUG**
  controls debug mode for the sandbox environment in gen2e, increases verbosity in sandboxed test runs.

- **GEN2E_INTERPRETER_DBG**
  enables debug mode for the gen2e interpreter.

- **GEN2E_INTERPRETER_OPENAI_MODEL**
  sets the default model used by the gen2e interpreter, with a fallback to "gpt-3.5-turbo" if not specified.