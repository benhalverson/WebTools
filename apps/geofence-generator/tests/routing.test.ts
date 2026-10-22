import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applicationBase, applicationForPath, serveAssets } from '@webtools/routing'

test('geofence owns only its public mount under root and configured prefixes', async () => {
    for (const prefix of ['/', '/Tools/WebTools/']) {
        const base = applicationBase('geofenceGenerator', prefix)
        assert.equal(applicationForPath(base, prefix), 'geofenceGenerator')
        assert.equal(applicationForPath(base.slice(0, -1), prefix), 'geofenceGenerator')
        assert.equal(applicationForPath(base.slice(0, -1) + 'Extra/', prefix), 'portal')
        assert.equal(applicationForPath(base + 'Readme.md', prefix), 'geofenceGenerator')
        const response = await serveAssets(new Request('https://test' + base.slice(0, -1) + '?q=1#selected'), {
            /** Redirects must occur before any asset binding access. */
            fetch() { throw new Error('Unexpected asset access') },
        }, { base, assets: [], pages: { '': 'index.html' } })
        assert.equal(response.status, 308)
        assert.equal(response.headers.get('location'), 'https://test' + base + '?q=1#selected')
    }
})
