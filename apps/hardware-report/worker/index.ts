import { serveAssets } from '@webtools/routing'
import assets from '../runtime-assets.json'

export default {
    /** Serve the independent app only at its public mount; missing paths stay 404. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, {
            base: import.meta.env.BASE_URL,
            assets: Object.keys(assets), pages: { '': 'index.html', 'index.html': 'index.html' },
            development: import.meta.env.DEV,
            developmentPaths: ['src/main.tsx', 'src/App.tsx', 'src/ParameterRead.tsx', 'src/plot.ts', 'src/model/index.ts', 'src/model/report.ts', 'src/model/names.ts', 'src/model/exports.ts', 'src/style.css', 'src/parser.ts', 'src/metadata-transport.ts', 'src/ParameterExports.tsx', 'src/Extractions.tsx', 'src/OpenInMenu.tsx', 'src/LogReport.tsx', 'src/LogPlots.tsx', 'src/model/log-report.ts', 'src/model/log-errors.ts', 'src/model/log-fields.ts', 'src/model/log-metadata.ts', 'src/model/log-plots.ts', 'src/model/log-extractions.ts'],
        })
    },
} satisfies ExportedHandler<Env>
