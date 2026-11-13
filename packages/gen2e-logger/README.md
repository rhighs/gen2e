# @rhighs/gen2e-logger

A colored terminal logger with no dependencies, used by every [gen2e](https://github.com/rhighs/gen2e) package.

```ts
import logger, { makeLogger } from "@rhighs/gen2e-logger";

logger.info("ready", { port: 9999 });

const lines: string[] = [];
const captured = makeLogger("TEST", undefined, (s) => lines.push(s));
captured.warn("goes to lines[]");
```

MIT licensed.
