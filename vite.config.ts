import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import hjson from './src/vite-plugin-hjson'

export default defineConfig({
    plugins: [
        dts(),
        hjson()
    ],
    build: {
        lib: {
            entry: 'src/index.js',
            name: 'hjson',
            formats: ['es']
        },
        rollupOptions: {
            output: {
                exports: 'named'
            }
        }
    }
})
