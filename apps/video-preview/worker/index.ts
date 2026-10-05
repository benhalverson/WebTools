import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

const runtimeAssets = [...Object.keys(assets), 'dataflash/index.js', 'dataflash/log-helpers.js', 'dataflash/vendor/parser.js',
    'vendor/bootstrap.min.css', 'vendor/fontawesome/css/all.min.css',
    ...['fa-brands-400', 'fa-regular-400', 'fa-solid-900', 'fa-v4compatibility'].flatMap(font => ['ttf', 'woff2'].map(extension => `vendor/fontawesome/webfonts/${font}.${extension}`)),
    'vendor/gridstack-all.js', 'vendor/gridstack.min.css', 'vendor/gridstack-extra.min.css',
    'vendor/formio.full.min.js', 'vendor/formio.full.min.css']
export default {
    /** Route the private preview and retained custom-widget parser imports at root or prefix. */
    fetch(request, env) {
        const url = new URL(request.url)
        if (url.pathname === import.meta.env.BASE_URL + 'index.html') {
            url.pathname = import.meta.env.BASE_URL
            return Response.redirect(url.href, 308)
        }
        const parser = import.meta.env.BASE_URL.replace(/[^/]+\/$/, '') + 'modules/JsDataflashParser/parser.js'
        if (url.pathname === parser) {
            url.pathname = import.meta.env.BASE_URL + 'modules/JsDataflashParser/parser.js'
            request = new Request(url, request)
        }
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL, assets: runtimeAssets,
            pages: { '': 'index.html', 'index.html': 'index.html' }, development: import.meta.env.DEV,
            developmentPaths: ['main.tsx', 'default-html.ts', 'App.tsx', 'format.ts', 'mapping.ts', 'Palette.tsx', 'WidgetSettings.tsx', 'SourceEditor.tsx', 'download.ts', 'code-editor.ts', 'vendor.ts', 'style.css'].map(file => 'src/' + file),
        })
    },
} satisfies ExportedHandler<Env>
