import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

const runtimeAssets = [
    ...Object.keys(assets), 'vendor/gridstack-all.js', 'vendor/gridstack.min.css',
    'vendor/gridstack-extra.min.css', 'vendor/formio.full.min.js', 'vendor/formio.full.min.css',
    'modules/MAVLink/mavlink.js', 'modules/MAVLink/local_modules/jspack/jspack.js',
    'mavlink-runtime/mavlink.js', 'mavlink-runtime/local_modules/jspack/jspack.js',
]
export default {
    /** Serve only playback pages and retained runtime assets, including under a hosting prefix. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL, assets: runtimeAssets,
            pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/main.tsx', 'src/App.tsx', 'src/connection.ts', 'src/settings.ts', 'src/vendor.ts', 'src/style.css'],
        })
    },
} satisfies ExportedHandler<Env>
