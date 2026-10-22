import type { editor } from 'monaco-editor'
import { loadCodeEditor } from './code-editor'
import { useEffect, useRef, useState } from 'react'
import { WidgetRuntime, widgetBuilderOptions, type WidgetHost, type WidgetBuilder } from '@webtools/widget-runtime'

/** Own a disposable preview and form builder; cancelling leaves the original widget intact. */
export function SourceEditor({ widget, close, failure }: { widget: WidgetHost; close(): void; failure(error: unknown): void }) {
    const codeHost = useRef<HTMLDivElement>(null)
    const code = useRef<editor.IStandaloneCodeEditor | undefined>(undefined)
    const preview = useRef<HTMLDivElement>(null)
    const builderHost = useRef<HTMLDivElement>(null)
    const formHost = useRef<HTMLDivElement>(null)
    const previewRuntime = useRef<WidgetRuntime | undefined>(undefined)
    const [previewEditing, setPreviewEditing] = useState(false)
    const [previewSettings, setPreviewSettings] = useState(false)
    const draft = useRef<WidgetHost | undefined>(undefined)
    const builder = useRef<WidgetBuilder | undefined>(undefined)
    const pending = useRef(Promise.resolve())
    const source = useRef(widget.getText() ?? '')
    const [tab, setTab] = useState<'script' | 'form'>('script')
    const [ready, setReady] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!preview.current || !builderHost.current) return
        let active = true
        let editorInstance: editor.IStandaloneCodeEditor | undefined
        let editorModel: editor.ITextModel | undefined
        let editorListener: { dispose(): void } | undefined
        let formBuilder: WidgetBuilder | undefined
        const model = widget.snapshot()
        model.x = 0; model.y = 0
        if (Number(model.w) > 5 || Number(model.h) > 5) { model.w = null; model.h = null }
        const owner = new WidgetRuntime(preview.current, {
            ...widget.owner.dependencies,
            onEdit: host => { host.formElement.hidden = false; setPreviewSettings(true) },
            onError: error => { if (active) failure(error) },
        }, { header: { version: 1 }, grid: { rows: 5, columns: 5, color: '#fff' }, widgets: { 0: model } })
        previewRuntime.current = owner
        /** Serialize builder changes so older asynchronous setForm calls cannot win. */
        function update(): void {
            const schema = structuredClone(formBuilder?.schema ?? {})
            pending.current = pending.current.then(async () => {
                if (active) await draft.current?.setFormDefinition(schema)
            }).catch(error => { if (active) failure(error) })
        }
        /** Wait for both preview form and builder before exposing editable controls. */
        async function initialize(): Promise<void> {
            await owner.ready
            if (!active || !builderHost.current) return
            const host = owner.getWidgets()[0]
            if (!host) throw new Error('Widget preview could not fit')
            draft.current = host
            // This disposable preview form uses the React panel, not the runtime overlay scrollport.
            host.formElement.style.cssText = ''
            formHost.current?.append(host.formElement)
            host.formElement.hidden = false
            formBuilder = await window.Formio.builder(builderHost.current, widget.getFormDefinition(), structuredClone(widgetBuilderOptions))
            if (!active) { formBuilder.destroy(true); return }
            builder.current = formBuilder
            formBuilder.on('updateComponent', update)
            formBuilder.on('removeComponent', update)
            const monaco = await loadCodeEditor()
            if (!active || !codeHost.current) return
            editorModel = monaco.editor.createModel(source.current, widget.model.type === 'WidgetCustomHTML' ? 'html' : 'javascript')
            editorInstance = monaco.editor.create(codeHost.current, { model: editorModel, theme: 'vs-dark', automaticLayout: true, ariaLabel: 'Widget source' })
            code.current = editorInstance
            editorListener = editorInstance.onDidChangeModelContent(() => {
                source.current = editorInstance?.getValue() ?? ''
                draft.current?.setText(source.current)
            })
            setReady(true)
        }
        void initialize().catch(error => { if (active) failure(error) })
        return () => {
            active = false
            editorListener?.dispose()
            editorInstance?.dispose()
            editorModel?.dispose()
            code.current = undefined
            formBuilder?.off('updateComponent', update)
            formBuilder?.off('removeComponent', update)
            formBuilder?.destroy(true)
            builder.current = undefined
            draft.current = undefined
            previewRuntime.current = undefined
            owner.destroy()
        }
    }, [widget, failure])

    /** Toggle preview geometry without closing its independently owned configuration panel. */
    function editPreview(enabled: boolean): void {
        setPreviewEditing(enabled)
        previewRuntime.current?.setEditing(enabled)
        if (previewSettings && draft.current) draft.current.formElement.hidden = false
    }

    /** Reopen configuration after preview locking has hidden the live Formio element. */
    function togglePreviewSettings(): void {
        if (draft.current) draft.current.formElement.hidden = false
        setPreviewSettings(current => !current)
    }

    /** Apply the same source/schema pair as legacy only after pending preview edits finish. */
    async function apply(): Promise<void> {
        setSaving(true)
        try {
            await pending.current
            if (!builder.current) return
            await widget.setFormDefinition(structuredClone(builder.current.schema))
            widget.setText(source.current)
            close()
        } catch (error) { failure(error); setSaving(false) }
    }

    return <section className="source-editor" role="dialog" aria-modal="true" aria-label="Widget editor">
        <header><strong>Widget Editor</strong><label><input type="checkbox" checked={previewEditing} onChange={event => editPreview(event.target.checked)} />Edit preview</label><button onClick={togglePreviewSettings}>Preview settings</button><button onClick={() => setTab('script')}>Script</button><button onClick={() => setTab('form')}>Form</button><button disabled={!ready || saving} onClick={() => void apply()}>Apply and close</button><button disabled={saving} onClick={close}>Cancel</button></header>
        <div className="source-editor-columns"><div className="source-editor-input">
            <div className="code-editor" ref={codeHost} hidden={tab !== 'script'} />
            <div ref={builderHost} hidden={tab !== 'form'} />
        </div><div className="source-editor-preview"><div className="preview-grid"><div className="grid-stack" ref={preview} /></div><div className="preview-options" hidden={!previewSettings}><button onClick={() => setPreviewSettings(false)} aria-label="Close preview settings">×</button><div ref={formHost} /></div></div></div>
    </section>
}
