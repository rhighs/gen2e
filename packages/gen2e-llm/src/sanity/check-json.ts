export const validateJSONString = (code: string): boolean => {
  if (!code) {
    return false;
  }

  try {
    const _result = JSON.parse(code);
    return true;
  } catch (e) {
    if (process.env.GEN2E_SV_LOG_ERR) {
      console.error("js error", e, `got code ${code}`);
    }
    return false;
  }
};
