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
