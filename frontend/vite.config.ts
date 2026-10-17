import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy keeps the API same-origin in dev so the httpOnly session cookie "just works".
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
    },
  },
});
