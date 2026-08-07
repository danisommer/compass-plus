import { defineConfig } from 'vite';

export default defineConfig({
  // Em GitHub Pages de projeto o site fica em /<nome-do-repo>/.
  // Derivamos de GITHUB_REPOSITORY (definido no CI) para não depender de um
  // nome fixo; localmente cai em '/'.
  base: process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
    : '/',
  server: {
    port: 5501,
    open: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
