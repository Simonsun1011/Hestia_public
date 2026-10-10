import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { studioDataPlugin } from "./src/server/studio-data-plugin-v2.mjs";

export default defineConfig({
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "motion-runtime",
              test: /node_modules[\\/](?:motion|motion-dom|motion-utils)[\\/]/,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4178,
    strictPort: true,
    allowedHosts: [],
    watch: { usePolling: process.env.CODEX_SANDBOX === "seatbelt" },
  },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  plugins: [react(), studioDataPlugin()],
});
