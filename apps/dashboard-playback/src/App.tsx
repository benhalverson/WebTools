import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { WidgetRuntime, parseLayout, serializeLayout, parseWidget, type WidgetHost, type Layout } from '@webtools/widget-runtime'
import { FileInput } from '@webtools/react-workflows'
import { Palette } from './Palette'
import { WidgetSettings } from './WidgetSettings'
import { SourceEditor } from './SourceEditor'
import { download } from './download'
import { DashboardConnection, type ConnectionState } from './connection'
import { dashboardLink, decompressLayout, readSettings, type ConnectionSettings } from './settings'

/** Use native number-input sanitization before restoring protocol source IDs. */
function sanitizeNumber(value: string): string {
    const input = document.createElement('input')
    input.type = 'number'; input.value = value
    return input.value
}

/** Convert browser-normalized RGB into the native color input format. */
function colorInput(value: string): string {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value
    const channels = value.match(/\d+/g)?.slice(0, 3)
    return channels?.length === 3 ? '#' + channels.map(channel => Number(channel).toString(16).padStart(2, '0')).join('') : '#ffffff'
}

const colors: Record<ConnectionState, string> = { idle: 'black', connecting: 'orange', connected: 'green', failed: 'red' }

/** Own dashboard connection, layout, and editor state while the runtime owns widget resources. */
export function App({ defaultHtml }: { defaultHtml: string }) {
    const [settings, setSettings] = useState(() => readSettings(location.hash, sanitizeNumber))
    const [state, setState] = useState<ConnectionState>('idle')
    const [panel, setPanel] = useState<'connection' | 'layout' | 'palette' | null>(null)
    const [menuCount, setMenuCount] = useState(0)
    const [editing, setEditing] = useState(false)
    const editingRef = useRef(editing)
    const [selected, setSelected] = useState<WidgetHost>()
    const [sourceEditing, setSourceEditing] = useState(false)
    /** Keep error callbacks stable so rerenders cannot recreate preview resources. */
    const failure = useCallback((cause: unknown): void => setError(String(cause)), [])
    const [gridSettings, setGridSettings] = useState<Layout['grid']>({ rows: 6, columns: 6, color: '#ffffff' })
    const [layout, setLayout] = useState<Layout>()
    const [error, setError] = useState('')
    const [link, setLink] = useState('')
    const [copied, setCopied] = useState(false)
    const copyTimer = useRef<number | undefined>(undefined)
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
    const layoutDirty = useRef(false)
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
        return () => { controller.abort(); loadGeneration.current++; fileGeneration.current++; linkGeneration.current++; window.clearTimeout(copyTimer.current); copyTimer.current = undefined }
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
        linkGeneration.current++
        window.clearTimeout(copyTimer.current)
        copyTimer.current = undefined
        setCopied(false)
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
                sandboxUrl: `${import.meta.env.BASE_URL}Widgets/SandBox.html`,
                onError: cause => { if (active) setError(String(cause)) },
                onWidgetDisposed: widget => setSelected(current => current === widget ? undefined : current),
                onEdit: widget => { setPanel(null); setSelected(widget); setSourceEditing(false) },
                onNoFit: () => { if (active) setError("Widget won't fit on Grid") },
                /** Bind retained menu icons to React panels and remove every listener on disposal. */
                mountMenu: menu => {
                    const buttons = menu.querySelectorAll<SVGElement>('svg')
                    const connectIcon = buttons[0]
                    const settingsIcon = buttons[1]
                    /** Open the React connection panel from the retained menu icon. */
                    const openConnection = (): void => setPanel('connection')
                    /** Open dashboard settings from the retained menu icon. */
                    const openLayout = (): void => setPanel('layout')
                    if (connectIcon) { icons.current.add(connectIcon); setMenuCount(icons.current.size); connectIcon.addEventListener('click', openConnection) }
                    settingsIcon?.addEventListener('click', openLayout)
                    /** Make retained SVG menu controls keyboard-operable without changing their artwork. */
                    function activate(event: KeyboardEvent): void {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        if (event.currentTarget === connectIcon) openConnection()
                        else openLayout()
                    }
                    for (const [icon, label] of [[connectIcon, 'Connection Settings'], [settingsIcon, 'Dashboard settings']] as const) {
                        if (!icon) continue
                        icon.setAttribute('tabindex', '0'); icon.setAttribute('role', 'button'); icon.setAttribute('aria-label', label)
                        icon.addEventListener('keydown', activate)
                    }
                    for (const image of menu.querySelectorAll('img')) image.src = `${import.meta.env.BASE_URL}images/${image.src.split('/').pop()}`
                    return () => {
                        if (connectIcon) { icons.current.delete(connectIcon); setMenuCount(icons.current.size); connectIcon.removeEventListener('click', openConnection) }
                        settingsIcon?.removeEventListener('click', openLayout)
                        connectIcon?.removeEventListener('keydown', activate)
                        settingsIcon?.removeEventListener('keydown', activate)
                    }
                },
            }, layout)
            runtime.current = owner
            owner.setEditing(editingRef.current)
            setGridSettings(owner.snapshot().grid)
            void owner.ready.then(() => { if (active) setReady(true) }).catch(failed)
        } catch (cause) { failed(cause) }
        return () => { active = false; controller.abort(); runtime.current = undefined; owner?.destroy() }
    }, [layout, defaultHtml])

    useEffect(() => {
        editingRef.current = editing
        runtime.current?.setEditing(editing)
        if (!editing) { setSelected(undefined); setSourceEditing(false); setPanel(current => current === 'palette' ? null : current) }
    }, [editing])

    useEffect(() => {
        /** Ask before navigation only while the current runtime has unsaved edits. */
        function beforeUnload(event: BeforeUnloadEvent): void {
            if (!layoutDirty.current && !runtime.current?.getChanged()) return
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [])

    useEffect(() => {
        for (const icon of icons.current) icon.style.fill = colors[state]
    }, [state, ready, menuCount])

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
            const text = await file.text()
            if (generation !== fileGeneration.current) return
            const object: unknown = JSON.parse(text)
            if (object && typeof object === 'object' && 'widget' in object) {
                const added = runtime.current?.add(parseWidget(text).widget)
                if (added) await added.ready
                return
            }
            const next = parseLayout(text)
            if (generation !== fileGeneration.current) return
            loadGeneration.current++; linkGeneration.current++; fallbackAttempted.current = false
            layoutDirty.current = false
            setSelected(undefined); setSourceEditing(false)
            setError(''); setLink(''); setLayout(next)
        } catch (cause) { if (generation === fileGeneration.current) setError(String(cause)) }
    }

    /** Download the runtime's exact legacy serializer output, releasing the temporary URL afterwards. */
    function saveFile(): void {
        if (!runtime.current) return
        download(serializeLayout(runtime.current.snapshot()), 'TelemetryDashboard.json')
        runtime.current.saved()
        layoutDirty.current = false
    }

    /** Produce and copy the legacy-compatible URL; release temporary copy feedback on disposal. */
    async function makeLink(): Promise<void> {
        if (!runtime.current) return
        const generation = ++linkGeneration.current
        window.clearTimeout(copyTimer.current)
        setCopied(false)
        try {
            const next = await dashboardLink(location.href, settings, JSON.stringify(runtime.current.snapshot()))
            if (generation !== linkGeneration.current) return
            setLink(next)
            try {
                await navigator.clipboard.writeText(next)
                if (generation !== linkGeneration.current) return
                setCopied(true)
                copyTimer.current = window.setTimeout(() => { setCopied(false); copyTimer.current = undefined }, 2000)
            } catch { /* Keep the generated link selectable when clipboard access is unavailable. */ }
        } catch (cause) { if (generation === linkGeneration.current) setError(String(cause)) }
    }

    /** Retain legacy column relayout and row rebuild semantics with owned React state. */
    function dimensions(key: 'columns' | 'rows', value: string): void {
        const number = Number(value)
        const owner = runtime.current
        if (!owner || !Number.isInteger(number) || number < 2 || number > 12) return
        layoutDirty.current = true
        if (key === 'columns') { owner.grid.column(number, 'list'); setGridSettings(owner.snapshot().grid) }
        else {
            const next = owner.snapshot()
            next.grid.rows = value
            setSelected(undefined); setSourceEditing(false)
            setLayout(next)
        }
    }

    const busy = state === 'connecting' || state === 'connected'
    return <>
        <div id="dashboard" className="grid-stack" ref={host} data-ready={ready} onClick={event => { if (editing && event.target === event.currentTarget) { setSelected(undefined); setPanel('palette') } }} />
        <nav className="playback-controls" hidden={menuCount > 0} aria-label="Dashboard playback">
            <button onClick={() => setPanel('connection')}>Connection <span style={{ color: colors[state] }} aria-label="Connection status">{state}</span></button>
            <button onClick={() => setPanel('layout')}>Saved layout</button>
            <label><input type="checkbox" checked={editing} onChange={event => setEditing(event.target.checked)} />Enable widget edit</label>
            {editing && <button disabled={!ready} onClick={() => { setSelected(undefined); setPanel('palette') }}>Add widget</button>}
        </nav>
        {panel === 'palette' && runtime.current && <Palette runtime={runtime.current} close={() => setPanel(null)} failure={failure} />}
        {selected && !sourceEditing && <WidgetSettings widget={selected} close={() => setSelected(undefined)} edit={() => setSourceEditing(true)} failure={failure} />}
        {selected && sourceEditing && <SourceEditor widget={selected} close={() => setSourceEditing(false)} failure={failure} />}
        {panel && panel !== 'palette' && <section className="playback-panel" aria-label={panel === 'connection' ? 'Connection Settings' : 'Saved layout'}>
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
                <button disabled={!ready} onClick={saveFile}>Save layout</button><button disabled={!ready} aria-label="Get dashboard link" onClick={() => void makeLink()}>{copied ? 'Copied!' : 'Get dashboard link'}</button>
                <fieldset disabled={!ready}><legend>Dashboard settings</legend>
                    {menuCount > 0 && <label><input type="checkbox" checked={editing} onChange={event => setEditing(event.target.checked)} />Enable widget edit</label>}
                    {menuCount > 0 && editing && <button onClick={() => setPanel('palette')}>Add widget</button>}
                    <label>Columns<input type="number" min="2" max="12" value={gridSettings.columns} onChange={event => dimensions('columns', event.target.value)} /></label>
                    <label>Rows<input type="number" min="2" max="12" value={gridSettings.rows} onChange={event => dimensions('rows', event.target.value)} /></label>
                    <label>Background color<input type="color" value={colorInput(gridSettings.color)} onChange={event => { if (host.current) { host.current.style.backgroundColor = event.target.value; layoutDirty.current = true; setGridSettings(current => ({ ...current, color: event.target.value })) } }} /></label>
                </fieldset>
                {link && <><label htmlFor="dashboard-link">Dashboard link</label><textarea id="dashboard-link" readOnly value={link} /></>}
            </div>}
        </section>}
        {error && <div role="alert" className="playback-error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    </>
}
