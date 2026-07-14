import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const commonSrc = resolve(__dirname, '../../packages/common/src')
const coreSrc = resolve(__dirname, '../../packages/core/src')

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@electrum/common': resolve(commonSrc, 'index.ts'),
        '@electrum/core': resolve(coreSrc, 'index.ts'),
      },
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@electrum/common', '@electrum/core'],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
})
