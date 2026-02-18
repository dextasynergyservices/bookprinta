import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "..",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Run unit + integration tests by default (not e2e)
  testMatch: [
    "<rootDir>/src/**/*.spec.ts",
    "<rootDir>/test/unit/**/*.spec.ts",
    "<rootDir>/test/integration/**/*.spec.ts",
  ],

  // Coverage
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/main.ts",
    "!src/**/*.module.ts",
    "!src/**/*.dto.ts",
    "!src/**/index.ts",
    "!src/prisma/**",
  ],
  coverageDirectory: "./coverage",
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  verbose: true,
};

export default config;
