import { useCallback, useEffect, useRef, useState } from 'react'
import { Connection, type LinkState, type SocketFactory } from './connection.ts'
import { ComponentIdentity } from './identity.ts'
import { readDraft, submitDraft, saveConnection, type StoragePair, type ConnectionDraft, type DeploymentConfig } from './settings.ts'
import { emptyTelemetry } from './telemetry.ts'
/** Bind controller/lease lifetime to React; drafts stay independent from submitted reconnect settings. */
export function useConnection(factory: SocketFactory, storage: StoragePair, locks: LockManager | undefined, config: DeploymentConfig) {
    const [connection, setConnection] = useState<Connection | null>(null)
    const [draft, setDraft] = useState(() => readDraft(storage, config))
    const [link, setLink] = useState<LinkState>({ telemetry: emptyTelemetry(), status: 'Disconnected', stale: true, phase: 'disconnected', lagSeconds: 0, error: '', mapIdentity: null })
    const [busy, setBusy] = useState(false), [error, setError] = useState<{ message: string } | null>(null)
    /** Publish a distinct error event, including repeated identical failures. */
    const reportError = useCallback((message: string) => setError({ message }), [])
    const owner = useRef<{ connection: Connection; identity: ComponentIdentity; active: boolean; attempt: number } | null>(null)
    useEffect(() => {
        const current = { connection: new Connection(factory, state => { setLink(state); if (state.error) reportError(state.error) }), identity: new ComponentIdentity(locks), active: true, attempt: 0 }
        owner.current = current
        setConnection(current.connection)
        const initial = readDraft(storage, config)
        void current.identity.claim(Number(initial.componentId)).then(componentId => {
            if (!current.active || componentId === null || current.attempt !== 0) return
            setDraft(previous => ({ ...previous, componentId: String(componentId) }))
            if (storage.local.getItem('gcs.url')) current.connection.connect(submitDraft({ ...initial, componentId: String(componentId) }))
        }).catch(reason => { if (current.active) reportError(reason instanceof Error ? reason.message : String(reason)) })
        return () => { current.active = false; current.identity.dispose(); current.connection.dispose(); if (owner.current === current) owner.current = null }
    }, [factory, storage, locks, config, reportError])
    /** Submit a captured draft; ignore a reservation completed after disconnect/unmount. */
    const connect = useCallback(async (): Promise<boolean> => {
        const current = owner.current
        if (!current) return false
        const attempt = ++current.attempt
        setBusy(true); setError(null)
        try {
            const settings = submitDraft(draft), componentId = await current.identity.claim(settings.componentId)
            if (!current.active || attempt !== current.attempt || componentId === null) return false
            settings.componentId = componentId; setDraft(previous => ({ ...previous, componentId: String(componentId) }))
            if (!current.connection.connect(settings)) return false
            saveConnection(storage, settings); return true
        } catch (reason) { if (current.active && attempt === current.attempt) reportError(reason instanceof Error ? reason.message : String(reason)); return false }
        finally { if (current.active && attempt === current.attempt) setBusy(false) }
    }, [draft, storage, reportError])
    /** Stop transport/retry work immediately while retaining this tab's reserved identity. */
    const disconnect = useCallback(() => { const current = owner.current; if (!current) return; current.attempt++; current.identity.cancel(); current.connection.disconnect(); setBusy(false) }, [])
    /** Edit one field without recreating the connection controller or replacing focused nodes. */
    const edit = useCallback(<K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]) => { setDraft(previous => ({ ...previous, [key]: value })) }, [])
    return { connection, draft, link, busy, error, connect, disconnect, edit }
}
