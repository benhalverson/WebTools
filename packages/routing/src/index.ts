/** Stable public mount names shared by apps, Workers and local tooling. */
export const applications = { portal: '', rotationCheck: 'RotationCheck/', hardwareParameters: 'HardwareReportParameters/', kinematicTools: 'KinematicTool/', scurveTool: 'SCurveTool/', simplegcsPreview: 'SimpleGCS-preview/' } as const
export type Application = keyof typeof applications

/** Normalize a common hosting prefix, rejecting encoded paths and traversal. */
export function hostingPrefix(value = '/'): string {
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(value)) {
        throw new Error('Hosting prefix must be an absolute path such as / or /Tools/WebTools/')
    }
    return value.endsWith('/') ? value : value + '/'
}

/** Resolve an app mount without duplicating public path strings in consumers. */
export function applicationBase(application: Application, prefix = '/'): string {
    return hostingPrefix(prefix) + applications[application]
}

/** Select the owning app at a path boundary; unknown routes remain portal 404s. */
export function applicationForPath(pathname: string, prefix = '/'): Application {
    for (const application of (Object.keys(applications) as Application[]).filter(application => application !== 'portal')) {
        const mount = applicationBase(application, prefix)
        if (pathname === mount.slice(0, -1) || pathname.startsWith(mount)) return application
    }
    return 'portal'
}

export interface AssetBinding { fetch(request: Request): Promise<Response> }
export interface AssetRoutes {
    base: string
    assets: readonly string[]
    pages: Readonly<Record<string, string>>
    development?: boolean
    developmentPaths?: readonly string[]
}

/** Route only declared pages/assets. Redirect directories before asset lookup,
 * preserving search and browser fragments; no missing path receives an SPA shell.
 * Development paths are explicit Vite module entry points, never arbitrary files.
 */
export async function serveAssets(request: Request, binding: AssetBinding, routes: AssetRoutes): Promise<Response> {
    const url = new URL(request.url)
    const base = hostingPrefix(routes.base)
    const directories = new Set(['', ...Object.keys(routes.pages).filter(path => path.endsWith('/')),
        ...routes.assets.filter(path => path.endsWith('/index.html')).map(path => path.slice(0, -10))])
    if ((base !== '/' && url.pathname === base.slice(0, -1)) ||
        (url.pathname.startsWith(base) && !url.pathname.endsWith('/') && directories.has(url.pathname.slice(base.length) + '/'))) {
        url.pathname += '/'
        return Response.redirect(url.href, 308)
    }
    if (!url.pathname.startsWith(base)) return new Response('Not found', { status: 404 })
    const path = url.pathname.slice(base.length)
    const page = Object.hasOwn(routes.pages, path) ? routes.pages[path] : undefined
    const asset = page ?? (directories.has(path) ? path + 'index.html' : path)
    const developmentModule = routes.development && (
        routes.developmentPaths?.includes(path) || ['@vite/client', '@react-refresh'].includes(path) ||
        path.startsWith('node_modules/.vite/') ||
        (path.startsWith('@fs/') && path.endsWith('/vite/dist/client/env.mjs')))
    if (!page && !routes.assets.includes(asset) && !path.startsWith('assets/') && !developmentModule) {
        return new Response('Not found', { status: 404 })
    }
    url.pathname = (routes.development ? base : '/') + asset
    return binding.fetch(new Request(url, request))
}
