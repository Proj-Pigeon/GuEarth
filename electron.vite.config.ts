import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Connect, Plugin } from 'vite'

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
  if (!assetPath.startsWith(cesiumBuild + sep)) {
    next()
    return
  }
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    next()
    return
  }
  res.setHeader(
    'Content-Type',
    cesiumMimeTypes[extname(assetPath).toLowerCase()] ?? 'application/octet-stream'
  )
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
      if (!outDir) {
        return
      }
      for (const dir of cesiumDirs) {
        cpSync(join(cesiumBuild, dir), join(outDir, 'cesium', dir), { recursive: true })
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rolldownOptions: {
        external: ['koffi'],
        input: {
          index: resolve('src/main/index.ts'),
          hawdbWorker: resolve('src/main/ai/hawdb/worker.ts')
        }
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), cesiumStaticPlugin()],
    build: {
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          offscreen: resolve('src/renderer/offscreen.html')
        },
        output: {
          comments: false,
          codeSplitting: {
            groups: [{ name: 'cesium', test: /[\\/]node_modules[\\/]@?cesium[\\/]/ }]
          }
        }
      }
    },
    define: {
      CESIUM_BASE_URL: JSON.stringify('./cesium/')
    }
  }
})
