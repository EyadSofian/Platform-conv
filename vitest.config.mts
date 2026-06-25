import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Prisma's client is constructed at module import; give it a dummy URL so
    // pure-logic modules can be imported without a live database.
    env: {
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/test?schema=public",
      NODE_ENV: "test",
    },
  },
});
