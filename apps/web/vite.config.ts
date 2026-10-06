import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { createNitro } from 'nitro/builder'
import { nitro } from 'nitro/vite'
import { defineConfig, type UserConfig } from 'vite'

export default defineConfig(
  async ({ command }): Promise<UserConfig> => ({
    envDir: false,
    resolve: { tsconfigPaths: true },
    plugins: [
      nitro({
        _nitro: await createNitro(
          { dev: command === 'serve', builder: 'vite', rootDir: process.cwd() },
          { dotenv: false },
        ),
      }),
      tanstackStart(),
      react(),
    ],
    server: { host: '127.0.0.1', port: 3000, strictPort: true },
  }),
)
