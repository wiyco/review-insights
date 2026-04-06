import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: [
      "__tests__/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: [
        "text",
        "lcov",
      ],
      // Keep local coverage failures aligned with .octocov.yml.
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
      include: [
        "src/**/*.ts",
      ],
      // main.ts is the Actions entry point that calls run() at the top level.
      // It cannot be imported in tests without triggering side effects
      // (@actions/core env access, process.exit on failure), so it is
      // excluded from coverage. The modules it orchestrates are each
      // tested independently.
      exclude: [
        "src/main.ts",
        "src/types.ts",
      ],
    },
  },
});
