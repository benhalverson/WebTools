import type { DfuDevice, DfuVendor, Properties, Settings, UsbDevice } from './models.ts'
/** Recover missing interface strings with the original configuration-1 sequence. */
export async function fixInterfaceNames(vendor: DfuVendor, usb: UsbDevice, interfaces: Settings[]): Promise<void> {
    if (!interfaces.some(item => item.name == null)) return
    const first = interfaces[0]
    if (!first) return
    const temporary = new vendor.Device(usb, first)
    try {
        await temporary.device_.open()
        await temporary.device_.selectConfiguration(1)
        const mapping = await temporary.readInterfaceNames()
        for (const item of interfaces) {
            if (item.name === null) item.name = mapping[item.configuration.configurationValue]![item.interface.interfaceNumber]![item.alternate.alternateSetting]!
        }
    } finally { await temporary.close() }
}
/** Read the first functional descriptor from configuration index zero.
 * A rejected descriptor read is intentionally treated as absent by the legacy UI.
 */
export async function descriptorProperties(vendor: DfuVendor, device: DfuDevice): Promise<Properties | undefined> {
    let data: DataView
    try { data = await device.readConfigurationDescriptor(0) } catch { return undefined }
    const config = vendor.parseConfigurationDescriptor(data)
    if (config.bConfigurationValue !== device.settings.configuration.configurationValue) return undefined
    const desc = config.descriptors.find(item => item.bDescriptorType === 0x21 && Object.hasOwn(item, 'bcdDFUVersion'))
    if (!desc || desc.bcdDFUVersion === undefined) return undefined
    return { WillDetach: (desc.bmAttributes & 8) !== 0, ManifestationTolerant: (desc.bmAttributes & 4) !== 0,
        CanUpload: (desc.bmAttributes & 2) !== 0, CanDnload: (desc.bmAttributes & 1) !== 0,
        TransferSize: desc.wTransferSize, DetachTimeOut: desc.wDetachTimeOut, DFUVersion: desc.bcdDFUVersion }
}
