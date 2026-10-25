import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import vue from '@vitejs/plugin-vue'
import mkon from './src/vite-plugin-mkon.js'

export default defineConfig({
    plugins: [
        vue(),
        dts(),
        mkon()
    ],
    build: {
        lib: {
            entry: {
                index: 'src/index.js',
                'vite-plugin-mkon': 'src/vite-plugin-mkon.js'
            },
            name: 'mkon',
            formats: ['es']
        },
        rollupOptions: {
            external: [/^node:/],
            output: {
                exports: 'named'
            }
        }
    }
})
