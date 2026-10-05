import { serveAssets } from '@webtools/routing'
declare const __MAVLINK_DEV_PATHS__: string[]
export default {
    /** Serve the intermediate preview only; the public SimpleGCS route stays with the portal. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, { base: import.meta.env.BASE_URL, assets: ['vendor/mediamtx/reader.js', 'mavlink-runtime/mavlink.js', 'mavlink-runtime/local_modules/jspack/jspack.js', 'mavlink-runtime/local_modules/jspack/LICENSE'], pages: { '': 'index.html', 'index.html': 'index.html', 'video.html': 'index.html' }, development: import.meta.env.DEV,
            developmentPaths: ['src/VideoControls.tsx', 'src/VideoPlayer.tsx', 'src/VideoWindow.tsx', 'src/video-window.ts', 'src/video-settings.ts', 'src/video-playback.ts', ...__MAVLINK_DEV_PATHS__, 'src/main.tsx', 'src/App.tsx', 'src/MapView.tsx', 'src/connection.ts', 'src/grid.ts', 'src/grid-math.ts', 'src/icon.ts', 'src/identity.ts', 'src/location.ts', 'src/settings.ts', 'src/simulator.ts', 'src/telemetry.ts', 'src/useConnection.ts', 'src/style.css'] })
    },
} satisfies ExportedHandler<Env>
