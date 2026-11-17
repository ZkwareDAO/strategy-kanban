import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 读取全部变量（含无 VITE_ 前缀的 DATA_ROOT），与 dev:data 共用 .env.local
  const env = loadEnv(mode, process.cwd(), '')
  const projectRoot = fileURLToPath(new URL('.', import.meta.url))
  const dataRoot = env.DATA_ROOT ? resolve(env.DATA_ROOT) : null
  return {
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()],
      }),
      Components({
        resolvers: [ElementPlusResolver()],
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      host: true,
      port: 3000,
      // 数据目录可能通过符号链接指向项目外；允许 DATA_ROOT（若配置）
      fs: {
        allow: [projectRoot, ...(dataRoot ? [dataRoot] : [])],
      },
      proxy: {
        [env.VITE_API_POSITION_PREFIX || '/api/position']: {
          target: env.VITE_API_POSITION_TARGET || 'https://api.example.com',
          changeOrigin: true,
        },
        // 大文件 K 线由独立数据服务提供完整 Range 支持
        '/kline-data-v2': {
          target: env.VITE_DATA_SERVER || 'http://127.0.0.1:3001',
          rewrite: (path) => path.replace(/^\/kline-data-v2/, '/data/klines'),
        },
      },
      watch: {
        // public/ 下的数据目录通常是指向外部大目录的符号链接（静态数据，无需 HMR）。
        // 关闭符号链接跟随以免耗尽 inotify (ENOSPC)。
        followSymlinks: false,
        ignored: ['**/public/**'],
      },
    }
  }
})
