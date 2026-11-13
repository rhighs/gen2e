export type RunPlan = { plain: string[]; specs: string[] };

export const PLAN_ENV = "GEN2E_RUN";

export const readPlan = (): RunPlan => {
  const raw = process.env[PLAN_ENV];
  return raw ? (JSON.parse(raw) as RunPlan) : { plain: [], specs: [] };
};
