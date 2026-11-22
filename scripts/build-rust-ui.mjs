import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-rust');
const targetHtml = path.resolve(rootDir, 'rust-browser/src/chrome_ui.html');

process.env.NODE_ENV = 'production';

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });

  await build({
    root: rootDir,
    mode: 'production',
    configFile: false,
    logLevel: 'warn',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      assetsInlineLimit: 1_500_000,
      cssCodeSplit: false,
      minify: 'esbuild',
      rollupOptions: {
        input: path.resolve(rootDir, 'src/main.tsx'),
        output: {
          format: 'iife',
          name: 'FerroXChromeUI',
          inlineDynamicImports: true,
          entryFileNames: 'bundle.js',
          assetFileNames: 'bundle.[ext]',
        },
      },
    },
  });

  const files = fs.readdirSync(outDir);
  const cssFile = files.find((f) => f.endsWith('.css'));
  const jsFile = files.find((f) => f.endsWith('.js'));

  if (!jsFile) {
    throw new Error(`Expected bundle.js in ${outDir}, found: ${files.join(', ')}`);
  }

  const cssContent = cssFile ? fs.readFileSync(path.join(outDir, cssFile), 'utf8') : '';
  const jsContent = fs.readFileSync(path.join(outDir, jsFile), 'utf8');

  const safeCss = cssContent.replace(/<\/style/gi, '<\\/style');
  const safeJs = jsContent.replace(/<\/script/gi, '<\\/script');

  const html = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FerroX Browser</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>${safeCss}</style>
  </head>
  <body class="bg-[#0B0D12] text-[#ECEFF4] antialiased selection:bg-[#FA1E4E]/30">
    <div id="root"></div>
    <script>${safeJs}</script>
  </body>
</html>
`;

  fs.mkdirSync(path.dirname(targetHtml), { recursive: true });
  fs.writeFileSync(targetHtml, html, 'utf8');
  fs.rmSync(outDir, { recursive: true, force: true });

  const sizeKb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`Generated ${path.relative(rootDir, targetHtml)} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
