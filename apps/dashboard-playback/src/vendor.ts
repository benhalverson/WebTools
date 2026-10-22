import type { GridStack } from 'gridstack'
import type { FormFactory, EditorComponents, BuilderFactory } from '@webtools/widget-runtime'

declare global {
    interface Window {
        GridStack: typeof GridStack
        Formio: FormFactory & EditorComponents & BuilderFactory
    }
}
