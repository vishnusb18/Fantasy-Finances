import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sandboxMovesPlugin } from './server/sandboxMoves';
import { coachPlugin } from './server/coach/coachRoutes';

export default defineConfig(({ mode }) => {
  // Load ALL env vars (not just VITE_*) so the Nessie key stays server-side.
  const env = loadEnv(mode, process.cwd(), '');
  const nessieKey = env.NESSIE_API_KEY ?? '';
  const nessieBase = env.NESSIE_BASE_URL || 'https://api.nessieisreal.com';

  return {
    plugins: [react(), sandboxMovesPlugin(env), coachPlugin(env)],
    define: {
      __NESSIE_CONFIGURED__: JSON.stringify(Boolean(nessieKey)),
    },
    server: {
      proxy: {
        // Browser calls /nessie/...; the dev server forwards to Nessie and adds ?key=.
        '/nessie': {
          target: nessieBase,
          changeOrigin: true,
          rewrite: path => {
            const u = new URL(path.replace(/^\/nessie/, '') || '/', 'http://proxy.local');
            u.searchParams.set('key', nessieKey);
            return u.pathname + u.search;
          },
        },
      },
    },
  };
});
