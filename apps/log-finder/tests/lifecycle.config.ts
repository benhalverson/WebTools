import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
/** Build an isolated test consumer of the production App; never stage it into the app Worker. */
export default defineConfig((): UserConfig => {
    const outDir = process.env.LOGFINDER_LIFECYCLE_DIR
    if (!outDir) throw new Error('LOGFINDER_LIFECYCLE_DIR must name a temporary test directory')
    return { publicDir: false, plugins: [react()], build: { outDir, emptyOutDir: true, rolldownOptions: { input: 'tests/lifecycle.html' } } }
})
