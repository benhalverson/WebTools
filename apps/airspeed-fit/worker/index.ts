import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

export default {
    /** Serve the independent app only at its public mount; missing paths stay 404. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: [
                ...Object.keys(assets),
                'dataflash/index.js',
                'dataflash/log-helpers.js',
                'dataflash/vendor/parser.js',
                'dataflash/vendor/LICENSE',
            ],
            pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: [
                'src/main.tsx',
                'src/App.tsx',
                'src/core.ts',
                'src/matrix.ts',
                'src/model.ts',
                'src/plots.ts',
                'src/weather.ts',
                'src/style.css',
            ],
        })
    },
} satisfies ExportedHandler<Env>
