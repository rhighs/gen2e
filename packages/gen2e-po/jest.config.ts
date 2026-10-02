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
};

export default config;
