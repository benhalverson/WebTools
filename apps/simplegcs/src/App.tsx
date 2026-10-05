import { useCallback, useEffect, useState } from 'react'
import { MapView, type MapViewProps } from './MapView.tsx'
import { useOperations } from './useOperations.ts'
import { useConnection } from './useConnection.ts'
import { readDisplay, saveDisplay, type StoragePair, type DisplaySettings, type DeploymentConfig } from './settings.ts'
import type { SocketFactory } from './connection.ts'
import type { LocationProvider } from './location.ts'
import { speedText } from './telemetry.ts'
import './style.css'
import { Messages } from './messages.tsx'
import { VideoControls } from './VideoControls.tsx'
import { ParameterEditor } from './parameters/ParameterEditor.tsx'
import { useParameterSession } from './parameters/useParameterSession.ts'
import type { ParameterSession, ParameterSessionFactory } from './parameters/session.ts'
export interface AppProps { simulated?: boolean; parameters?: ParameterSessionFactory | undefined; onParameters?: ((session: ParameterSession | null) => void) | undefined; socket: SocketFactory; location: LocationProvider; storage: StoragePair; locks?: LockManager; onMap?: MapViewProps['onMap']; prefix: string; config: DeploymentConfig }

/** Reject accidental acquisition of a test-only factory without a supplied identity. */
function unavailableParameters(): ParameterSession { throw new Error('No injected parameter factory') }
const providers = [['osm', 'OpenStreetMap (default)'], ['opentopomap', 'OpenTopoMap'], ['carto-light', 'Carto Light'], ['carto-dark', 'Carto Dark'], ['esri-world-imagery', 'Esri World Imagery (Satellite)'], ['au-ga-topo', 'Australia — Geoscience Topographic'], ['uk-os-opendata', 'UK — Ordnance Survey OpenData'], ['google', 'Google Maps (Roadmap)'], ['google-terrain', 'Google Maps (Terrain)'], ['google-satellite', 'Google Maps (Satellite)'], ['google-hybrid', 'Google Maps (Hybrid)']]
const options = [['showGrid', 'Show Grid'], ['showLocation', 'Show My Location'], ['showGPSNumSats', 'Show GPS NumSats'], ['autoFetchFence', 'Fetch fence on first heartbeat'], ['autoFetchMission', 'Fetch mission on first heartbeat']] as const
/** Render the intermediate telemetry, command and transfer flow; all converted UI state is owned by React. */
export default function App({ socket, location, storage, locks, onMap, config, simulated, parameters, onParameters }: AppProps) {
    const { connection, draft, link, busy, error, connect, disconnect, edit } = useConnection(socket, storage, locks, config)
    const [logError, setLogError] = useState<{ text: string } | null>(null)
    const [parametersOpen, setParametersOpen] = useState(false)
    const [display, setDisplay] = useState(() => readDisplay(storage.local, config)), [dialog, setDialog] = useState<'connection' | 'settings' | 'menu' | null>(null), [showPassphrase, setShowPassphrase] = useState(false), [recenter, setRecenter] = useState(0), [notice, setNotice] = useState<{ text: string; duration?: number } | null>(null)
    useEffect(() => { if (error) { const entry = { text: error.message }; setNotice(entry); setLogError(entry) } }, [error])
    useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), notice.duration ?? 1500); return () => clearTimeout(timer) }, [notice])
    const report = useCallback((text: string, duration = 1500) => { const entry = { text, duration }; setNotice(entry); if (duration === 3000) setLogError(entry) }, [])
    const { state: operations, act, beginReposition } = useOperations(connection, display, report)
    const injectedSession = useParameterSession(parameters ?? unavailableParameters, parameters && link.telemetry.system > 0 ? link.mapIdentity : null)
    const parameterSession = parameters ? injectedSession : operations.parameterSession
    useEffect(() => { onParameters?.(parameterSession); return () => onParameters?.(null) }, [parameterSession, onParameters])
    /** Persist display edits immediately using the shared legacy storage contract. */
    function changeDisplay<K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]): void {
        const next = { ...display, [key]: value }; saveDisplay(storage.local, next); setDisplay(next)
    }
    /** Close the editor and mask its password while retaining every unsaved field. */
    function closeDialog(): void { setDialog(null); setShowPassphrase(false) }
    /** Apply the legacy no-key Google fallback when opening display settings. */
    function openSettings(): void { if (!display.googleKey && display.tiles.startsWith('google')) changeDisplay('tiles', 'osm'); setDialog('settings'); setShowPassphrase(false) }
    /** Dispatch a menu command and restore the unobstructed map like the legacy menu. */
    function menuAct(action: Parameters<typeof act>[0]): void { act(action); closeDialog() }
    const t = link.telemetry
    return <>
        <div id="app"><aside id="toolbar">
            <button id="armBtn" className="btn primary" onClick={() => act(owner => owner.command(400, [1], "ARM sent"))}>ARM</button><button id="disarmBtn" className="btn danger" onClick={() => act(owner => owner.command(400, [0], "DISARM sent"))}>DISARM</button><button id="rtlBtn" className="btn warn" onClick={() => act(owner => owner.mode(11, "RTL"))}>RTL</button><button id="loiterBtn" className="btn warn" onClick={() => act(owner => owner.mode(5, "LOITER"))}>Loiter</button>
            <div id="telemetry" className={link.stale ? 'stale' : ''}>
                <div id="link-status" role="status">{link.status}</div>
                <div id="status-display"><span id="armed-pill" style={{ background: t.armed ? '#81c784' : '#9e9e9e' }}>{t.armed === null ? '—' : t.armed ? 'ARMED' : 'DISARM'}</span><div>MODE: <strong id="mode-value">{t.modeName}</strong></div></div>
                <div id="battery-display"><div>BATTERY</div><strong id="battery-value" style={{ color: t.batteryPct === null || t.batteryPct < 0 ? '#fff' : t.batteryPct < 20 ? '#f44336' : t.batteryPct < 40 ? '#ff9800' : '#4caf50' }}>{t.batteryPct !== null && t.batteryPct >= 0 ? `${t.batteryPct}%` : '---'}</strong><div id="current-value">{t.currentA !== null && t.currentA >= 0 ? `${t.currentA.toFixed(1)} A` : '--- A'}</div></div>
                <div id="speed-display"><div>SPEED</div><strong id="speed-value">{speedText(t.speed)}</strong></div>
                <div id="gps-display" style={{ display: display.showGPSNumSats ? 'block' : 'none' }}><div>GPS</div><strong id="gps-sats-value" style={{ color: t.numSats !== null && t.numSats >= 20 ? '#4caf50' : '#fff' }}>{t.numSats === null ? '— sats' : `${t.numSats} sats`}</strong></div>
                <div id="lte-display"><div>LTE</div><strong id="lte-carrier">{t.carrier}</strong><div id="lte-rsrp">{t.rsrp}</div></div>
            </div><div style={{ flex: 1 }} /><button className="btn small" id="menuBtn" onClick={() => setDialog(value => value === 'menu' ? null : 'menu')}>☰</button><button className="btn small" id="recenterBtn" onClick={() => setRecenter(value => value + 1)}>Recenter</button>
            <button className="btn small" id="connectBtn" onClick={() => setDialog('connection')} style={{ background: link.phase === 'connected' ? '#00c853' : link.phase === 'connecting' ? '#f9a825' : link.phase === 'error' ? '#e53935' : undefined }}>Connect{link.lagSeconds ? ` (${link.lagSeconds}s)` : ''}</button>
        </aside><MapView offline={simulated ?? false} operations={operations} beginReposition={beginReposition} link={link} display={display} location={location} report={report} recenter={recenter} onMap={onMap} /></div>
        <ParameterEditor session={parameterSession} open={parametersOpen} close={() => setParametersOpen(false)} />
        <div className="preview"><button onClick={() => setParametersOpen(true)}>Parameters</button>{simulated && " Simulated GCS · Offline map"}</div>
        <section className="editor" hidden={dialog !== 'connection'} aria-label="Connection Settings">
            <h2>Connection Settings</h2><label htmlFor="target_url">Server address</label><input id="target_url" type="url" value={draft.url} onChange={event => edit('url', event.target.value)} />
            <label>SysID <input id="system_id" type="number" min="1" max="255" value={draft.systemId} onChange={event => edit('systemId', event.target.value)} /></label><label>CompID <input id="component_id" type="number" min="1" max="255" value={draft.componentId} onChange={event => edit('componentId', event.target.value)} /></label>
            <label><input id="send_heartbeat" type="checkbox" checked={draft.sendHeartbeat} onChange={event => edit('sendHeartbeat', event.target.checked)} />Send 1Hz Heartbeat</label>
            <label htmlFor="signing_passphrase">Signing passphrase</label><input id="signing_passphrase" type={showPassphrase ? 'text' : 'password'} value={draft.passphrase} onChange={event => edit('passphrase', event.target.value)} /><button id="toggle_signing_passphrase" aria-controls="signing_passphrase" aria-label={`${showPassphrase ? 'Hide' : 'Show'} signing passphrase`} aria-pressed={showPassphrase} onClick={() => setShowPassphrase(value => !value)}>{showPassphrase ? 'Hide' : 'Show'}</button>
            <p><button id="connection_button" disabled={busy} onClick={() => { void connect().then(connected => { if (connected) closeDialog() }) }}>Connect</button> <button id="disconnection_button" onClick={disconnect}>Disconnect</button> <button onClick={closeDialog}>Close</button></p>
        </section>
        <section className="editor" hidden={dialog !== 'menu'} aria-label="GCS Menu"><VideoControls storage={storage.local} onAction={closeDialog} /><Messages error={logError} connection={connection} onOpen={closeDialog} /><button onClick={openSettings}>Settings</button><div className="command-actions">
                <button onClick={() => menuAct(owner => owner.fetch('fence'))} disabled={operations.fencePending}>Fetch Fence</button><button onClick={() => menuAct(owner => owner.fetch('mission'))} disabled={operations.missionPending}>Fetch Mission</button>
                <button onClick={() => menuAct(owner => owner.command(207, [0]))}>Fence Disable</button><button onClick={() => menuAct(owner => owner.command(207, [1]))}>Fence Enable</button>
                <button onClick={() => { if (window.confirm('Reboot the connected vehicle?')) menuAct(owner => owner.command(246, [1])) }}>Reboot</button>
                <button onClick={() => { if (window.confirm('Force disarm immediately? This bypasses normal disarm checks.')) menuAct(owner => owner.command(400, [0, 21196])) }}>ForceDisarm</button>
                <button onClick={() => { if (window.confirm('Force arm? This bypasses pre-arm checks and may start the motors.')) menuAct(owner => owner.command(400, [1, 21196])) }}>ForceArm</button>
                <p role="status" id="operations-status">{operations.status}</p><p>{operations.fencePending ? 'Fetching fence… ' : ''}{operations.missionPending ? 'Fetching mission…' : ''}</p>
            </div><button onClick={closeDialog}>Close</button></section>
        <section className="editor" hidden={dialog !== 'settings'} aria-label="Display Settings"><h2>Settings</h2><label>Map Tiles <select aria-label="Map Tiles" value={display.tiles} onChange={event => changeDisplay('tiles', event.target.value)}>{providers.filter(([key]) => display.googleKey || !key!.startsWith('google')).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Google Maps API Key <input id="gmaps-key-input" value={display.googleKey} onChange={event => changeDisplay('googleKey', event.target.value.trim())} /></label>
            {options.map(([key, label]) => <label key={key}><input type="checkbox" checked={display[key]} onChange={event => changeDisplay(key, event.target.checked)} />{label}</label>)}<button onClick={closeDialog}>Close</button>
        </section>
        {notice && <div className="toast" role="status">{notice.text}</div>}
    </>
}
