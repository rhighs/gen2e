import { parseScript } from "esprima";
export const validateJSCode = (code: string): boolean => {
  try {
    parseScript(`(async () => {${code}})`);
    return true;
  } catch (e) {
    if (process.env.GEN2E_SV_LOG_ERR) {
      console.error("js error", e, `got code ${code}`);
    }
    return false;
  }
};
