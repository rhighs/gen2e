let configuredBasePath: string | undefined;

// gen2e pushes `staticStorePath` from its config here; the store cannot read that config itself.
export const setStaticBasePath = (value?: string): void => {
  configuredBasePath = value;
};

// Resolved on every call so env and config changes made after import apply.
export const staticBasePath = (): string =>
  configuredBasePath ?? process.env.GEN2E_STATIC_PATH ?? ".static";
