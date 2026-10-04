import type { Message } from '@webtools/mavlink'

/** Dynamic Formio data is JSON, including user-defined component keys. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface Fields { [key: string]: Json }
export type WidgetType = 'WidgetMenu' | 'WidgetSandBox' | 'WidgetCustomHTML' | 'WidgetSubGrid'
export interface WidgetOptions {
    form?: Fields
    form_content?: Fields
    about?: Fields
    sandbox?: string
    custom_HTML?: string
    widgets?: WidgetMap
}
/** GridStack's DOM serializer returns strings or null, even for numeric positions. */
export interface WidgetModel {
    x: string | number | null
    y: string | number | null
    w: string | number | null
    h: string | number | null
    type: WidgetType
    options: WidgetOptions
}
export interface WidgetMap { [key: string]: WidgetModel }
export interface Layout {
    header: { version: number }
    grid: { columns: number | string; rows: number | string; color: string }
    widgets: WidgetMap
}
/** Established iframe protocols; target origin and channel name are retained. */
export type WidgetMessage = { options: Fields; script?: string }
export interface TelemetryMessage { MAVLink: Message }
export const telemetryChannel = 'MAVLinkMSG'
export const widgetSandbox = 'allow-scripts allow-same-origin'

/** Parse without normalizing keys, strings, dynamic fields, or executable widget content. */
export function parseLayout(text: string): Layout {
    const value: unknown = JSON.parse(text)
    assertLayout(value)
    return value
}

/** Check the structural boundary before allocating browser resources; unknown fields survive. */
export function assertLayout(value: unknown): asserts value is Layout {
    if (!record(value) || !record(value.header) || typeof value.header.version !== 'number' ||
        !record(value.grid) || !dimension(value.grid.columns) || !dimension(value.grid.rows) ||
        typeof value.grid.color !== 'string') throw new TypeError('Invalid layout header or grid')
    assertWidgets(value.widgets)
}

/** Validate nested widgets recursively while leaving arbitrary Formio schemas intact. */
function assertWidgets(value: unknown): asserts value is WidgetMap {
    if (!record(value)) throw new TypeError('Invalid widgets')
    for (const widget of Object.values(value)) {
        if (!record(widget) || !['WidgetMenu', 'WidgetSubGrid', 'WidgetCustomHTML', 'WidgetSandBox'].includes(String(widget.type)) ||
            !record(widget.options)) throw new TypeError('Unknown or invalid widget')
        for (const key of ['x', 'y', 'w', 'h']) {
            if (widget[key] !== null && typeof widget[key] !== 'string' && typeof widget[key] !== 'number') throw new TypeError('Invalid widget position')
        }
        for (const key of ['form', 'form_content', 'about']) {
            if (widget.options[key] !== undefined && !record(widget.options[key])) throw new TypeError(`Invalid ${key}`)
        }
        for (const key of ['sandbox', 'custom_HTML']) {
            if (widget.options[key] !== undefined && typeof widget.options[key] !== 'string') throw new TypeError(`Invalid ${key}`)
        }
        if (widget.options.widgets !== undefined) assertWidgets(widget.options.widgets)
    }
}

/** Accept the same integer-string dimensions consumed by legacy parseInt. */
function dimension(value: unknown): boolean {
    return (typeof value === 'number' || typeof value === 'string') && Number.parseInt(String(value)) > 0
}

/** Narrow external objects without asserting an unchecked application model. */
function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Match downloaded legacy JSON indentation and trailing-newline behavior exactly. */
export function serializeLayout(layout: Layout): string {
    return JSON.stringify(layout, null, 2)
}
