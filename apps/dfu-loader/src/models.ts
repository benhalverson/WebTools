/** The structural WebUSB surface consumed by the unchanged vendor library. */
export interface UsbDevice {
    vendorId: number
    productId: number
    productName?: string
    manufacturerName?: string
    serialNumber?: string
    open(): Promise<void>
    close(): Promise<void>
    selectConfiguration(value: number): Promise<void>
}
export interface Usb extends EventTarget {
    requestDevice(options: { filters: ({ serialNumber: string } | { vendorId: number })[] }): Promise<UsbDevice>
}
export interface Settings {
    configuration: { configurationValue: number }
    interface: { interfaceNumber: number }
    alternate: { interfaceProtocol: number; alternateSetting: number }
    name: string | null
}
export interface Segment { start: number; end: number; readable: boolean; erasable: boolean; writable: boolean }
export interface Properties {
    WillDetach: boolean; ManifestationTolerant: boolean; CanUpload: boolean; CanDnload: boolean
    TransferSize: number; DetachTimeOut: number; DFUVersion: number
}
export interface DfuDevice {
    device_: UsbDevice
    settings: Settings
    disconnected?: boolean
    properties?: Properties
    memoryInfo?: { name: string; segments: Segment[] } | null
    startAddress: number
    open(): Promise<void>
    close(): Promise<void>
    readInterfaceNames(): Promise<Record<number, Record<number, Record<number, string>>>>
    readConfigurationDescriptor(index: number): Promise<DataView>
    getFirstWritableSegment(): Segment | null
    getMaxReadSize(address: number): number
    getSegment(address: number): Segment | null
    getStatus(): Promise<{ state: number }>
    clearStatus(): Promise<void>
    do_download(size: number, data: ArrayBuffer | Uint8Array, tolerant: boolean): Promise<void>
    logDebug(message: unknown): void
    logInfo(message: unknown): void
    logWarning(message: unknown): void
    logError(message: unknown): void
    logProgress(done: number, total?: number): void
}
export interface Descriptor {
    bDescriptorType: number; bcdDFUVersion?: number; bmAttributes: number; wTransferSize: number; wDetachTimeOut: number
}
export interface DfuVendor {
    Device: new (device: UsbDevice, settings: Settings) => DfuDevice
    dfuERROR: number
    findDeviceDfuInterfaces(device: UsbDevice): Settings[]
    findAllDfuInterfaces(): Promise<DfuDevice[]>
    parseConfigurationDescriptor(data: DataView): { bConfigurationValue: number; descriptors: Descriptor[] }
}
export interface DfuseVendor { Device: DfuVendor['Device'] }
export type Log = { kind: 'info' | 'warning' | 'error'; message: string } | { kind: 'progress'; done: number; total?: number | undefined }
export interface Snapshot {
    status: string; usbInfo: string; dfuInfo: string; connected: boolean; busy: boolean; writable: boolean
    address: string; uploadSize: number | null; maxRead: number | null; memory: boolean; logs: Log[]
}
declare global {
    interface Window { dfu: DfuVendor; dfuse: DfuseVendor }
    interface Navigator { usb?: Usb }
}
