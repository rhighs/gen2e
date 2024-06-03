import type {Config} from 'jest';

const config: Config = {
      clearMocks: true,
      collectCoverage: false,
      rootDir: '.',
      testMatch: ["<rootDir>/tests/**/*.test.ts"],
      coverageDirectory: "coverage",
      preset: 'ts-jest/presets/default-esm',
      coveragePathIgnorePatterns: ["/node_modules/"],
      transform: {},
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts', '.tsx', '.jsx'],
      moduleNameMapper: {'^(\\.{1,2}/.*)\\.js$': '$1'},
      coverageProvider: "v8",
    
};

export default config;
