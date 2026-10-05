/** Install an explicit WebUSB mock before page scripts; never consult real USB. */
function installDfuMock(options = {}) {
    const trace = [];
    const listeners = new Set();
    const alternate = { interfaceClass: 254, interfaceSubclass: 1, interfaceProtocol: options.runtime ? 1 : 2,
        alternateSetting: 0, interfaceName: options.readonly ? '@Internal Flash /0x08000000/04*016Ka' : options.unreadable ? '@Internal Flash /0x08000000/04*016Kd' : '@Internal Flash /0x08000000/04*016Kg' };
    const intf = { interfaceNumber: 0, claimed: false, alternate, alternates: [alternate] };
    const configuration = { configurationValue: 1, interfaces: [intf] };
    let state = options.errorState ? 10 : 2;
    let opened = false;
    let cancel = !!options.cancel;
    let fail = !!options.fail;
    let held;
    let closeHeld;
    const usbDevice = {
        vendorId: 0x0483, productId: 0xdf11, productName: 'Mock DFU', manufacturerName: 'Mock', serialNumber: 'SERIAL',
        configurations: [configuration], configuration: null,
        /** Record open ownership without touching hardware. */
        async open() { trace.push(['open']); opened = true; },
        /** Close interrupts subsequent mocked transfers. */
        async close() { trace.push(['close']); if (options.holdClose) await new Promise(resolve => { closeHeld = resolve; }); opened = false; },
        /** Select the synthetic configuration. */
        async selectConfiguration(value) { trace.push(['configuration', value]); this.configuration = configuration; },
        /** Claim the synthetic interface. */
        async claimInterface(value) { trace.push(['claim', value]); intf.claimed = true; },
        /** Record alternate selection. */
        async selectAlternateInterface(index, value) { trace.push(['alternate', index, value]); },
        /** Serve real descriptor bytes and a minimal DFU status machine. */
        async controlTransferIn(setup, length) {
            trace.push(['in', setup, length]);
            if (!opened) throw new Error('Device disconnected');
            let bytes;
            if (setup.requestType === 'standard') {
                bytes = [9, 2, 27, 0, 1, 1, 0, 128, 50, 9, 4, 0, 0, 0, 254, 1, alternate.interfaceProtocol, 0,
                    9, 33, options.noDownload ? 6 : options.intolerant ? 3 : 7, 0, 0, 4, 0, options.dfuse ? 26 : 16, 1];
            } else if (setup.request === 3) bytes = [0, 0, 0, 0, state, 0];
            else bytes = [state];
            return { status: 'ok', data: new DataView(Uint8Array.from(bytes.slice(0, length)).buffer) };
        },
        /** Record exact outgoing bytes; optional gates model disconnect/error races. */
        async controlTransferOut(setup, data) {
            const bytes = data ? Array.from(new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength)) : [];
            trace.push(['out', setup, bytes]);
            if (options.hold && setup.request === 1) await new Promise(resolve => { held = resolve; });
            if (!opened) throw new Error('Device disconnected');
            if (fail) { fail = false; throw new Error('Mock transfer failure'); }
            if (setup.request === 4) state = 2;
            else if (setup.request === 1) state = bytes.length ? 5 : 7;
            return { status: 'ok', bytesWritten: bytes.length };
        },
    };
    const usb = {
        /** Track the exact legacy chooser filters. */
        async requestDevice(options) { trace.push(['request', options]); if (cancel) { cancel = false; throw new Error('No device selected.'); } return usbDevice; },
        /** Return only synthetic previously authorized devices. */
        async getDevices() { trace.push(['devices']); return options.noDevices ? [] : [usbDevice]; },
        /** Track disconnect listeners for mount/unmount assertions. */
        addEventListener(type, callback) { if (type === 'disconnect') listeners.add(callback); },
        /** Remove an owned listener. */
        removeEventListener(type, callback) { if (type === 'disconnect') listeners.delete(callback); },
    };
    Object.defineProperty(navigator, 'usb', { configurable: true, value: usb });
    globalThis.mockDfu = {
        trace, usbDevice,
        /** Emit a disconnect for this synthetic device. */
        disconnect() { opened = false; for (const callback of listeners) callback({ device: usbDevice }); },
        /** Release one intentionally suspended transfer. */
        release() { options.hold = false; held?.(); },
        /** Count owned global listeners. */
        listenerCount() { return listeners.size; },
        /** Release teardown to test a new React mount racing an old USB close. */
        releaseClose() { options.holdClose = false; closeHeld?.(); },
    };
}
if (typeof module !== 'undefined') module.exports = { installDfuMock };
