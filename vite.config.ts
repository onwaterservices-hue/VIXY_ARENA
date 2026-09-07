import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/* Build-time configuration. See types/build-env.d.ts and services/config.ts.

   The safety property lives here: a production build gets DEMO_MODE=false
   unless VITE_DEMO_MODE=true is set on purpose, so the demo provider, the
   preview account and every "Simulate …" control are dead code in the
   bundle. `npm run verify:prod` checks the emitted files for their strings. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const explicit = env.VITE_DEMO_MODE;
  const demo = explicit === undefined ? mode !== 'production' : explicit === 'true';
  const str = (v: string | undefined) => JSON.stringify(v ?? '');
  return {
    plugins: [react()],
    server: { port: 5173, host: true },
    build: { target: 'es2022', outDir: 'dist' },
    define: {
      __DEMO_MODE__: JSON.stringify(demo),
      __ENGINE_BASE_URL__: str(env.VITE_ENGINE_BASE_URL),
      __AUTH_BASE_URL__: str(env.VITE_AUTH_BASE_URL),
      __BILLING_BASE_URL__: str(env.VITE_BILLING_BASE_URL),
      __ACCOUNT_BASE_URL__: str(env.VITE_ACCOUNT_BASE_URL),
      __PAYMENT_LINK_URL__: str(env.VITE_PAYMENT_LINK_URL),
      __DISCORD_INVITE_URL__: str(env.VITE_DISCORD_INVITE_URL),
    },
  };
});
