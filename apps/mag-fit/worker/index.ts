import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

export default {
    /** Serve the independent app only at its public mount; missing paths stay 404. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ["src/use-session.ts", "src/selection.ts", "src/magnetic-model.ts", "src/quaternion.ts", "src/types.ts", "src/calibration.ts", "src/magnetic-data.ts", "src/style.css", "src/plots.ts", "src/fit.ts", "src/App.tsx", "src/main.tsx", "src/runtime.ts", "src/log.ts"],
        })
    },
} satisfies ExportedHandler<Env>
