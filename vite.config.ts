import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'TsRetoken',
      fileName: 'ts-retoken',
      formats: ['es'],
    },
  },
})
