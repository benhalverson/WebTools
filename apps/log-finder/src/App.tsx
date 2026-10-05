import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadingOverlay, useLoading } from '@webtools/react-workflows'
import type { DataflashConstructor } from '@webtools/dataflash'
import { directoryFiles, readFile, type DirectoryHandle } from './directory.ts'
import { groupLogs, ignoreRules, loadLog, type LogEntry } from './model.ts'
import { mountTable } from './table.ts'
import { vendors } from './vendors.ts'

/** Import the standalone parser entry without rebundling its adjacent vendor directory. */
async function parserConstructor(base: string): Promise<DataflashConstructor> {
    const url = new URL(base + 'dataflash/index.js', window.location.href)
    const module = await import(/* @vite-ignore */ url.href) as typeof import('@webtools/dataflash')
    return module.loadDataflashParser()
}
/** Own exactly one table instance and update filters without losing the current sort. */
function BoardTable({ logs, parser, ignored, onError }: { logs: LogEntry[]; parser: DataflashConstructor; ignored: readonly boolean[]; onError: (error: unknown) => void }) {
    const element = useRef<HTMLDivElement>(null)
    const filters = useRef(ignored); filters.current = ignored
    const table = useRef<ReturnType<typeof mountTable> | null>(null)
    useEffect(() => {
        if (!element.current) return
        const mounted = mountTable(element.current, logs, parser, () => filters.current, onError)
        table.current = mounted
        return () => { mounted.dispose(); table.current = null }
    }, [logs, parser, onError])
    useEffect(() => { table.current?.update() }, [ignored])
    return <div ref={element} style={{ width: 1200 }} />
}
/** Own selection, parser readiness, cancellation and grouped table state for LogFinder. */
export default function App({ base }: { base: string }) {
    const [ignored, setIgnored] = useState(ignoreRules.map(() => true))
    const [groups, setGroups] = useState<ReturnType<typeof groupLogs>>([])
    const [directory, setDirectory] = useState<DirectoryHandle | undefined>()
    const [parser, setParser] = useState<DataflashConstructor>()
    const [progress, setProgress] = useState<{ value: number; max: number } | null>(null)
    const boards = useRef<Record<string, string>>({})
    const lifetime = useRef<AbortController | null>(null)
    const selection = useRef(0)
    const reading = useRef<AbortController | null>(null)
    /** Report legacy errors while the shared overlay retains its documented rejection behavior. */
    const onError = useCallback((error: unknown) => {
        alert('Sorry, something went wrong.\n\nPlease try a hard reload of this page to clear its cache.\n\nIf the error persists open an issue on the GitHub repo.\nInclude a copy of the log and the following error message:\n\n' + String(error))
    }, [])
    const loading = useLoading(onError)
    useEffect(() => {
        const controller = new AbortController(); lifetime.current = controller
        document.title = 'ArduPilot Log Finder'
        if (typeof Reflect.get(window, 'showDirectoryPicker') !== 'function') alert('This browser does not support directory opening.')
        void fetch(base + 'board_types.txt', { signal: controller.signal }).then(response => response.text()).then(text => {
            if (controller.signal.aborted) return
            for (const line of text.match(/[^\r\n]+/g) ?? []) {
                const match = line.match(/(^[-\w]+)\s+(\d+)/)
                if (match) boards.current[match[2]!] = match[1]!.replace(/^TARGET_HW_/, '').replace(/^EXT_HW_/, '').replace(/^AP_HW_/, '')
            }
        }).catch(error => { if (!controller.signal.aborted) onError(error) })
        return () => { controller.abort(); reading.current?.abort(); selection.current++; document.title = 'ArduPilot Log Finder' }
    }, [base, onError])
    /** Count and parse in traversal order; suppress completion after replacement or unmount. */
    async function load(handle: DirectoryHandle | undefined, generation: number): Promise<void> {
        if (!handle || lifetime.current!.signal.aborted) return
        reading.current?.abort()
        const controller = new AbortController(); reading.current = controller
        const signal = controller.signal
        setGroups([]); setProgress({ value: 0, max: 0 })
        document.title = 'Logs in: ' + handle.name + '/'
        const constructor = await parserConstructor(base)
        if (signal.aborted || generation !== selection.current) return
        setParser(() => constructor)
        let count = 0
        for await (const _file of directoryFiles(handle, signal)) count++
        if (signal.aborted || generation !== selection.current) return
        setProgress({ value: 0, max: count })
        const logs: LogEntry[] = []; let value = 0
        for await (const { file, path } of directoryFiles(handle, signal)) {
            if (signal.aborted || generation !== selection.current) return
            setProgress({ value: ++value, max: count })
            const bytes = await readFile(file, signal).catch(error => { if (signal.aborted) return null; throw error })
            if (bytes === null) return
            if (signal.aborted || generation !== selection.current) return
            const info = loadLog(bytes, constructor, vendors().luxon, boards.current)
            if (info) logs.push({ info: { ...info, name: file.name, rel_path: path }, fileHandle: file })
        }
        if (signal.aborted || generation !== selection.current) return
        setGroups(groupLogs(logs)); setProgress(null)
    }
    /** Preserve capability alerts and cancellation: old tables remain but Reload becomes disabled. */
    async function choose(): Promise<void> {
        const picker = Reflect.get(window, 'showDirectoryPicker') as (() => Promise<DirectoryHandle>) | undefined
        if (typeof picker !== 'function') { alert('This browser does not support directory opening.'); return }
        const generation = ++selection.current
        reading.current?.abort()
        const handle = await picker.call(window).catch(() => undefined)
        if (lifetime.current?.signal.aborted || generation !== selection.current) return
        setDirectory(handle)
        await load(handle, generation)
    }
    return <>
        <table style={{ width: 1200 }}><tbody><tr><td><a href="https://ardupilot.org"><img src={base + 'images/ArduPilot.png'} /></a></td><td>
            <a href="https://github.com/ArduPilot/WebTools"><img src={base + 'images/github-mark.png'} style={{ width: 60 }} /></a><br />
            <a href="https://github.com/ArduPilot/WebTools"><img src={base + 'images/GitHub_Logo.png'} style={{ width: 60 }} /></a>
        </td></tr></tbody></table>
        <h1><a href="" style={{ color: '#000', textDecoration: 'none' }}>ArduPilot Log Finder</a></h1>
        <table><tbody><tr><td><fieldset id="param_diff_ignore" style={{ width: 1000 }}><legend>Ignore parameter changes <img src={base + 'images/question-circle.svg'} style={{ width: '1em', verticalAlign: 'bottom' }} title="Ignore parameter changes for the selected items when doing a parameter compare. These parameters are expected to change each boot" /></legend>
            {ignoreRules.map((rule, index) => <span key={rule.name}>{index > 0 ? ', ' : ''}<input id={'param_diff_ignore' + index} type="checkbox" checked={ignored[index]} onChange={event => setIgnored(current => current.map((value, item) => item === index ? event.target.checked : value))} /><label htmlFor={'param_diff_ignore' + index}>{rule.name}</label></span>)}
        </fieldset></td></tr></tbody></table>
        <p><button id="get_dir" type="button" onClick={() => void loading.run(choose)}>Search directory</button>{' '}<button id="reload" type="button" disabled={!directory} onClick={() => void loading.run(() => load(directory, ++selection.current))}>Reload</button></p>
        <p hidden={!progress}><progress id="load" style={{ width: 1200, height: 30 }} value={progress?.value ?? 0} max={progress?.max ?? 0} /></p>
        <div id="tables">{parser && groups.map(group => <details open key={group.board} style={{ marginBottom: 15 }}><summary style={{ fontSize: '1.17em', fontWeight: 'bold' }}>{group.board}{group.commonPath ? ': ' + group.commonPath : ''}</summary><br /><BoardTable logs={group.logs} parser={parser} ignored={ignored} onError={onError} /></details>)}</div>
        <LoadingOverlay visible={loading.visible} />
    </>
}
