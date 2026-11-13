# @rhighs/gen2e-store

This package provides the static store backends for [gen2e](https://github.com/rhighs/gen2e):

- `FSStaticStore` writes atomically and quarantines entries that fail.
- `InMemoryStaticStore` keeps steps in memory.
- `exportStoreToDir` and `importDirIntoStore` move a cache in and out of a single bundle file, for CI caching.

```ts
import { InMemoryStaticStore, exportStoreToDir } from "@rhighs/gen2e-store";

const store = new InMemoryStaticStore();
exportStoreToDir(store, ".ci-cache");
```

MIT licensed.
