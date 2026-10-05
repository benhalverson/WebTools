import { serveAssets } from '@webtools/routing'
import assets from '../legacy-assets.json'

export default {
  /** Preserve legacy destinations and explicit portal listings without SPA fallbacks. */
  fetch(request, env) {
    return serveAssets(request, env.ASSETS, {
      base: import.meta.env.BASE_URL, assets,
      pages: { '': 'index.html', 'index.html': 'index.html', 'Dev/': 'index.html', 'Dev/index.html': 'index.html' },
      development: import.meta.env.DEV,
      developmentPaths: ['src/main.tsx', 'src/App.tsx', 'src/tools.tsx'],
    })
  },
} satisfies ExportedHandler<Env>
