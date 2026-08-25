import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "hostgator",
  publicDir: "../public",
  base: "/",
  plugins: [react()],
  build: {
    outDir: "../hostgator-dist",
    emptyOutDir: true,
  },
});
