/** Accept origin-form HTTP targets only. Reject malformed URLs before proxy
 * construction so a bad client request cannot terminate owned Worker processes.
 */
export function requestPath(target: string | undefined): { path: string, pathname: string } | undefined {
    if (!target?.startsWith('/') || target.startsWith('//') || target.includes('\\') || target.includes('#')) return undefined
    try {
        const url = new URL(target, 'http://local')
        return { path: target, pathname: url.pathname }
    } catch { return undefined }
}
