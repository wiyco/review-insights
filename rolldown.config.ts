import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/main.ts",
  output: {
    file: "dist/index.mjs",
    format: "esm",
    minify: true,
    banner:
      'import{createRequire}from"module";const require=createRequire(import.meta.url);',
  },
  platform: "node",
  resolve: {
    extensions: [
      ".ts",
      ".js",
    ],
  },
});
