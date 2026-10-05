import { parseLayout, parseWidget, type Layout, type WidgetMap, type WidgetModel, type WidgetType } from '@webtools/widget-runtime'

const types: Record<string, WidgetType> = { WidgetSandBoxVideoOverlay: 'WidgetSandBox', WidgetSubGridVideoOverlay: 'WidgetSubGrid', WidgetCustomHTMLVideoOverlay: 'WidgetCustomHTML' }

/** Translate only widget type tags recursively, retaining every saved option and position. */
function translate(value: unknown, outward = false): unknown {
    if (Array.isArray(value)) return value.map(item => translate(item, outward))
    if (!value || typeof value !== 'object') return value
    const result: Record<string, unknown> = { ...value }
    if (typeof result.type === 'string') {
        const type = outward ? Object.entries(types).find(([, shared]) => shared === result.type)?.[0] : types[result.type]
        if (type) { result.type = type; if (!outward && result.options == null) result.options = {} }
    }
    if (result.widgets && typeof result.widgets === 'object') result.widgets = Object.fromEntries(Object.entries(result.widgets).map(([key, widget]) => [key, translate(widget, outward)]))
    if (result.options) {
        result.options = translate(result.options, outward)
        if (!outward && result.options && typeof result.options === 'object') {
            const options: Record<string, unknown> = { ...result.options }
            for (const key of ['sandbox', 'custom_HTML']) if (options[key] === null) delete options[key]
            result.options = options
        }
    }
    return result
}

/** Reject another tool's layout before allocating shared widgets. */
function document(text: string): Record<string, unknown> {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || !('header' in value) || !value.header || typeof value.header !== 'object' || !('tool' in value.header) || value.header.tool !== 'videoOverlay') throw new TypeError('Layout not for this tool!')
    return { ...value }
}

/** Restore the version-one VideoOverlay layout without rewriting custom script source. */
export function parseVideoLayout(text: string): Layout {
    return parseLayout(JSON.stringify(translate(document(text))))
}

/** Restore a standalone widget through the same recursive type adapter. */
export function parseVideoWidget(text: string): WidgetModel {
    const value = document(text)
    value.widget = translate(value.widget)
    return parseWidget(JSON.stringify(value)).widget
}

/** Restore the retained palette, which deliberately has no layout header. */
export function parseVideoPalette(text: string): WidgetMap {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || !('widgets' in value) || !value.widgets || typeof value.widgets !== 'object' || Array.isArray(value.widgets)) throw new TypeError('Invalid palette')
    return parseLayout(JSON.stringify({ header: { version: 1 }, grid: { rows: 1, columns: 7, color: '' }, widgets: Object.fromEntries(Object.entries(value.widgets).map(([key, widget]) => [key, translate(widget)])) })).widgets
}

/** Emit the legacy tool header, field order, recursive tags and exact two-space indentation. */
export function serializeVideoLayout(layout: Layout): string {
    return JSON.stringify({ header: { tool: 'videoOverlay', version: 1 }, grid: layout.grid, widgets: Object.fromEntries(Object.entries(layout.widgets).map(([key, widget]) => [key, translate(widget, true)])) }, null, 2)
}

/** Emit standalone widget downloads using the established VideoOverlay format. */
export function serializeVideoWidget(widget: WidgetModel): string {
    return JSON.stringify({ header: { tool: 'videoOverlay', version: 1 }, widget: translate(widget, true) }, null, 2)
}
