import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handler as officialTolls } from './netlify/functions/official-tolls.mjs';

export default defineConfig({
  plugins: [react(), {
    name: 'local-official-tolls',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/official-tolls', async (request, response) => {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 30000) { response.statusCode = 413; response.end(); return; }
        }
        try {
          const result = await officialTolls({ httpMethod: request.method, body });
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
        } catch { response.statusCode = 500; response.end(); }
      });
    }
  }]
});
