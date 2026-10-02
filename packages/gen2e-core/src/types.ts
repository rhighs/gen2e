export type StaticGenStepRefs = {
  screenshotPath?: string;
  htmlPath?: string;
  pageUrl: string;
};

export type StaticGenStep = {
  expression: string;
  context?: {
    task?: string;
    testTitle?: string;
    notes?: string;
    refs?: StaticGenStepRefs;
  };
  meta?: {
    generatedAt: string;
    model?: string;
    promptVersion?: string;
    pageUrl?: string;
    domFingerprint?: string;
    attempts?: number;
  };
};
