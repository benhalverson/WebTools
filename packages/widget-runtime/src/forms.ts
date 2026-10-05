import type { Fields } from './model.js'

/** A host supplies its existing Formio instance, keeping library loading outside the runtime. */
export interface WidgetForm {
    form: Fields
    submission: { data: Fields }
    setForm(schema: Fields): Promise<unknown>
    setSubmission(submission: { data: Fields }): Promise<unknown>
    checkValidity(data: Fields): boolean
    on(event: 'change', listener: (event: { changed?: unknown }) => void): void
    off(event: 'change', listener: (event: { changed?: unknown }) => void): void
    /** Release the form and remove its retained global registry entry when requested. */
    destroy(deleteFromGlobal?: boolean): void
}
export interface FormFactory {
    createForm(element: HTMLElement, schema: Fields): Promise<WidgetForm>
}

/** Metadata-only boundary works with the typed MAVLink map and lightweight test catalogs. */
export interface MessageCatalog {
    [id: string]: { type: new () => { _id: number; _name: string; fieldnames: string[] } }
}

/** Produce the legacy alphabetically sorted MAVLink message selector choices. */
export function messageChoices(catalog: MessageCatalog): { value: string; label: string }[] {
    return Object.values(catalog).map(({ type }) => {
        const message = new type()
        return { value: String(message._id), label: `${message._name} (${message._id})` }
    }).sort((a, b) => a.label.localeCompare(b.label))
}

/** Resolve dynamic field names with the legacy unknown-message sentinel. */
export function messageFields(catalog: MessageCatalog, id: string): string[] {
    for (const { type } of Object.values(catalog)) {
        const message = new type()
        if (String(message._id) === id) return message.fieldnames
    }
    return ['Unknown message']
}

export interface FormComponent {
    setValue(value: unknown): unknown
    renderElement(value: unknown, index: number): string
}
export interface ComponentConstructor {
    new (...args: never[]): FormComponent
    schema(...extend: Fields[]): Fields
}
export interface FormComponents {
    Components: { components: { select: ComponentConstructor; input: ComponentConstructor } }
    use(plugin: { components: Record<string, ComponentConstructor> }): void
}

/** Register the retained custom input types on a consumer's Formio runtime, once before mounting.
 * Saved data.custom expressions continue to run unchanged against the MAVLink browser globals.
 */
export function registerWidgetFields(formio: FormComponents, catalog: MessageCatalog): void {
    const Select = formio.Components.components.select
    const Input = formio.Components.components.input
    class Mavlinkmsg extends Select {
        /** Supply legacy defaults while letting saved schema properties override them. */
        static schema(...extend: Fields[]): Fields {
            return Select.schema({ type: 'mavlinkmsg', label: 'mavlinkmsg', key: 'mavlinkmsg', data: { values: messageChoices(catalog) } }, ...extend)
        }
    }
    class Mavlinkfield extends Select {
        /** Keep custom dynamic expressions in the saved schema rather than rewriting user code. */
        static schema(...extend: Fields[]): Fields {
            return Select.schema({ type: 'mavlinkfield', label: 'mavlinkfield', key: 'mavlinkfield', dataSrc: 'custom', data: {
                custom: `if (component.MAVLinkMsgSelect == undefined) { return ["Invalid MAVLink message item key"] }
const id = submission.data[component.MAVLinkMsgSelect]
values = ["Unknown message"]
for (const msg_map of Object.values(mavlink20.map)) {
    const msg = new msg_map.type
    if (String(msg._id) == id) { values = msg.fieldnames; break }
}`,
            } }, ...extend)
        }
    }
    class Color extends Input {
        /** Preserve the existing color component defaults. */
        static schema(...extend: Fields[]): Fields {
            return Input.schema({ type: 'color', label: 'color', key: 'color', inputType: 'color', mask: false, data: '#000000' }, ...extend)
        }
        /** Retain the legacy empty color value fallback. */
        setValue(value: unknown): unknown { return super.setValue(value === '' ? '#000000' : value) }
        /** Keep empty color markup valid without changing other rendered attributes. */
        renderElement(value: unknown, index: number): string { return super.renderElement(value, index).replace('value=""', 'value="#000000"') }
    }
    formio.use({ components: { mavlinkmsg: Mavlinkmsg, mavlinkfield: Mavlinkfield, color: Color } })
}
