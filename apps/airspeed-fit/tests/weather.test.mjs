import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchGroundTemperature } from '../src/weather.ts'

test('weather endpoint selection, nearest hour and cancellation do not contact providers', async () => {
    const originalFetch = globalThis.fetch
    const urls = []
    try {
        globalThis.fetch = async (url) => {
            urls.push(url)
            return new Response(
                JSON.stringify({
                    hourly: { time: ['2020-01-02T10:00', '2020-01-02T11:00'], temperature_2m: [12, 19] },
                }),
            )
        }
        const controller = new AbortController()
        assert.equal(
            await fetchGroundTemperature(12.345678, 45.123456, new Date('2020-01-02T10:45Z'), controller.signal),
            19,
        )
        assert.match(urls[0], /archive-api/)
        assert.match(urls[0], /latitude=12.3457&longitude=45.1235/)
        assert.match(urls[0], /start_date=2020-01-02&end_date=2020-01-02/)
        await fetchGroundTemperature(0, 0, new Date(), controller.signal)
        assert.match(urls[1], /api.open-meteo.com\/v1\/forecast/)
        let signal
        globalThis.fetch = (_url, options) =>
            new Promise((_resolve, reject) => {
                signal = options.signal
                signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
            })
        const pending = fetchGroundTemperature(0, 0, new Date(), controller.signal)
        controller.abort()
        assert.equal(await pending, null)
        assert.equal(signal.aborted, true)
        assert.ok(Number.isNaN(Date.parse('2020-99-99T99:99:00Z')))
        for (const body of [
            {},
            { hourly: { time: [], temperature_2m: [] } },
            { hourly: { time: ['2020-99-99T99:99'], temperature_2m: [3] } },
        ]) {
            globalThis.fetch = async () => new Response(JSON.stringify(body))
            assert.equal(await fetchGroundTemperature(0, 0, new Date(), new AbortController().signal), null)
        }
    } finally {
        globalThis.fetch = originalFetch
    }
})
