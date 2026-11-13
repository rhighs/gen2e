# Basic example

A small todo app (`app.ts`) with two kinds of tests:

- `todos.gen2e` has one English step per line.
- `todos.gen2e.ts` is a Playwright spec that uses the `ai` fixture next to plain Playwright code.

`gen2e.config.ts` starts the app through Playwright's `webServer`, sets the base URL and defines the `{{first}}` variable.

```bash
export OPENAI_API_KEY="sk-..."
bun install
bun run test                       # first run: the model writes each step, gen2e caches it in .static/
bun run test                       # second run: replays .static/ with no model calls
bunx gen2e --var first="buy eggs"  # override a variable
bunx gen2e eject                   # write todos.spec.ts from the cached steps
```
