import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // Relative paths, so the build works under the /<repo>/ path of GitHub Pages.
    base: "./",
    // Listen on all interfaces (also for `vite preview`) so the demo is reachable from the
    // local network IP and from outside a Docker container.
    server: { host: true, proxy: { "/api": "http://localhost:8000" } },
});
