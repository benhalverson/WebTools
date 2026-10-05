import { registerWidgetEditor, restrictWidgetEditor, type EditorComponents, type Fields, type Json } from '@webtools/widget-runtime'

/** Narrow the vendor's component tree without discarding unrelated saved JSON. */
function object(value: Json): value is Fields { return typeof value === 'object' && value !== null && !Array.isArray(value) }

/** Read Formio's component children for the dashboard-specific MAVLink data selector. */
function children(value: Fields): Fields[] { return Array.isArray(value.components) ? value.components.filter(object) : [] }

/** Add dashboard MAVLink controls before applying the common widget editor restrictions. */
export function registerDashboardEditor(formio: EditorComponents): void {
    const components = formio.Components.components
    for (const [name, title, icon] of [['mavlinkmsg', 'MAVLink message', 'envelope'], ['mavlinkfield', 'MAVLink field', 'envelope']] as const) {
        const component = components[name]
        if (!component) throw new Error(`Missing widget component: ${name}`)
        Object.defineProperty(component, 'builderInfo', { configurable: true, get: () => ({ title, icon, group: 'basic', documentation: '/userguide/#textfield', weight: 0, schema: component.schema() }) })
    }
    const field = components.mavlinkfield
    if (!field) throw new Error('Missing MAVLink field component')
    const definition = field.editForm()
    const dataTab = children(children(definition)[0] ?? {}).find(tab => tab.key === 'data')
    if (dataTab) dataTab.components = [{
        label: 'MAVLink message input key', widget: 'choicesjs',
        description: 'Key for a MAVLink message item, field options are populated from this item',
        tableView: true, dataSrc: 'custom', data: { custom: `values = []
function recursive_search(obj) {
    if (obj.type == "mavlinkmsg") values.push(obj.key)
    if (!("components" in obj)) return
    for (let comp of obj.components) recursive_search(comp)
}
recursive_search(instance.options.editForm)
if (values.length == 0) values = ["No MAVLink message items found"]` },
        validateWhenHidden: false, key: 'MAVLinkMsgSelect', type: 'select', input: true,
    }, ...children(dataTab)]
    /** Return this component's private edit schema, never the shared select schema. */
    field.editForm = () => definition
    const display = ['label', 'description', 'tooltip']
    const message = components.mavlinkmsg
    if (!message) throw new Error('Missing MAVLink message component')
    restrictWidgetEditor(message, message.editForm(), { display, data: ['defaultValue'], api: ['key'] })
    restrictWidgetEditor(field, definition, { display, data: ['defaultValue', 'MAVLinkMsgSelect'], api: ['key'] })
    registerWidgetEditor(formio)
}
