import type { DfuDevice } from './models.ts'
/** Preserve dfu-util's lowercase, minimum-width hexadecimal display. */
export function hex4(value: number): string { return value.toString(16).padStart(4, '0') }
/** Format the inclusive memory-map endpoints exactly as the legacy page. */
export function hexAddr8(value: number): string { return '0x' + value.toString(16).padStart(8, '0') }
/** Use binary units without rounding fractional values. */
export function niceSize(value: number): string {
    for (const [scale, suffix] of [[1073741824, 'GiB'], [1048576, 'MiB'], [1024, 'KiB']] as const) {
        if (value >= scale) return value / scale + suffix
    }
    return value + 'B'
}
/** Render the selected interface's legacy dfu-util summary. */
export function formatDFUSummary(device: DfuDevice): string {
    const { device_: usb, settings } = device
    const protocol = settings.alternate.interfaceProtocol
    const mode = protocol === 1 ? 'Runtime' : protocol === 2 ? 'DFU' : 'Unknown'
    return `${mode}: [${hex4(usb.vendorId)}:${hex4(usb.productId)}] cfg=${settings.configuration.configurationValue}, intf=${settings.interface.interfaceNumber}, alt=${settings.alternate.alternateSetting}, name="${usb.productName}" serial="${usb.serialNumber}"`
}
/** Preserve the Chromium trailing-slash workaround only for serial landing URLs. */
export function landingSerial(search: string): string | null {
    let serial = new URLSearchParams(search).get('serial')
    if (serial !== null && search.endsWith('/') && serial.endsWith('/')) serial = serial.slice(0, -1)
    return serial
}
/** Convert Intel HEX using the legacy 512KiB, zero-filled, 16-bit record offsets.
 * Extended linear addresses and checksums intentionally do not affect output.
 */
export function parseIntelHex(buffer: ArrayBuffer): Uint8Array {
    const data = new Uint8Array(1024 * 512)
    let length = 0
    for (const line of new TextDecoder('utf-8').decode(buffer).trim().split(/\r?\n/)) {
        if (!line.startsWith(':')) continue
        const size = parseInt(line.slice(1, 3), 16)
        const address = parseInt(line.slice(3, 7), 16)
        const type = parseInt(line.slice(7, 9), 16)
        const bytes = line.slice(9, 9 + size * 2)
        if (type === 0) {
            for (let i = 0; i < size; i++) data[address + i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16)
            length = Math.max(length, address + size)
        }
    }
    return data.slice(0, length)
}
