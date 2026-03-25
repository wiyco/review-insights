import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/main.ts",
  output: {
    file: "dist/index.mjs",
    format: "esm",
    minify: true,
  },
  platform: "node",
  resolve: {
    extensions: [
      ".ts",
      ".js",
    ],
  },
});
