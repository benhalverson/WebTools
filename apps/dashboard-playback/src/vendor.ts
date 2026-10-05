import type { GridStack } from 'gridstack'
import type { FormFactory, FormComponents } from '@webtools/widget-runtime'

declare global {
    interface Window {
        GridStack: typeof GridStack
        Formio: FormFactory & FormComponents
    }
}
