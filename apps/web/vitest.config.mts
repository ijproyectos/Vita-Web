import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas unitarias de lógica pura (sin DOM, sin Supabase). El alias `@/`
// replica el de tsconfig.json para que los módulos se importen igual que en la app.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
