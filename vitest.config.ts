import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        maxForks: 1,
        minForks: 1,
      },
    },
    testTimeout: 30000, // 30 seconds for DAP tests
    hookTimeout: 30000, // 30 seconds for DAP tests
  },
});