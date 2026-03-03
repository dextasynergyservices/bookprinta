import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "..",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/test/tsconfig.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^\\.\\./generated/prisma/client\\.js$": "<rootDir>/test/mocks/prisma-client.mock.ts",
    "^@bookprinta/emails/render$": "<rootDir>/test/mocks/emails-render.mock.ts",
    "^@bookprinta/shared$": "<rootDir>/../../packages/shared/index.ts",
    "^@bookprinta/shared/(.*)$": "<rootDir>/../../packages/shared/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
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
