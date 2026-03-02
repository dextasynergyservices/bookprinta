import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],

  // Test file patterns
  testMatch: [
    "<rootDir>/**/*.test.ts",
    "<rootDir>/**/*.test.tsx",
    "<rootDir>/**/__tests__/**/*.ts",
    "<rootDir>/**/__tests__/**/*.tsx",
  ],

  // Module path aliases (match tsconfig paths)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },

  // Coverage
  collectCoverageFrom: [
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "stores/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "!components/ui/**",
    "!**/*.d.ts",
    "!**/index.ts",
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

export default createJestConfig(config);
