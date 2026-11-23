import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore
import { handleLlm } from './llm-proxy.mjs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'llm-proxy',
      configureServer(server) {
        server.middlewares.use('/api/llm', (req, res) => handleLlm(req, res));
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/llm', (req, res) => handleLlm(req, res));
      },
    },
  ],
});
