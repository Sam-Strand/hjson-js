import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import vue from '@vitejs/plugin-vue'
import hjson from './src/vite-plugin-hjson.js'

export default defineConfig({
    plugins: [
        vue(),
        dts(),
        hjson()
    ],
    build: {
        lib: {
            entry: {
                index: 'src/index.js',
                'vite-plugin-hjson': 'src/vite-plugin-hjson.js'
            },
            name: 'hjson',
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
