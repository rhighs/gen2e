// Registers the library-configured base path before the store module loads,
// so deep imports of this file keep honoring `staticStorePath`.
import "../index";

export {
  type BundleableStaticStore,
  type BundleEntry,
  exportStoreToDir,
  FSStaticStore,
  InMemoryStaticStore,
  importDirIntoStore,
  preload,
  type StaticStoreBundle,
} from "@rhighs/gen2e-store";
