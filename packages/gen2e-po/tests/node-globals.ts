// jimp treats any runtime with a global `self` as a web worker and fetches fonts by path, which fails under Bun.
Reflect.deleteProperty(globalThis, "self");
