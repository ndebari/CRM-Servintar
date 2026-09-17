import { handler as cuitLookup } from './netlify/functions/cuit-lookup.mjs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handler as routeTolls } from './netlify/functions/route-tolls.mjs';
import { handler as officialTolls } from './netlify/functions/official-tolls.mjs';

export default defineConfig({
  plugins: [react(), {
    name: 'local-official-tolls',
    configureServer(server) {
      for (const [path, handler] of [['/.netlify/functions/cuit-lookup', cuitLookup], ['/.netlify/functions/official-tolls', officialTolls], ['/.netlify/functions/route-tolls', routeTolls]] as const) server.middlewares.use(path, async (request, response) => {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 5000000) { response.statusCode = 413; response.end(); return; }
        }
        try {
          const result = await handler({ httpMethod: request.method, body });
          response.writeHead(result.statusCode, result.headers);
          response.end(result.body);
        } catch { response.statusCode = 500; response.end(); }
      });
    }
  }]
});
