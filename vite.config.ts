import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname);

// Get target browser environment variable (defaults to 'chrome')
const browser = process.env.VITE_BROWSER || 'chrome';
const distDir = resolve(rootDir, 'dist', browser);

function copyPublicFiles() {
  return {
    name: 'copy-public',
    closeBundle() {
      if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
      
      const manifestSrc = resolve(rootDir, 'public/manifest.json');
      const manifestDest = resolve(distDir, 'manifest.json');
      
      // Load base manifest and transform if building for Firefox
      const manifestRaw = readFileSync(manifestSrc, 'utf8');
      const manifest = JSON.parse(manifestRaw);
      
      if (browser === 'firefox') {
        // Transform background configurations: Chrome MV3 uses service_worker, Firefox MV3 uses scripts
        if (manifest.background) {
          const type = manifest.background.type;
          manifest.background = {
            scripts: ['background.js']
          };
          if (type) {
            manifest.background.type = type;
          }
        }
        
        // Firefox requires browser_specific_settings with a valid addon ID for MV3 extensions
        manifest.browser_specific_settings = {
          gecko: {
            id: 'azynora-fb-notes@github.com',
            strict_min_version: '109.0'
          }
        };
      }
      
      writeFileSync(manifestDest, JSON.stringify(manifest, null, 2), 'utf8');
      
      const iconsSrc = resolve(rootDir, 'public/icons');
      const iconsDest = resolve(distDir, 'icons');
      if (!existsSync(iconsDest)) mkdirSync(iconsDest, { recursive: true });
      
      if (existsSync(iconsSrc)) {
        readdirSync(iconsSrc).forEach(file => {
          copyFileSync(resolve(iconsSrc, file), resolve(iconsDest, file));
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyPublicFiles()],
  root: rootDir,
  publicDir: false,
  build: {
    outDir: distDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'popup.html'),
        background: resolve(rootDir, 'src/background/index.ts'),
        content: resolve(rootDir, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        dir: distDir,
      },
    },
    minify: false,
    sourcemap: false,
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
