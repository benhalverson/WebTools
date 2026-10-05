/** Narrow APIs consumed from the repository's pinned browser vendor bundles. */
export interface DateValue { toISO(): string | null }
export interface Luxon {
    DateTime: { fromJSDate(date: Date | undefined): DateValue }
    Duration: { fromMillis(value: number): { rescale(): { toHuman(options: { listStyle: string; unitDisplay: string }): string } } }
}
export interface Tooltip { props: { content: unknown }; setContent(content: HTMLElement): void; destroy(): void }
export interface TooltipOptions {
    content?: string | HTMLElement; placement?: string; interactive?: boolean; appendTo?: () => HTMLElement;
    maxWidth?: string; delay?: [number, number]; onShow?: (instance: Tooltip) => void
}
export type Tippy = (element: HTMLElement, options: TooltipOptions) => Tooltip
export interface MapInstance { fitBounds(bounds: unknown): void; remove(): void }
export interface Leaflet {
    map(element: HTMLElement): MapInstance
    tileLayer(url: string, options: { attribution: string }): { addTo(map: MapInstance): void }
    polyline(points: [number, number][]): { addTo(map: MapInstance): { getBounds(): unknown } }
}
/** Read one explicitly typed vendor boundary; local assets supply these globals. */
export function vendors(): { luxon: Luxon; tippy: Tippy; leaflet: Leaflet | undefined } {
    return { luxon: Reflect.get(window, 'luxon') as Luxon, tippy: Reflect.get(window, 'tippy') as Tippy, leaflet: Reflect.get(window, 'L') as Leaflet | undefined }
}
