export interface DeploymentConfig { defaultUrl?: string; defaultSystemId?: number; defaultComponentId?: number; title?: string; googleKey?: string }
export interface ConnectionSettings { url: string; passphrase: string; systemId: number; componentId: number; sendHeartbeat: boolean }
export interface ConnectionDraft { url: string; passphrase: string; systemId: string; componentId: string; sendHeartbeat: boolean }
export interface DisplaySettings { tiles: string; googleKey: string; autoFetchFence: boolean; autoFetchMission: boolean; showGPSNumSats: boolean; showGrid: boolean; showLocation: boolean }
export interface StoragePair { local: Storage; session: Storage }
const keys = { autoFetchFence: 'gcs.auto.fetchFence', autoFetchMission: 'gcs.auto.fetchMission', showGPSNumSats: 'gcs.display.showGPSNumSats', showGrid: 'gcs.display.showGrid', showLocation: 'gcs.display.showLocation' } as const
/** Read legacy keys and defaults without persisting an unsubmitted draft. */
export function readDraft(storage: StoragePair, config: DeploymentConfig = {}): ConnectionDraft {
    const preferred = Number(storage.session.getItem('gcs.componentId') || config.defaultComponentId) || (1 + crypto.getRandomValues(new Uint32Array(1))[0]! % 255)
    return { url: storage.local.getItem('gcs.url') || config.defaultUrl || 'ws://127.0.0.1:5763', passphrase: storage.local.getItem('gcs.passphrase') || '', systemId: storage.local.getItem('gcs.systemId') || String(config.defaultSystemId || 255), componentId: String(Number.isInteger(preferred) && preferred >= 1 && preferred <= 255 ? preferred : 190), sendHeartbeat: true }
}
/** Parse IDs with legacy parseInt behavior; URL validation happens before resource acquisition. */
export function submitDraft(draft: ConnectionDraft): ConnectionSettings {
    const sid = parseInt(draft.systemId || '255', 10), cid = parseInt(draft.componentId || '190', 10)
    const settings = { ...draft, url: draft.url.trim(), systemId: sid >= 1 && sid <= 255 ? sid : 255, componentId: cid >= 1 && cid <= 255 ? cid : 190 }
    validateUrl(settings.url)
    return settings
}
/** Accept the legacy WebSocket URL syntax, including rejection of empty fragments. */
export function validateUrl(value: string): void {
    try { const url = new URL(value); if (['ws:', 'wss:'].includes(url.protocol) && !url.href.includes('#')) return } catch { /* Report the same actionable validation text. */ }
    throw new Error('Enter a ws:// or wss:// URL without a fragment (#).')
}
/** Persist only successfully submitted connection settings; heartbeat remains a per-page choice. */
export function saveConnection(storage: StoragePair, settings: ConnectionSettings): void {
    storage.local.setItem('gcs.url', settings.url); storage.local.setItem('gcs.systemId', String(settings.systemId)); storage.session.setItem('gcs.componentId', String(settings.componentId))
    if (settings.passphrase) storage.local.setItem('gcs.passphrase', settings.passphrase)
    else storage.local.removeItem('gcs.passphrase')
}
/** Read the existing display storage contract, including legacy boolean strings. */
export function readDisplay(storage: Storage, config: DeploymentConfig = {}): DisplaySettings {
    const state: DisplaySettings = { tiles: storage.getItem('gcs.tiles.provider') ?? 'osm', googleKey: config.googleKey || storage.getItem('gcs.gmaps.apikey') || '', autoFetchFence: true, autoFetchMission: false, showGPSNumSats: false, showGrid: false, showLocation: false }
    for (const key of Object.keys(keys) as (keyof typeof keys)[]) { const value = storage.getItem(keys[key]); if (value !== null) state[key] = value === '1' || value === 'true' }
    return state
}
/** Preserve display keys shared with the complete legacy application. */
export function saveDisplay(storage: Storage, state: DisplaySettings): void {
    storage.setItem('gcs.tiles.provider', state.tiles); storage.setItem('gcs.gmaps.apikey', state.googleKey)
    for (const key of Object.keys(keys) as (keyof typeof keys)[]) storage.setItem(keys[key], state[key] ? '1' : '0')
}
