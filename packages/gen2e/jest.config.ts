import type { Config } from "jest";

const config: Config = {
  clearMocks: true,
  collectCoverage: false,
  rootDir: ".",
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
  coverageDirectory: "coverage",
  coveragePathIgnorePatterns: ["/node_modules/"],
  testEnvironment: "node",
  preset: "ts-jest",
  coverageProvider: "v8",
  moduleNameMapper: {
    "^@rhighs/gen2e-core$": "<rootDir>/../gen2e-core/src/index.ts",
    "^@rhighs/gen2e-store$": "<rootDir>/../gen2e-store/src/index.ts",
  },
};

export default config;
