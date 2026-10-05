import { createFTPManager, MissionParser, type Fence } from '@webtools/transfers'
import { missionPoints, type MissionPoint } from './mission-points.ts'
export type DownloadKind = 'mission' | 'fence'
export interface DownloadsState { mission: MissionPoint[]; fence: Fence[]; missionPending: boolean; fencePending: boolean }
export interface AutoDownloads { autoFetchMission: boolean; autoFetchFence: boolean }
/** Create the empty layer/progress snapshot for a new vehicle lifetime. */
export function emptyDownloads(): DownloadsState { return { mission: [], fence: [], missionPending: false, fencePending: false } }
/** Own retries and generations independently of the manager's serialized FTP queue. */
export class Downloads {
    readonly manager = createFTPManager()
    private readonly parser = new MissionParser()
    private readonly publish: (state: DownloadsState) => void
    private readonly report: (text: string) => void
    private state = emptyDownloads()
    private generation = 0
    private connected = false
    private options: AutoDownloads = { autoFetchMission: false, autoFetchFence: true }
    private readonly retries: Partial<Record<DownloadKind, ReturnType<typeof setTimeout>>> = {}
    /** Bind immutable snapshots and user-facing notices to the owning React runtime. */
    constructor(publish: (state: DownloadsState) => void, report: (text: string) => void) { this.publish = publish; this.report = report }
    /** Update retry choices without fetching until the next vehicle discovery or manual request. */
    configure(options: AutoDownloads): void { this.options = options }
    /** Test the saved auto-download choice for one file kind. */
    private automatic(kind: DownloadKind): boolean { return kind === 'mission' ? this.options.autoFetchMission : this.options.autoFetchFence }
    /** Begin automatic downloads only after the manager is bound to a discovered vehicle. */
    start(): void { this.connected = true; for (const kind of ['fence', 'mission'] as const) if (this.automatic(kind)) this.fetch(kind, true) }
    /** Publish a new immutable snapshot; existing layer arrays are never mutated. */
    private update(patch: Partial<DownloadsState>): void { this.state = { ...this.state, ...patch }; this.publish(this.state) }
    /** Fetch once, de-duplicate concurrent requests, retry failures after five seconds if selected. */
    fetch(kind: DownloadKind, silent = false): void {
        if (!this.connected) { if (!silent) this.report('Not connected'); return }
        const pending = kind === 'mission' ? 'missionPending' : 'fencePending'
        if (this.state[pending]) return
        clearTimeout(this.retries[kind]); this.update({ [pending]: true })
        const generation = this.generation
        if (!silent) this.report(`Fetching ${kind}…`)
        this.manager.getFile(`@MISSION/${kind}.dat`, data => {
            if (generation !== this.generation) return
            this.update({ [pending]: false })
            if (data && kind === 'mission') {
                const items = this.parser.parseMission(data)
                if (items) {
                    const points = missionPoints(items)
                    this.update({ mission: points }); this.report(points.length ? `Loaded mission with ${points.length} points` : 'No mission points found'); return
                }
            } else if (data) {
                const fences = this.parser.parseFence(data)
                if (fences) { this.update({ fence: fences }); if (!silent) this.report(`Loaded ${fences.length} fence items`); return }
            }
            if (!silent) this.report(data ? `Failed to parse ${kind}` : `Failed to fetch ${kind}`)
            if (this.automatic(kind)) this.retries[kind] = setTimeout(() => { delete this.retries[kind]; if (this.automatic(kind)) this.fetch(kind, true) }, 5000)
        }, { tag: kind, dropQueuedTag: true, dropQueuedPath: true, timeoutMs: 5000 })
    }
    /** Invalidate callbacks before cancelling active/queued transfers and removing all layers. */
    reset(): void {
        this.generation++; this.connected = false
        for (const kind of ['mission', 'fence'] as const) { clearTimeout(this.retries[kind]); delete this.retries[kind] }
        this.manager.clearLink(); this.state = emptyDownloads(); this.publish(this.state)
    }
}
