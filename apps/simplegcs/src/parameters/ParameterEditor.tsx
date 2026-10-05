import { useEffect, useRef, useState } from 'react'
import { FileInput, downloadFile } from '@webtools/react-workflows'
import { MAVParam, type PackedParameterChange } from '@webtools/parameters'
import type { ParameterSession } from './session.ts'
import { ParameterRow } from './ParameterRow.tsx'
import '../../../../modules/MAVLink/mavparam-ui.css'

interface ImportPreview { name: string; source: Map<string, number>; values: Map<string, number>; changes: PackedParameterChange[]; skipped: string[] }
/** Revalidate the original file against current values and readonly metadata without changing its bytes. */
function prepareImport(model: MAVParam, name: string, source: Map<string, number>): ImportPreview {
    const values = new Map(source), skipped: string[] = []
    for (const key of values.keys()) if (model.params.has(key) && model.definitions.get(key)?.readOnly) { skipped.push(key); values.delete(key) }
    return { name, source, values, skipped, changes: model.changes(values) }
}
interface EditorProps { session: ParameterSession | null; open: boolean; close: () => void }
/** Own parameter drafts, filters, file reads and dialog lifetime; protocol/metadata stay in shared models. */
export function ParameterEditor({ session, open, close }: EditorProps) {
    const dialog = useRef<HTMLDialogElement>(null), file = useRef<HTMLInputElement>(null)
    const [revision, render] = useState(0), [drafts, setDrafts] = useState<Record<string, string>>({})
    const [message, setMessage] = useState('Connect to a vehicle to fetch parameters.'), [error, setError] = useState(false)
    const [metadata, setMetadata] = useState('Descriptions not loaded.'), [loadingMetadata, setLoadingMetadata] = useState(false)
    const [query, setQuery] = useState(''), [nonDefault, setNonDefault] = useState(false), [page, setPage] = useState(0)
    const [scope, setScope] = useState('all'), [preview, setPreview] = useState<ImportPreview | null>(null)
    const owner = useRef<{ session: ParameterSession; active: boolean; fileRevision: number; metadataBusy: boolean } | null>(null)
    const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>())
    const model = session?.model, busy = !model || model.busy || !model.connected
    const parameters = model?.search(query, nonDefault) ?? [], pages = Math.max(1, Math.ceil(parameters.length / 50)), currentPage = Math.min(page, pages - 1), start = currentPage * 50
    // Keep model subscriptions and outstanding file completions scoped to the exact session object.
    useEffect(() => {
        setDrafts({}); setPreview(null); setPage(0); setError(false); setLoadingMetadata(false); setMetadata('Descriptions not loaded.')
        setMessage(session ? 'Fetch parameters to begin.' : 'Disconnected. Reconnect to fetch current parameters.')
        if (!session) { owner.current = null; return }
        const current = { session, active: true, fileRevision: 0, metadataBusy: false }
        owner.current = current
        const unsubscribe = session.model.subscribe(() => { if (current.active) render(value => value + 1) })
        return () => { current.active = false; current.fileRevision++; unsubscribe(); if (owner.current === current) owner.current = null }
    }, [session])
    useEffect(() => {
        const node = dialog.current
        if (open && node && !node.open) node.showModal()
        else if (!open && node?.open) node.close()
    }, [open])
    useEffect(() => {
        const urls = downloads.current
        return () => { for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url) }; urls.clear() }
    }, [])
    useEffect(() => {
        if (!open || !session) return
        if (!session.model.params.size && !session.model.busy) void run('Fetching parameters and defaults…', () => session.model.refresh(), 'Parameters refreshed.')
        void loadDefinitions(false)
        // Session/open transitions start work; ordinary telemetry renders never restart it.
    }, [open, session])
    /** Report errors without discarding the raw draft the user can correct. */
    function report(text: string): void { setMessage(text); setError(true) }
    /** Serialize UI work through the model and ignore all completions from replaced sessions. */
    async function run(text: string, action: () => Promise<unknown>, success: string, clear?: string | true): Promise<void> {
        const current = owner.current
        if (!current?.active || current.session.model.busy || !current.session.model.connected) return
        current.fileRevision++; setMessage(text); setError(false)
        try {
            await action()
            if (!current.active) return
            setMessage(success)
            if (clear === true) setPreview(null)
            if (clear) setDrafts(previous => { if (clear === true) return {}; const next = { ...previous }; delete next[clear]; return next })
        } catch (reason) { if (current.active) report(reason instanceof Error ? reason.message : String(reason)) }
        finally {
            if (current.active) {
                setPreview(previous => {
                    if (!previous) return null
                    try { return prepareImport(current.session.model, previous.name, previous.source) }
                    catch { return null }
                })
                render(value => value + 1)
            }
        }
    }
    /** Use the shared weekly cache and suppress metadata from an old vehicle/account lifetime. */
    async function loadDefinitions(refresh: boolean): Promise<void> {
        const current = owner.current
        if (!current?.active || current.metadataBusy) return
        current.metadataBusy = true; setLoadingMetadata(true); setMetadata(`Loading ${current.session.vehicle} descriptions…`)
        try {
            const result = await current.session.definitions.load(current.session.vehicle, { refresh })
            if (!current.active) return
            current.session.model.definitions = result.definitions
            setPreview(previous => {
                if (!previous) return null
                try { return prepareImport(current.session.model, previous.name, previous.source) }
                catch { return null }
            })
            setMetadata(`${current.session.vehicle} descriptions${result.stale ? ' (offline cached copy)' : result.cached ? ' (cached)' : ''}.`)
            render(value => value + 1)
        } catch { if (current.active) setMetadata('Descriptions unavailable. Parameter values can still be edited.') }
        finally { current.metadataBusy = false; if (current.active) setLoadingMetadata(false) }
    }
    /** Read one file with size/format validation; newer files, writes or sessions invalidate older reads. */
    async function loadFile(selected: File | null): Promise<void> {
        if (file.current) file.current.value = ''
        const current = owner.current
        if (!selected || !current?.active || current.session.model.busy) return
        const token = ++current.fileRevision
        setPreview(null)
        try {
            if (selected.size > 4 * 1024 * 1024) throw new Error('Parameter file exceeds 4 MiB')
            const text = await selected.text()
            if (!current.active || token !== current.fileRevision) return
            setPreview(prepareImport(current.session.model, selected.name, MAVParam.parseText(text))); setError(false)
        } catch (reason) { if (current.active && token === current.fileRevision) report(reason instanceof Error ? reason.message : String(reason)) }
    }
    /** Export the whole selected scope, independent of search, and own each temporary object URL. */
    function save(): void {
        if (!session) return
        const parameters = [...session.model.params.values()].filter(p => scope === 'all' || p.defaultValue !== undefined && p.value !== p.defaultValue)
        downloadFile((blob, name) => {
            const url = URL.createObjectURL(blob), anchor = document.createElement('a')
            anchor.href = url; anchor.download = name; anchor.click()
            const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.current.delete(url) }, 1000)
            downloads.current.set(url, timer)
        }, new Blob([MAVParam.saveText(parameters)], { type: 'text/plain' }), `${session.vehicle.toLowerCase()}-${scope}.parm`)
        setMessage(`Saved ${parameters.length} parameters. Search does not limit file exports.`); setError(false)
    }
    return <dialog ref={dialog} className="mavparam-dialog" aria-label="Parameters" onCancel={close} onClose={close} data-revision={revision}>
        <header><h2>Parameters</h2><button onClick={close}>Close</button></header>
        <div role="status" className={`mavparam-status${error ? ' mavparam-error' : ''}`}>{message}</div>
        <div className="mavparam-metadata"><span>{metadata}</span><button disabled={!session || loadingMetadata} onClick={() => void loadDefinitions(true)}>Refresh descriptions</button></div>
        <div className="mavparam-toolbar"><button disabled={busy} onClick={() => void run('Fetching parameters and defaults…', () => model!.refresh(), 'Parameters refreshed.')}>Fetch parameters</button>
            <select aria-label="Parameters to save" value={scope} onChange={event => setScope(event.target.value)}><option value="all">Save all parameters</option><option value="changed">Save non-default parameters</option></select>
            <button disabled={!model?.params.size} onClick={save}>Save to file</button><button disabled={busy || !model?.params.size} onClick={() => file.current?.click()}>Load from file</button>
            <span hidden><FileInput id="parameter-file" inputRef={file} accept=".parm,.param,.params,.txt" disabled={busy || !model?.params.size} onFile={selected => void loadFile(selected)} /></span>
            {model?.busy && <button onClick={() => session?.cancel()}>Cancel operation</button>}
        </div>
        <div className="mavparam-filters"><input type="search" aria-label="Search parameters" placeholder="Search parameter names and descriptions" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /><label><input type="checkbox" checked={nonDefault} onChange={event => { setNonDefault(event.target.checked); setPage(0) }} /> Non-default only</label></div>
        {preview && <section className="mavparam-import"><h3>{preview.name}: {preview.changes.length} changes</h3>{!!preview.skipped.length && <p>Skipped read-only parameters: {preview.skipped.join(', ')}</p>}<div className="mavparam-preview">{preview.changes.map(p => <div key={p.name}>{p.name}: {MAVParam.formatValue(p, p.previousValue)} → {MAVParam.formatValue(p)}</div>)}</div>
            <button disabled={busy || !preview.changes.length} onClick={() => void run('Uploading parameter file and verifying values…', () => model!.apply(preview.values), 'Parameter file uploaded and verified.', true)}>Upload changes</button><button onClick={() => { if (owner.current) owner.current.fileRevision++; setPreview(null) }}>Cancel import</button></section>}
        <div className="mavparam-list">{!parameters.length && <p>{model?.params.size ? 'No parameters match this search.' : 'No parameters loaded.'}</p>}{parameters.slice(start, start + 50).map(p => {
            const d = model!.definitions.get(p.name) ?? {}, value = drafts[p.name] ?? MAVParam.formatValue(p)
            return <ParameterRow key={p.name} parameter={p} definition={d} value={value} busy={busy} edit={text => setDrafts(previous => ({ ...previous, [p.name]: text }))} report={report}
                apply={() => void run(`Writing ${p.name}…`, async () => model!.apply(MAVParam.parseText(`${p.name} ${value}`)), `${p.name} saved and verified.${d.rebootRequired ? ' Reboot required for this setting.' : ''}`, p.name)}
                reset={() => void run(`Resetting ${p.name}…`, () => model!.reset(p.name), `${p.name} reset and verified.`, p.name)} />
        })}</div>
        <footer><span>{parameters.length ? start + 1 : 0}–{Math.min(start + 50, parameters.length)} of {parameters.length} matches · {model?.params.size ?? 0} parameters</span><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></footer>
    </dialog>
}
