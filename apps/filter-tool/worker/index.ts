import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

/** Exact authoritative metadata module path injected by the app build. */
declare const __FILTER_METADATA_PATH__: string

export default {
    /** Serve the independent app only at its public mount; missing paths stay 404. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['@fs' + __FILTER_METADATA_PATH__, 'src/main.tsx', 'src/App.tsx', 'src/model.ts', 'src/state.ts', 'src/plots.ts', 'src/defaults.json', 'src/steps.json', 'src/graph-controls.json', 'src/style.css'],
        })
    },
} satisfies ExportedHandler<Env>
