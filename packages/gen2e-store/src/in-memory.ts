import {
  defaultMakeIdent,
  defaultMakeIdentFromContext,
  type StaticGenStep,
} from "@rhighs/gen2e-core";
import type { BundleableStaticStore, BundleEntry } from "./bundle";

/**
 * Process-local static store. Useful for tests, sandboxes and as a CI cache
 * target that is exported to disk with the bundle helpers.
 */
export class InMemoryStaticStore implements BundleableStaticStore {
  public readonly makeIdent = defaultMakeIdent;
  public readonly makeIdentFromContext = defaultMakeIdentFromContext;

  private readonly steps = new Map<string, StaticGenStep>();

  public constructor(initial?: Record<string, StaticGenStep>) {
    if (initial) {
      for (const [key, content] of Object.entries(initial)) {
        this.steps.set(key, content);
      }
    }
  }

  public fetchStatic(ident: string): StaticGenStep | undefined {
    return this.steps.get(ident);
  }

  public makeStatic(
    ident: string,
    content: StaticGenStep,
    options?: { overwrite?: boolean },
  ): void {
    if (!options?.overwrite && this.steps.has(ident)) {
      return;
    }
    this.steps.set(ident, content);
  }

  public quarantine(ident: string, _reason: string): void {
    this.steps.delete(ident);
  }

  public exportEntries(): BundleEntry[] {
    return [...this.steps.entries()].map(([key, content]) => ({ key, content }));
  }

  public importEntries(entries: BundleEntry[], options?: { overwrite?: boolean }): number {
    let imported = 0;
    for (const { key, content } of entries) {
      if (!options?.overwrite && this.steps.has(key)) {
        continue;
      }
      this.steps.set(key, content);
      imported++;
    }
    return imported;
  }

  public clear(): void {
    this.steps.clear();
  }

  public get size(): number {
    return this.steps.size;
  }
}
