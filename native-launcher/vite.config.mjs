import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
const project = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(project, '..')
export default defineConfig({
  root: path.join(root, 'src/renderer'), base: '/',
  plugins: [vue(), {
    name: 'native-desktop-bridge',
    // Declare the encoding and content policy before executing bridge code.
    transformIndexHtml: { order: 'pre', handler(html) { return html.replace('script-src \'self\' kamucl-plugin:', 'script-src \'self\' https://zerodistance-plugins.local').replace('</head>', '<script src="/native-bridge.js"></script></head>') } },
    transform(code, id) {
      if(id.endsWith('/managedAssets.ts')) return code.replace('kamucl-asset://local/image', 'https://zerodistance-assets.local/image')
      if(id.endsWith('/plugins.ts')) return code.replace('kamucl-plugin://', 'https://zerodistance-plugins.local/')
    },
    closeBundle() { fs.copyFileSync(path.join(project, 'frontend/native-bridge.js'), path.join(project, 'out/ui/native-bridge.js')) }
  }],
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.join(project,'package.json'))).version) },
  resolve: { alias: { '@shared': path.join(root, 'src/shared') }, dedupe: ['vue','three','skinview-utils'] },
  build: { outDir: path.join(project, 'out/ui'), emptyOutDir: true, target: 'es2022', sourcemap: false,
    rollupOptions: { input: Object.fromEntries(['index','consent','splash'].map(name=>[name,path.join(root,'src/renderer',name+'.html')])) }
  }
})
