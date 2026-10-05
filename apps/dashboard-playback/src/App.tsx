import { useEffect, useRef, useState, type FormEvent } from 'react'
import { WidgetRuntime, parseLayout, serializeLayout, type Layout } from '@webtools/widget-runtime'
import { FileInput } from '@webtools/react-workflows'
import { DashboardConnection, type ConnectionState } from './connection'
import { dashboardLink, decompressLayout, readSettings, type ConnectionSettings } from './settings'

/** Use native number-input sanitization before restoring protocol source IDs. */
function sanitizeNumber(value: string): string {
    const input = document.createElement('input')
    input.type = 'number'; input.value = value
    return input.value
}

const colors: Record<ConnectionState, string> = { idle: 'black', connecting: 'orange', connected: 'green', failed: 'red' }

/** Present a saved layout and read-only connection controls; the editor remains in the public legacy app. */
export function App({ defaultHtml }: { defaultHtml: string }) {
    const [settings, setSettings] = useState(() => readSettings(location.hash, sanitizeNumber))
    const [state, setState] = useState<ConnectionState>('idle')
    const [panel, setPanel] = useState<'connection' | 'layout' | null>(null)
    const [layout, setLayout] = useState<Layout>()
    const [error, setError] = useState('')
    const [link, setLink] = useState('')
    const [ready, setReady] = useState(false)
    const host = useRef<HTMLDivElement>(null)
    const runtime = useRef<WidgetRuntime | undefined>(undefined)
    const connection = useRef<DashboardConnection | undefined>(undefined)
    const initialSettings = useRef(settings)
    const loadGeneration = useRef(0)
    const fileGeneration = useRef(0)
    const linkGeneration = useRef(0)
    const fileInput = useRef<HTMLInputElement>(null)
    const fallbackAttempted = useRef(false)
    const icons = useRef(new Set<SVGElement>())

    useEffect(() => {
        const controller = new AbortController()
        const generation = ++loadGeneration.current
        /** Restore the hash layout, falling back to the unchanged default on malformed links. */
        async function restore(): Promise<void> {
            let restored: Layout | undefined
            const encoded = new URLSearchParams(location.hash.slice(1)).get('layout')
            if (encoded) {
                try { restored = parseLayout(await decompressLayout(encoded)) }
                catch { /* Legacy invalid links silently fall back to the default layout. */ }
            }
            if (!restored) {
                const response = await fetch(`${import.meta.env.BASE_URL}Default_Layout.json`, { signal: controller.signal })
                if (!response.ok) throw new Error(`Default layout unavailable (${response.status})`)
                restored = parseLayout(await response.text())
            }
            if (!controller.signal.aborted && loadGeneration.current === generation) setLayout(restored)
        }
        void restore().catch(cause => { if (!controller.signal.aborted && generation === loadGeneration.current) setError(String(cause)) })
        return () => { controller.abort(); loadGeneration.current++; fileGeneration.current++; linkGeneration.current++ }
    }, [])

    useEffect(() => {
        const owner = new DashboardConnection({
            state: setState,
            opened: target => { setSettings(current => ({ ...current, ws: target })); setPanel(null) },
            message: message => runtime.current?.publish(message),
        })
        connection.current = owner
        owner.connect(initialSettings.current, true)
        return () => { connection.current = undefined; owner.disconnect() }
    }, [])

    useEffect(() => {
        if (!host.current || !layout) return
        let active = true
        let owner: WidgetRuntime | undefined
        const controller = new AbortController()
        const generation = loadGeneration.current
        /** Recover failed widget setup once, without letting an obsolete fallback replace a newer file. */
        function failed(cause: unknown): void {
            if (!active) return
            runtime.current = undefined
            setReady(false)
            setError(String(cause))
            if (fallbackAttempted.current) return
            fallbackAttempted.current = true
            void fetch(`${import.meta.env.BASE_URL}Default_Layout.json`, { signal: controller.signal })
                .then(async response => {
                    if (!response.ok) throw new Error(`Default layout unavailable (${response.status})`)
                    const next = parseLayout(await response.text())
                    if (active && generation === loadGeneration.current) { linkGeneration.current++; setLink(''); setLayout(next) }
                }).catch(error => { if (active) setError(String(error)) })
        }
        setReady(false)
        try {
            owner = new WidgetRuntime(host.current, {
                createGrid: (options, element) => window.GridStack.init(options, element),
                forms: window.Formio, defaultHtml,
                sandboxUrl: `${import.meta.env.BASE_URL}runtime/Widgets/SandBox.html`,
                onError: failed,
                onNoFit: () => { if (active) setError("Widget won't fit on Grid") },
                /** Bind retained menu icons to React panels and remove every listener on disposal. */
                mountMenu: menu => {
                    const buttons = menu.querySelectorAll<SVGElement>('svg')
                    const connectIcon = buttons[0]
                    const settingsIcon = buttons[1]
                    /** Open the React connection panel from the retained menu icon. */
                    const openConnection = (): void => setPanel('connection')
                    /** Open saved-layout controls without enabling editing. */
                    const openLayout = (): void => setPanel('layout')
                    if (connectIcon) { icons.current.add(connectIcon); connectIcon.addEventListener('click', openConnection) }
                    settingsIcon?.addEventListener('click', openLayout)
                    for (const image of menu.querySelectorAll('img')) image.src = `${import.meta.env.BASE_URL}images/${image.src.split('/').pop()}`
                    return () => {
                        if (connectIcon) { icons.current.delete(connectIcon); connectIcon.removeEventListener('click', openConnection) }
                        settingsIcon?.removeEventListener('click', openLayout)
                    }
                },
            }, layout)
            runtime.current = owner
            void owner.ready.then(() => { if (active) setReady(true) }).catch(failed)
        } catch (cause) { failed(cause) }
        return () => { active = false; controller.abort(); runtime.current = undefined; owner?.destroy() }
    }, [layout, defaultHtml])

    useEffect(() => {
        for (const icon of icons.current) icon.style.fill = colors[state]
    }, [state, ready])

    /** Apply one controlled form field without persisting signing credentials. */
    function change<K extends keyof ConnectionSettings>(key: K, value: ConnectionSettings[K]): void {
        setSettings(current => ({ ...current, [key]: value }))
    }

    /** Browser validity checks retain the legacy WebSocket URL constraint. */
    function connect(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        const address = event.currentTarget.querySelector<HTMLInputElement>('input[type=url]')
        if (!address?.reportValidity()) return
        connection.current?.connect(settings)
    }

    /** Load only complete saved layouts, ignoring obsolete reads when another file wins. */
    async function loadFile(file: File | null): Promise<void> {
        if (fileInput.current) fileInput.current.value = ''
        if (!file) return
        const generation = ++fileGeneration.current
        try {
            const next = parseLayout(await file.text())
            if (generation !== fileGeneration.current) return
            loadGeneration.current++; linkGeneration.current++; fallbackAttempted.current = false
            setError(''); setLink(''); setLayout(next)
        } catch (cause) { if (generation === fileGeneration.current) setError(String(cause)) }
    }

    /** Download the runtime's exact legacy serializer output, releasing the temporary URL afterwards. */
    function saveFile(): void {
        if (!runtime.current) return
        const url = URL.createObjectURL(new Blob([serializeLayout(runtime.current.snapshot())], { type: 'text/plain;charset=utf-8' }))
        const anchor = document.createElement('a')
        anchor.href = url; anchor.download = 'TelemetryDashboard.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }

    /** Produce a reloadable URL using the same compact snapshot and settings rules as legacy. */
    async function makeLink(): Promise<void> {
        if (!runtime.current) return
        const generation = ++linkGeneration.current
        try {
            const next = await dashboardLink(location.href, settings, JSON.stringify(runtime.current.snapshot()))
            if (generation === linkGeneration.current) setLink(next)
        } catch (cause) { if (generation === linkGeneration.current) setError(String(cause)) }
    }

    const busy = state === 'connecting' || state === 'connected'
    return <>
        <div id="dashboard" className="grid-stack" ref={host} data-ready={ready} />
        <nav className="playback-controls" aria-label="Dashboard playback">
            <button onClick={() => setPanel('connection')}>Connection <span style={{ color: colors[state] }} aria-label="Connection status">{state}</span></button>
            <button onClick={() => setPanel('layout')}>Saved layout</button>
        </nav>
        {panel && <section className="playback-panel" aria-label={panel === 'connection' ? 'Connection Settings' : 'Saved layout'}>
            <header><strong>{panel === 'connection' ? 'Connection Settings' : 'Saved layout'}</strong><button onClick={() => setPanel(null)} aria-label="Close settings">×</button></header>
            {panel === 'connection' ? <form noValidate onSubmit={connect}>
                <fieldset disabled={busy}>
                    <label>Server address<input type="url" required pattern="^(ws|wss)://.*" placeholder="ws://127.0.0.1:5863" value={settings.ws} onChange={event => change('ws', event.target.value)} /></label>
                    <p>Read only: no MAVLink commands or stream rate requests are sent. Auto-connect attempts MissionPlanner at ws://127.0.0.1:56781.</p>
                    <label><input type="checkbox" checked={settings.heartbeat} onChange={event => change('heartbeat', event.target.checked)} /> Enable heartbeat</label>
                    {settings.heartbeat && <div>
                        <label>Source system ID<input type="number" min="1" max="255" value={settings.sysid} onChange={event => change('sysid', event.target.value)} /></label>
                        <label>Source component ID<input type="number" min="0" max="255" value={settings.compid} onChange={event => change('compid', event.target.value)} /></label>
                        <label>Signing passphrase<input type="password" placeholder="Signing disabled" value={settings.signing} onChange={event => change('signing', event.target.value)} /></label>
                    </div>}
                </fieldset>
                <button type="submit" disabled={busy}>Connect</button><button type="button" disabled={!busy} onClick={() => connection.current?.disconnect()}>Disconnect</button>
            </form> : <div>
                <label htmlFor="load-layout">Load layout</label><FileInput id="load-layout" accept=".json,application/json" inputRef={fileInput} onFile={file => void loadFile(file)} />
                <button disabled={!ready} onClick={saveFile}>Save layout</button><button disabled={!ready} onClick={() => void makeLink()}>Get dashboard link</button>
                {link && <><label htmlFor="dashboard-link">Dashboard link</label><textarea id="dashboard-link" readOnly value={link} /></>}
            </div>}
        </section>}
        {error && <div role="alert" className="playback-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    </>
}
