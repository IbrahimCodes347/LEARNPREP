import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // No HTTP proxy: the client talks to the API on its own origin
    // (VITE_API_URL), so API paths can never shadow the page routes.
    proxy: {
      '/socket.io': { target: 'http://localhost:5000', ws: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Recharts is the bulk of the bundle; keep it out of the app chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          socket: ['socket.io-client']
        }
      }
    }
  }
});