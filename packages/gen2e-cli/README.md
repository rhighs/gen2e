# @rhighs/gen2e-cli

The `gen2e-cli` command reads a `.gen2e` file with one English instruction per line and compiles it to a Playwright spec. It also has a live recorder, a REPL and page-object generation.

```bash
npm install -g @rhighs/gen2e-cli
export OPENAI_API_KEY="sk-..."
```

```text
Navigate to google.com
Click on "accept all" if a privacy modal is present
Type "Where the aliens at?" in the search bar and press enter
```

```bash
gen2e-cli generate search.gen2e --imode playwright --model gpt-4o-mini --out tests/search.spec.ts
```

The other commands are `recorder`, `repl` and `po-gen`. Run `gen2e-cli <command> --help` to see their flags. The full documentation is in [docs/cli.md](https://github.com/rhighs/gen2e/blob/master/docs/cli.md).

MIT licensed.
