import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

export default {
    /** Serve the independent app only at its public mount; missing paths stay 404. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/FilterComparison.tsx', 'src/aliasing.ts', 'src/atmosphere.ts', 'src/comparison.ts', 'src/filter.worker.ts', 'src/filters.ts', 'src/parameters.ts', 'src/throttle.ts', 'src/tracking.ts', 'src/use-comparison.ts', 'src/main.tsx', 'src/App.tsx', 'src/ingestion.ts', 'src/spectrum.ts', 'src/jobs.ts', 'src/use-review.ts', 'src/compute.worker.ts', 'src/style.css'],
        })
    },
} satisfies ExportedHandler<Env>
