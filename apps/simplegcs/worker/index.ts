import runtimeAssets from '../runtime-assets.json'
import { serveAssets } from '@webtools/routing'
declare const __MAVLINK_DEV_PATHS__: string[]
export default {
    /** Serve the complete GCS and sibling video entry with explicit asset ownership. */
    fetch(request, env) {
        return serveAssets(request, env.ASSETS, { base: import.meta.env.BASE_URL, assets: [...runtimeAssets, 'mavlink-runtime/mavlink.js', 'mavlink-runtime/local_modules/jspack/jspack.js', 'mavlink-runtime/local_modules/jspack/LICENSE'], pages: { '': 'index.html', 'index.html': 'index.html', 'video.html': 'index.html' }, development: import.meta.env.DEV,
            developmentPaths: ['src/simulated-parameters.ts', 'src/messages.tsx', 'src/tiles.ts', 'src/native-socket.ts', 'src/parameters/connected-session.ts', 'src/VideoControls.tsx', 'src/VideoPlayer.tsx', 'src/VideoWindow.tsx', 'src/video-window.ts', 'src/video-settings.ts', 'src/video-playback.ts', ...__MAVLINK_DEV_PATHS__, 'src/main.tsx', 'src/App.tsx', 'src/MapView.tsx', 'src/connection.ts', 'src/grid.ts', 'src/grid-math.ts', 'src/icon.ts', 'src/identity.ts', 'src/location.ts', 'src/settings.ts', 'src/simulator.ts', 'src/telemetry.ts', 'src/useConnection.ts', 'src/style.css', 'src/commands.ts', 'src/downloads.ts', 'src/gestures.ts', 'src/mission-points.ts', 'src/operation-layers.ts', 'src/operations.ts', 'src/simulated-files.ts', 'src/useOperations.ts', 'src/parameters/ParameterEditor.tsx', 'src/parameters/ParameterRow.tsx', 'src/parameters/useParameterSession.ts', 'src/parameters/simulator.ts'] })
    },
} satisfies ExportedHandler<Env>
