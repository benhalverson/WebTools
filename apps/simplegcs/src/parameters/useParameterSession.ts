import { useEffect, useState } from 'react'
import type { ParameterSession, ParameterSessionFactory } from './session.ts'

/** Acquire a model per connected identity and invalidate it before releasing its transport. */
export function useParameterSession(factory: ParameterSessionFactory, identity: string | null): ParameterSession | null {
    const [current, setCurrent] = useState<{ identity: string; factory: ParameterSessionFactory; session: ParameterSession } | null>(null)
    useEffect(() => {
        if (identity === null) { setCurrent(null); return }
        const session = factory(identity)
        setCurrent({ identity, factory, session })
        return () => session.dispose()
    }, [factory, identity])
    return current?.identity === identity && current.factory === factory ? current.session : null
}
