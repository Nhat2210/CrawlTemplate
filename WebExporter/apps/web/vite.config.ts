import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: Number(env.WEB_PORT || 3000),
      strictPort: true,
      proxy: { "/api": { target: `http://127.0.0.1:${env.PORT || 4310}` } },
    },
    build: {
      outDir: fileURLToPath(new URL("../../dist/web", import.meta.url)),
      emptyOutDir: true,
    },
  };
});
