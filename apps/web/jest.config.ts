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
  /**
   * 15s rather than Jest's 5s default.
   *
   * These suites drive real Radix interactions (menus, dialogs, drawers) that
   * mount portals and settle effects. Several legitimately take 2-6s on their
   * own, and under full-suite parallelism they exceeded the 5s default — failing
   * as timeouts rather than on any assertion, and passing in isolation. The work
   * is real, not slow-by-accident, so the budget is raised instead of trimming
   * the interactions.
   */
  testTimeout: 15_000,
  moduleNameMapper: {
    // Must precede the "@/" rule. The real next/cache pulls in Next's server
    // runtime and cannot load under jsdom — see test-mocks/next-cache.ts.
    "^next/cache$": "<rootDir>/test-mocks/next-cache.ts",
    "^@/(.*)$": "<rootDir>/$1",
    "^@bookprinta/shared$": "<rootDir>/../../packages/shared/index.ts",
    "^@bookprinta/shared/(.*)$": "<rootDir>/../../packages/shared/$1",
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
