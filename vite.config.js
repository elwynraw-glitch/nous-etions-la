import { defineConfig } from 'vite';

// base: './' permet d'héberger le site dans un sous-dossier (GitHub Pages : utilisateur.github.io/nom-du-depot/)
export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
});
