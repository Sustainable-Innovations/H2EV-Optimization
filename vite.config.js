import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/H2EV-Optimization/',
  plugins: [react(), tailwindcss()],
});
