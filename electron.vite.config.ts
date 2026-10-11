import { cpSync, createReadStream, existsSync, statSync } from 'fs'
import { extname, join, resolve, sep } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Connect, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const cesiumBuild = resolve('node_modules/cesium/Build/Cesium')
const cesiumDirs = ['Workers', 'ThirdParty', 'Assets', 'Widgets']

const cesiumMimeTypes: Record<string, string> = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.xml': 'application/xml'
}

const serveCesiumAsset: Connect.NextHandleFunction = (req, res, next) => {
  const assetPath = resolve(cesiumBuild, `.${(req.url ?? '/').split('?')[0]}`)
  if (!assetPath.startsWith(cesiumBuild + sep)) return next()
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) return next()
  res.setHeader('Content-Type', cesiumMimeTypes[extname(assetPath).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', 'no-cache')
  createReadStream(assetPath).pipe(res)
}

function cesiumStaticPlugin(): Plugin {
  return {
    name: 'guearth-cesium-static',
    configureServer(server) {
      server.middlewares.use('/cesium', serveCesiumAsset)
    },
    writeBundle(options) {
      const outDir = options.dir
      if (!outDir) return
      for (const dir of cesiumDirs) {
        cpSync(join(cesiumBuild, dir), join(outDir, 'cesium', dir), { recursive: true })
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue(), cesiumStaticPlugin()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            if (normalizedId.includes('/node_modules/cesium/') || normalizedId.includes('/node_modules/@cesium/')) return 'cesium'
            return undefined
          }
        }
      }
    },
    define: {
      CESIUM_BASE_URL: JSON.stringify('./cesium/')
    }
  }
})
