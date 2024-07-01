import { defineConfig } from 'vite';
export default defineConfig(() => {
  return {
    server: {
      open: false,
      // host: 'localhost',
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
