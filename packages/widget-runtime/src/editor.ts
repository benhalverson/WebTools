import type { Fields, Json } from './model.js'
import type { ComponentConstructor, FormComponents } from './forms.js'

/** Minimal Formio builder boundary, shared by dashboard and video widget editors. */
export interface WidgetBuilder {
    schema: Fields
    setForm(schema: Fields): Promise<unknown>
    on(event: 'updateComponent' | 'removeComponent', listener: () => void): void
    off(event: 'updateComponent' | 'removeComponent', listener: () => void): void
    destroy(): void
}
export interface BuilderFactory {
    builder(element: HTMLElement, schema: Fields, options: Fields): Promise<WidgetBuilder>
}
interface EditableComponent extends ComponentConstructor { editForm(): Fields }
export interface EditorComponents extends FormComponents {
    Components: FormComponents['Components'] & { components: Record<string, EditableComponent> }
}

/** The retained builder palette deliberately excludes remote storage and submit controls. */
export const widgetBuilderOptions: Fields = {
    noDefaultSubmitButton: true,
    builder: {
        advanced: false, premium: false, data: false,
        basic: { title: 'Inputs', default: true, components: {
            password: false, button: false, textarea: false,
            file: { title: 'file', key: 'file', icon: 'file', schema: { label: 'Upload', type: 'file', key: 'file', input: true, storage: 'base64' } },
        } },
        layout: { default: true, components: { content: false, well: false } },
    },
}

/** Narrow schema nodes while retaining arbitrary saved JSON fields. */
function object(value: Json | undefined): value is Fields {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read only Formio's component-tree children, as in the original builder. */
function children(value: Fields): Fields[] {
    return Array.isArray(value.components) ? value.components.filter(object) : []
}

/** Remove disallowed options recursively without changing unrelated schema data. */
function removeKeys(schema: Fields, keys: readonly string[]): void {
    if (!Array.isArray(schema.components)) return
    schema.components = children(schema).filter(item => !keys.includes(String(item.key)))
    for (const child of children(schema)) removeKeys(child, keys)
}

const configured = new WeakSet<object>()

/** Configure the existing shared editor palette once per Formio instance.
 * Call after registerWidgetFields; no consumer-owned page scripts are evaluated.
 */
export function registerWidgetEditor(formio: EditorComponents): void {
    if (configured.has(formio)) return
    const components = formio.Components.components
    const color = components.color
    if (!color) throw new Error('Missing color component')
    Object.defineProperty(color, 'builderInfo', { configurable: true, get: () => ({ title: 'Color picker', icon: 'palette', group: 'basic', documentation: '/userguide/#textfield', weight: 0, schema: color.schema() }) })
    const display = ['label', 'description', 'tooltip']
    const rules: Record<string, Record<string, string[]>> = {
        textfield: { display, data: ['defaultValue'], api: ['key'] },
        number: { display, data: ['defaultValue'], api: ['key'] },
        checkbox: { display, data: ['defaultValue'], api: ['key'] },
        selectboxes: { display, data: ['defaultValue', 'values'], api: ['key'] },
        select: { display, data: ['defaultValue', 'data.values'], api: ['key'] },
        file: { display, data: ['multiple'], api: ['key'] },
        radio: { display, data: ['defaultValue', 'values'], api: ['key'] },
        color: { display, data: ['defaultValue'], api: ['key'] },
        htmlelement: { display: ['label', 'tag', 'content'], api: ['key'] },
        columns: { display: ['label', 'columns', 'tooltip'], api: ['key'] },
        fieldset: { display: ['legend', 'tooltip'], api: ['key'] },
        panel: { display: ['title', 'tooltip'], api: ['key'] },
        table: { display: ['label', 'numRows', 'numCols'], api: ['key'] },
        tabs: { display: ['label', 'components'], api: ['key'] },
    }
    // Capture all definitions before modifying their base classes.
    const schemas = Object.fromEntries(Object.keys(rules).map(name => [name, components[name]?.editForm()]))
    for (const [name, whitelist] of Object.entries(rules)) {
        const component = components[name], schema = schemas[name]
        if (!component || !schema) continue
        restrictWidgetEditor(component, schema, whitelist, name === 'selectboxes' || name === 'radio' ? ['shortcut'] : [])
    }
    configured.add(formio)
}

/** Restrict one private component schema to the controls supported by its consumer. */
export function restrictWidgetEditor(component: EditableComponent, schema: Fields, whitelist: Record<string, readonly string[]>, remove: readonly string[] = []): void {
    const tabs = children(schema)[0]
    if (tabs) {
        tabs.components = children(tabs).filter(tab => Object.hasOwn(whitelist, String(tab.key)))
        for (const tab of children(tabs)) tab.components = children(tab).filter(item => whitelist[String(tab.key)]?.includes(String(item.key)))
    }
    removeKeys(schema, remove)
    /** Return the retained restricted component settings to Formio. */
    component.editForm = () => schema
}
