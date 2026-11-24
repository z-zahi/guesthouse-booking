import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No proxy: as in Lab 5, the browser calls each service directly (addresses in
// src/config.js), so every service lists http://localhost:5173 in CORS_ORIGINS.
export default defineConfig({
  plugins: [react()],
});
