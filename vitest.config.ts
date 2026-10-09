import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration dédiée aux tests comportementaux React (npm run test:react).
// - Seuls les fichiers *.spec.ts / *.spec.tsx sous src/ sont collectés :
//   les suites *.test.ts restent exécutées par `node --test` (npm run test:frontend).
// - scratch/ est exclu explicitement (copies locales non suivies du dépôt).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    exclude: ["node_modules/**", "scratch/**", "backend/**", "dist/**"],
    globals: false,
    restoreMocks: true,
    unstubGlobals: true,
  },
});
