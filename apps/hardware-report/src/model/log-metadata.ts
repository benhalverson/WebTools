export type MetadataFetch = typeof fetch
export interface Link {
    name: string
    url: string
}
export interface Release {
    text: string
    links?: Link[]
    branches?: Link[]
    branchError?: string
}
interface MetadataCache {
    tags?: unknown
    reset?: number
}
const caches = new WeakMap<MetadataFetch, MetadataCache>()

/** Validate untrusted GitHub arrays before using response properties. */
function records(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter(
              (item): item is Record<string, unknown> =>
                  typeof item === 'object' && item !== null,
          )
        : []
}

/** Resolve release metadata with session tag caching and the legacy shared rate-limit window.
 * Each transport owns its cache, allowing fully isolated mocks. Aborting a component's
 * request never populates the cache or rate-limit state after its lifetime ends.
 * A null transport represents an unavailable metadata module (legacy offline state).
 */
export async function releaseMetadata(
    hash: string,
    signal: AbortSignal,
    request: MetadataFetch | null,
    now: () => number = Date.now,
): Promise<Release> {
    if (!request) return { text: `Version check failed, offline (${hash})` }
    const cache = caches.get(request) ?? {}
    caches.set(request, cache)
    if (cache.reset != null && now() / 1000 < cache.reset) return { text: '' }
    delete cache.reset

    /** Read one resource, retaining HTTP rate-limit state only while the request is active. */
    async function json(path: string): Promise<unknown> {
        signal.throwIfAborted()
        const response = await request!(
            `https://api.github.com/repos/ArduPilot/ardupilot/${path}`,
            {
                signal,
                headers: { 'X-GitHub-Api-Version': '2022-11-28' },
            },
        )
        signal.throwIfAborted()
        if (!response.ok) {
            if (
                !signal.aborted &&
                (response.status === 403 || response.status === 429)
            ) {
                cache.reset = parseInt(
                    response.headers.get('x-ratelimit-reset') ?? '',
                )
            }
            throw new Error(String(response.status))
        }
        return response.json() as Promise<unknown>
    }

    if (cache.tags == null) {
        try {
            const tags = await json('git/refs/tags')
            if (signal.aborted) return { text: '' }
            cache.tags = tags
        } catch {
            if (signal.aborted) return { text: '' }
            return { text: `Version check failed to get whitelist (${hash})` }
        }
    }
    const links: Link[] = []
    for (const tag of records(cache.tags)) {
        const object = tag.object
        if (
            typeof object === 'object' &&
            object !== null &&
            'sha' in object &&
            typeof object.sha === 'string' &&
            object.sha.startsWith(hash) &&
            typeof tag.ref === 'string'
        ) {
            const name = tag.ref.replace(/^(refs\/tags\/)/gm, '')
            links.push({
                name,
                url: `https://github.com/ArduPilot/ardupilot/tree/${name}`,
            })
        }
    }
    if (links.length) return { text: 'Official release:', links }
    const warning = 'Warning: not official firmware release.'
    let commit: unknown
    try {
        commit = await json(`commits/${hash}`)
    } catch {
        if (signal.aborted) return { text: '' }
        return {
            text: `${warning}\nVersion check failed to get commit (${hash})`,
        }
    }
    if (
        typeof commit !== 'object' ||
        commit === null ||
        !('sha' in commit) ||
        typeof commit.sha !== 'string' ||
        !('html_url' in commit) ||
        typeof commit.html_url !== 'string'
    ) {
        return {
            text: `${warning}\nVersion check failed to get commit (${hash})`,
        }
    }
    const result: Release = {
        text: `${warning}\nFound commit: `,
        links: [{ name: hash, url: commit.html_url }],
    }
    try {
        result.branches = records(
            await json(`commits/${commit.sha}/branches-where-head`),
        ).flatMap((branch) =>
            typeof branch.name === 'string'
                ? [
                      {
                          name: branch.name,
                          url: `https://github.com/ArduPilot/ardupilot/tree/${branch.name}`,
                      },
                  ]
                : [],
        )
    } catch {
        if (signal.aborted) return { text: '' }
        result.branchError = 'Version check failed to get branches.'
    }
    return result
}
