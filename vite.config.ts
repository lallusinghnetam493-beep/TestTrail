import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    const apiKey2 = env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_2 || '';
    const apiKey3 = env.GEMINI_API_KEY_3 || process.env.GEMINI_API_KEY_3 || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY_2': JSON.stringify(apiKey2),
        'process.env.GEMINI_API_KEY_3': JSON.stringify(apiKey3),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
