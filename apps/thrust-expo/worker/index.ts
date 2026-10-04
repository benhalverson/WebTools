import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

export default {
    /** Serve declared Thrust Expo resources at its independent public mount. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/main.tsx', 'src/App.tsx', 'src/model.ts', 'src/state.ts', 'src/tooltips.ts', 'src/example.ts', 'src/ThrustTable.tsx', 'src/ThrustPlots.tsx', 'src/plots.ts', 'src/style.css'],
        })
    },
} satisfies ExportedHandler<Env>
