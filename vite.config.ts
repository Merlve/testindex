import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'framer-motion', 'motion']
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true as const,
    },
    build: {
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          chunkFileNames: (chunkInfo) => {
            const cleanName = (chunkInfo.name || 'chunk').replace(/errors?/gi, 'faults');
            return `assets/${cleanName}-[hash].js`;
          },
        },
      },
    },
  };
});
