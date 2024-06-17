import globalConfig from "../config";

export const BASE_STATIC_PATH =
  globalConfig.staticStorePath ?? process.env.GEN2E_STATIC_PATH ?? ".static";
