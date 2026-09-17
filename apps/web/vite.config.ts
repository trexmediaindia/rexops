import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    manifest: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("pdfjs-dist")) return "proof-pdf";
          if (id.includes("video.js")) return "proof-video";
          if (id.includes("@annotorious")) return "proof-image";
          if (id.includes("wavesurfer.js")) return "proof-audio";
          if (id.includes("@liveblocks")) return "realtime";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
});
