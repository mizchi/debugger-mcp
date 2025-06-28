import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "dap-mcp": "src/dap/dap-mcp.ts",
    "debug-adapter": "src/dap/debug-adapter.ts",
    "minimal-adapter": "src/dap/minimal-adapter.ts",
    "node-dap-adapter": "src/dap/adapters/node-dap-adapter.ts"
  },
  format: "esm",
  target: "es2022",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node"
  },
  external: [
    "@modelcontextprotocol/sdk",
    "@vscode/debugadapter",
    "neverthrow",
    "zod"
  ]
});