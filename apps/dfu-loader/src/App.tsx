import { useEffect, useState, useSyncExternalStore } from 'react'
import { FileInput } from '@webtools/react-workflows'
import { DfuController } from './controller.ts'

/** Render the owned DFU workflow while the controller owns all asynchronous resources. */
export function App() {
    const [controller] = useState(() => new DfuController(navigator.usb, window.dfu, window.dfuse, location.search))
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    useEffect(() => { controller.start(); return () => controller.dispose() }, [controller])
    return <>
        <table style={{ width: 1200 }}><tbody><tr><td><a href="https://ardupilot.org"><img src="./images/ArduPilot.png" /></a></td>
            <td><a href="https://github.com/ArduPilot/WebTools"><img src="./images/github-mark.png" style={{ width: 60 }} /></a><br />
                <a href="https://github.com/ArduPilot/WebTools"><img src="./images/GitHub_Logo.png" style={{ width: 60 }} /></a></td></tr></tbody></table>
        <p><span id="status">{state.status}</span></p>
        <h1>ArduPilot DFU Uploader</h1><p>This tools allows you to load an ArduPilot bootloader on boards that support DFU over USB.</p>
        <h1>Instructions</h1><p>To install an ArduPilot bootloader follow these steps</p>
        <ul>
            <li><p>Use a recent version of Chrome</p></li>
            <li><p>Put your flight controller in DFU mode, usually by pressing a button while plugging in USB to power it on.</p></li>
            <li><p>Download the right ArduPilot bootloader for your device in .bin or .hex format from <a href="https://firmware.ardupilot.org/Tools/Bootloaders/" target="_blank">https://firmware.ardupilot.org/Tools/Bootloaders/</a></p></li>
            <li><p>Press the "Connect" button below and select your DFU interface</p></li>
            <li><p>Use "Choose File" to select the bootloader file</p></li>
            <li><p>Press "Flash Bootloader" to flash the bootloader to your device</p></li>
            <li><p>On completion power cycle your flight controller and load the main firmware with MissionPlanner or another ArduPilot compatible GCS</p></li>
        </ul>
        <p><button id="connect" disabled={!navigator.usb || (state.busy && !state.connected)} onClick={() => state.connected ? controller.disconnect() : void controller.chooseDevice()}>{state.connected ? 'Disconnect' : 'Connect'}</button></p>
        <dialog id="interfaceDialog">Your device has multiple DFU interfaces. Select one from the list below:<form id="interfaceForm" method="dialog"><button id="selectInterface" type="submit">Select interface</button></form></dialog>
        <div id="usbInfo" style={{ whiteSpace: 'pre' }}>{state.usbInfo}</div><div id="dfuInfo" style={{ whiteSpace: 'pre' }}>{state.dfuInfo}</div>
        <fieldset><form id="configForm" onSubmit={event => { event.preventDefault(); event.stopPropagation(); void controller.flash() }}>
            <div id="dfuseFields" hidden={!state.memory}>
                <label htmlFor="dfuseStartAddress">DfuSe Start Address:</label>
                <input type="text" name="dfuseStartAddress" id="dfuseStartAddress" title="Initial memory address to read/write from (hex)" size={10} pattern="0x[A-Fa-f0-9]+" disabled={!state.memory || state.busy} value={state.address}
                    onChange={event => event.currentTarget.setCustomValidity(controller.setAddress(event.currentTarget.value))} />
                <label htmlFor="dfuseUploadSize">DfuSe Upload Size:</label>
                <input type="number" name="dfuseUploadSize" id="dfuseUploadSize" min="1" max={state.maxRead ?? undefined} disabled={!state.memory || state.busy} value={state.uploadSize === null || Number.isNaN(state.uploadSize) ? '' : state.uploadSize} onChange={event => controller.setUploadSize(event.currentTarget.valueAsNumber)} />
            </div>
            <legend>DFU mode</legend><fieldset><legend>Firmware Download (write to USB device)</legend>
                <p><FileInput id="firmwareFile" disabled={!state.writable || state.busy} onFile={file => controller.selectFile(file)} /></p>
                <p><button id="download" disabled={!state.writable || state.busy}>Flash Bootloader</button></p>
                <div className="log" id="downloadLog">{state.logs.map((log, index) => log.kind === 'progress' ? <progress key={index} value={log.done} max={log.total} /> : <p key={index} className={log.kind}>{log.message}</p>)}</div>
            </fieldset>
        </form></fieldset><hr /><p>Many thanks to <a href="https://github.com/devanlai/webdfu">https://github.com/devanlai/webdfu</a> for the DFU code!</p>
    </>
}
