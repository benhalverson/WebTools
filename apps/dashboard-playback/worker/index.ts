import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

const runtimeAssets = [
    ...Object.keys(assets), 'vendor/bootstrap.min.css', 'vendor/fontawesome/css/all.min.css',
    ...['fa-brands-400', 'fa-regular-400', 'fa-solid-900', 'fa-v4compatibility'].flatMap(font => ['ttf', 'woff2'].map(extension => `vendor/fontawesome/webfonts/${font}.${extension}`)), 'vendor/gridstack-all.js', 'vendor/gridstack.min.css',
    'vendor/gridstack-extra.min.css', 'vendor/formio.full.min.js', 'vendor/formio.full.min.css',
    'modules/MAVLink/mavlink.js', 'modules/MAVLink/local_modules/jspack/jspack.js',
    'mavlink-runtime/mavlink.js', 'mavlink-runtime/local_modules/jspack/jspack.js',
]
export default {
    /** Serve only dashboard pages and retained runtime assets, including under a hosting prefix. */
    fetch(request, env) {
        // The retained sandbox document imports MAVLink two levels above Widgets/.
        // Rewrite only its exact shared assets for independently hosted app previews.
        const url = new URL(request.url)
        const prefix = import.meta.env.BASE_URL.replace(/[^/]+\/$/, '')
        const shared = url.pathname.slice(prefix.length)
        if (url.pathname.startsWith(prefix) && ['modules/MAVLink/mavlink.js', 'modules/MAVLink/local_modules/jspack/jspack.js'].includes(shared)) {
            url.pathname = import.meta.env.BASE_URL + shared
            request = new Request(url, request)
        }
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL, assets: runtimeAssets,
            pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/main.tsx', 'src/App.tsx', 'src/connection.ts', 'src/settings.ts', 'src/vendor.ts', 'src/style.css', 'src/Palette.tsx', 'src/WidgetSettings.tsx', 'src/SourceEditor.tsx', 'src/download.ts', 'src/code-editor.ts', 'src/editor.ts', 'src/WidgetGallery.tsx'],
        })
    },
} satisfies ExportedHandler<Env>
