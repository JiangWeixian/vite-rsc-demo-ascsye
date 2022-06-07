import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rsc from './vendor/react-server-dom-vite/plugin';
import { configureViteDevServer } from './server/api.server';

export default defineConfig({
  plugins: [
    rsc(),
    react(),
    {
      name: 'custom-api-plugin',
      configureServer: configureViteDevServer,
    },
  ],

  optimizeDeps: {
    include: ['react', 'react-error-boundary', 'marked', 'sanitize-html'],
  },

  // The following is just wiring the vendor folder as NPM dependency
  resolve: {
    alias: {
      'react-server-dom-vite/client-proxy': path.resolve(
        __dirname,
        './vendor/react-server-dom-vite/esm/react-server-dom-vite-client-proxy.js'
      ),
      'react-server-dom-vite': path.resolve(
        __dirname,
        './vendor/react-server-dom-vite/esm/react-server-dom-vite.js'
      ),
    },
  },
});
