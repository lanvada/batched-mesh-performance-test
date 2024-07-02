import { defineConfig } from 'vite';
export default defineConfig(() => {
  return {
    server: {
      proxy: {
        '/api': {
          target: 'https://storage.metropolis-echo.com/',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        }
      },
      open: false,
      // host: 'localhost',
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
