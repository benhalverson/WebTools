import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'
import { wheelResponse } from './wheel.ts'
import largeAssets from '../large-assets.json'

export default {
    /** Reassemble large pinned wheels without changing their bytes or exposing undeclared paths. */
    async fetch(request, env) {
        const base = import.meta.env.BASE_URL
        const path = new URL(request.url).pathname
        const parts = Object.entries(largeAssets).find(([name]) => path === base + name)?.[1]
        if (parts) return wheelResponse(request, env.ASSETS, parts, import.meta.env.DEV ? base : '/')
        return serveAssets(request, env.ASSETS, {
            base, assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html', 'runtime.html': 'runtime.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/main.tsx','src/App.tsx','src/model.ts','src/dataset.ts','src/forms.tsx','src/plots.ts','src/runtime-client.ts','src/runtime-frame.ts','src/protocol.ts','src/transfer-function.py','src/state-space.py','src/serialize-result.py','src/style.css'],
        })
    },
} satisfies ExportedHandler<Env>
