import { readTracking } from './tracking.ts'
import { readParameters } from './parameters.ts'
import type { loadDataflashParser } from '@webtools/dataflash'
import { ingest, gyroRates } from './ingestion.ts'
import { calculate } from './spectrum.ts'
import type { Request, Response } from './jobs.ts'

/** Load the standalone parser asset without letting the bundler inline or move
 * its adjacent vendor import. Only a typed, verified module crosses the boundary. */
async function parse(request: Request) {
    const boundary: unknown = await import(/* @vite-ignore */ request.parserUrl)
    if (typeof boundary !== 'object' || boundary === null || !('loadDataflashParser' in boundary) || typeof boundary.loadDataflashParser !== 'function') throw new Error('Parser asset unavailable')
    const Constructor = await (boundary.loadDataflashParser as typeof loadDataflashParser)()
    const log = new Constructor()
    log.processData(request.bytes, [])
    const recording = ingest(log, request.source)
    return { recording, gyroRates: gyroRates(log, recording), tracking: readTracking(log), parameters: readParameters(log) }
}

/** Run one job per Worker; its owner terminates the entire lifetime on cancellation. */
self.onmessage = async (event: MessageEvent<Request>) => {
    /** Send only the declared job protocol to the owning React session. */
    const send = (response: Response) => self.postMessage(response)
    try {
        const { recording, tracking, parameters, gyroRates } = await parse(event.data)
        const sensor = recording.sensors.find(value => value.instance === event.data.instance) ?? recording.sensors.find(value => value.sensor === recording.primary) ?? recording.sensors[0]!
        const spectrum = calculate(sensor, recording.source, event.data.settings, value => send({ kind: 'progress', value }))
        send({ kind: 'result', recording, spectrum, instance: sensor.instance, tracking, parameters, gyroRates })
    } catch (error) {
        send({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
}
