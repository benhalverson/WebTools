import type { DataflashLog, Message } from '@webtools/dataflash'
import type { PlotFields } from '@webtools/react-workflows'
import { numbers as numericField } from './log-fields.ts'

export interface LogPlot {
    readonly id: string
    readonly title: string
    readonly data: PlotFields[]
    readonly layout: PlotFields
    readonly note?: string
}
type Parameters = Readonly<Record<string, number>>
const serialProtocols: Readonly<Record<string, string>> = {
                "-1": "None",
                 "0": "None",
                 "1": "MAVLink1",
                 "2": "MAVLink2",
                 "3": "Frsky D",
                 "4": "Frsky SPort",
                 "5": "GPS",
                 // SerialProtocol_GPS2
                 "7": "Alexmos Gimbal Serial",
                 "8": "Gimbal",
                 "9": "Rangefinder",
                "10": "FrSky SPort Passthrough (OpenTX)",
                "11": "Lidar360",
                // SerialProtocol_Aerotenna_USD1
                "13": "Beacon",
                "14": "Volz servo out",
                "15": "SBus servo out",
                "16": "ESC Telemetry",
                "17": "Devo Telemetry",
                "18": "OpticalFlow",
                "19": "RobotisServo",
                "20": "NMEA Output",
                "21": "WindVane",
                "22": "SLCAN",
                "23": "RCIN",
                "24": "EFI Serial",
                "25": "LTM",
                "26": "RunCam",
                "27": "HottTelem",
                "28": "Scripting",
                "29": "Crossfire VTX",
                "30": "Generator",
                "31": "Winch",
                "32": "MSP",
                "33": "DJI FPV",
                "34": "AirSpeed",
                "35": "ADSB",
                "36": "AHRS",
                "37": "SmartAudio",
                "38": "FETtecOneWire",
                "39": "Torqeedo",
                "40": "AIS",
                "41": "CoDevESC",
                "42": "DisplayPort",
                "43": "MAVLink High Latency",
                "44": "IRC Tramp",
                "45": "DDS XRCE",
                "46": "IMUDATA",
                // Reserving Serial Protocol 47 for SerialProtocol_IQ
                "48": "PPP",
                "49": "i-BUS Telemetry",
                "50": "IOMCU",
}

/** Read a numeric upstream field without coercing string or vector fields. */
function numbers(message: Message | undefined, field: string): number[] {
    return Array.from(numericField(message, field))
}
/** Convert upstream microseconds using the legacy multiplication order. */
function times(message: Message | undefined): number[] {
    return numbers(message, 'TimeUS').map(value => value * (1 / 1000000))
}
/** Construct the shared legacy line presentation, retaining empty trace slots. */
function line(name: string | undefined, unit: string, x?: (number | undefined)[], y?: number[]): PlotFields {
    return { mode: 'lines', ...(name === undefined ? {} : { name, meta: name }),
        hovertemplate: `<extra></extra>${name === undefined ? '' : '%{meta}<br>'}%{x:.2f} s<br>%{y:.2f}${unit ? ' ' + unit : ''}`,
        ...(x === undefined ? {} : { x, y }) }
}
/** Build a fresh layout; each model owns its arrays so Plotly cannot mutate another report. */
function layout(title: string, left = 50, zero = false): PlotFields {
    return { legend: { itemclick: false, itemdoubleclick: false }, margin: { b: 50, l: left, r: 50, t: 20 },
        xaxis: { title: { text: 'Time (s)' } }, yaxis: { title: { text: title }, ...(zero ? { rangemode: 'tozero' } : {}) } }
}
/** Decode the exact legacy kbaud aliases, fallback and nonpositive default. */
export function serialBaud(rate: number | undefined): number | undefined {
    if (rate === undefined) return undefined
    rate = Number.parseInt(String(rate))
    if (rate <= 0) rate = 57
    const aliases: Record<number, number> = { 1: 1200, 2: 2400, 4: 4800, 9: 9600, 19: 19200, 38: 38400, 57: 57600,
        100: 100000, 111: 111100, 115: 115200, 230: 230400, 256: 256000, 460: 460800, 500: 500000, 921: 921600, 1500: 1500000, 2000: 2000000 }
    return aliases[rate] ?? (rate > 2000 ? rate : rate * 1000)
}
/** Preserve fallback labels for unknown serial protocols. */
function protocol(value: number): string { return serialProtocols[value] ?? `protocol ${value}` }
/** Resolve UART labels in legacy serial, networking, DroneCAN, IOMCU priority order. */
function uartTitle(instance: string, params: Parameters): { title: string; baud?: number | undefined } {
    let prefix = `SERIAL${instance}_`
    let value = params[prefix + 'PROTOCOL']
    if (value !== undefined) {
        const name = protocol(value)
        const baud = name === 'IOMCU' ? 1500000 : serialBaud(params[prefix + 'BAUD'])
        return { title: `Serial ${instance}: ${name}` + (name !== 'IOMCU' && baud !== undefined ? `, ${baud} baud` : ''), baud }
    }
    const net = Number(instance) - 20
    prefix = `NET_P${net}_`
    value = params[prefix + 'PROTOCOL']
    if (net >= 1 && value !== undefined) {
        let title = `Networking Port ${net}: ${protocol(value)}`
        const types: Record<number, string> = { 1: 'UDP client', 2: 'UDP server', 3: 'TCP client', 4: 'TCP server' }
        const type = params[prefix + 'TYPE']
        if (type !== undefined && types[type]) title += ' ' + types[type]
        const address = ['IP0', 'IP1', 'IP2', 'IP3', 'PORT'].map(key => params[prefix + key])
        if (address.every(part => part !== undefined)) title += ` ${address.slice(0, 4).join('.')}:${address[4]}`
        return { title }
    }
    for (const driver of [1, 2]) {
        const port = Number(instance) - (driver === 1 ? 40 : 50)
        prefix = `CAN_D${driver}_UC_S${port}_`
        value = params[prefix + 'PRO']
        if (port < 1 || value === undefined) continue
        const node = params[prefix + 'NOD'], index = params[prefix + 'IDX']
        const addressed = node !== undefined && index !== undefined
        const baud = serialBaud(params[prefix + 'BD'])
        // The legacy suffix depends on node/index presence, including undefined baud.
        return { title: `DroneCAN Driver ${driver} Port ${port}: ` + (addressed ? `NodeID: ${node} Port: ${index} ` : '') + protocol(value) + (addressed ? ` ${baud} baud` : ''), baud }
    }
    return Number(instance) === 100 ? { title: 'IOMCU, 1500000 baud', baud: 1500000 } : { title: `UART ${instance}` }
}
/** Build UART and CAN rate plots, retaining duplicate-time infinities and cumulative-counter resets. */
export function dataRatePlots(log: DataflashLog, params: Parameters): LogPlot[] {
    const plots: LogPlot[] = []
    for (const instance of Object.keys(log.messageTypes.UART?.instances ?? {})) {
        const message = log.get_instance('UART', instance), time = times(message)
        const { title, baud } = uartTitle(instance, params)
        const data = [line('Receive', 'B/s', time, numbers(message, 'Rx')), line('Transmit', 'B/s', time, numbers(message, 'Tx'))]
        if (baud !== undefined) data.push({ ...line('Baud limit', 'B/s', [time[0]!, time[time.length - 1]!], [baud / 10, baud / 10]), line: { dash: 'dot', color: '#000000' } })
        plots.push({ id: `UART_${instance}`, title, data, layout: layout('Data rate (bytes/second)', 60) })
    }
    for (const instance of Object.keys(log.messageTypes.CANS?.instances ?? {})) {
        const driver = Number.parseInt(instance) + 1
        const fd = ((params[`CAN_D${driver}_UC_OPTION`] ?? 0) & (1 << 2)) !== 0
        let bitrate: number | undefined
        for (let port = 1; port < 10; port++) {
            if (params[`CAN_P${port}_DRIVER`] !== driver) continue
            bitrate = Number.parseInt(String(params[`CAN_P${port}_${fd ? 'FDBITRATE' : 'BITRATE'}`])) * (fd ? 1000000 : 1)
            break
        }
        const message = log.get_instance('CANS', instance), time = times(message)
        const transmit = numbers(message, 'T'), receive = numbers(message, 'R')
        const tx: number[] = [], rx: number[] = [], total: number[] = []
        for (let i = 0; i < time.length - 1; i++) {
            const dt = time[i + 1]! - time[i]!
            tx.push((transmit[i + 1]! - transmit[i]!) / dt)
            rx.push((receive[i + 1]! - receive[i]!) / dt)
            total.push(tx[i]! + rx[i]!)
        }
        time.shift()
        const data = [line('Receive', 'f/s', time, rx), line('Transmit', 'f/s', time, tx), line('Total', 'f/s', time, total)]
        const limited = bitrate !== undefined && !fd
        if (bitrate !== undefined && !fd) {
            const limit = Math.floor(bitrate / 160)
            data.push({ ...line('Worst case limit', 'f/s', [time[0]!, time[time.length - 1]!], [limit, limit]), line: { dash: 'dot', color: '#000000' } })
        }
        plots.push({ id: `CANS_${instance}`, title: `DroneCAN ${instance}` + (bitrate !== undefined ? `: ${bitrate / 1000000}Mbit/s` : ''), data,
            layout: layout('Data rate (CAN frames/second)', 60), ...(limited ? { note: 'Limit is a very pessimistic worst case. It assumes max length frames and worst data. The best case is more than twice as many frames, the reality will be somewhere in between.' } : {}) })
    }
    return plots
}

/** Derive the owned plots from one parser without retaining mutable parser state. */
export function buildLogPlots(log: DataflashLog, params: Parameters): LogPlot[] {
    const plots: LogPlot[] = []
    const heat = log.messageTypes.HEAT ? log.get('HEAT') : undefined
    const power = log.messageTypes.POWR ? log.get('POWR') : undefined
    const mcu = log.messageTypes.MCU ? log.get('MCU') : undefined
    const powerTemp = log.messageTypes.POWR?.expressions.includes('MTemp')
    if (heat || powerTemp || mcu || log.messageTypes.IMU) {
        const data = ['heater target', 'heater actual', 'MCU', 'IMU 1', 'IMU 2', 'IMU 3', 'IMU 4', 'IMU 5'].map(name => line(name, '°C'))
        if (heat) { data[0] = line('heater target', '°C', times(heat), numbers(heat, 'Targ')); data[1] = line('heater actual', '°C', times(heat), numbers(heat, 'Temp')) }
        const temp = mcu ?? (powerTemp ? power : undefined)
        if (temp) data[2] = line('MCU', '°C', times(temp), numbers(temp, 'MTemp'))
        for (const instance of Object.keys(log.messageTypes.IMU?.instances ?? {})) {
            const message = log.get_instance('IMU', instance), index = Number.parseFloat(instance)
            data[3 + index] = line(`IMU ${index + 1}`, '°C', times(message), numbers(message, 'T'))
        }
        plots.push({ id: 'Temperature', title: 'Temperature', data, layout: layout('Temperature (°C)') })
    }
    if (power || mcu) {
        const data: PlotFields[] = [{ line: { color: 'transparent' }, fill: 'toself', type: 'scatter', showlegend: false, hoverinfo: 'none' }, ...['servo', 'board', 'MCU'].map(name => line(name, 'V'))]
        let visible = false
        if (power) for (const [index, field, name] of [[1, 'VServo', 'servo'], [2, 'Vcc', 'board']] as const) {
            const values = numbers(power, field)
            if (values.every(Number.isNaN)) continue
            data[index] = line(name, 'V', times(power), values); visible = true
        }
        const voltage = mcu ?? (log.messageTypes.POWR?.expressions.includes('MVolt') ? power : undefined)
        if (voltage) {
            const time = times(voltage)
            data[3] = line('MCU', 'V', time, numbers(voltage, 'MVolt'))
            data[0] = { ...data[0], x: [...time, ...time.toReversed()], y: [...numbers(voltage, 'MVmax'), ...numbers(voltage, 'MVmin').toReversed()] }
            visible = true
        }
        if (visible) plots.push({ id: 'Board_Voltage', title: 'Board Voltage', data, layout: layout('Voltage', 50, true) })
    }
    if (power) {
        const expressions = log.messageTypes.POWR?.expressions ?? []
        const flag = expressions.includes('Flags') ? 'Flags' : 'Flg'
        const accumulated = expressions.includes('AccFlags') ? 'AccFlags' : 'AccFlg'
        if (expressions.includes(flag) && !(expressions.includes(accumulated) && numbers(power, accumulated).every(value => (value & 32) === 0))) {
            const values = numbers(power, flag), time = times(power)
            const data = ['Primary<br>power supply', 'Secondary<br>power supply', 'USB power', 'Peripheral<br>overcurrent', 'Peripheral<br>high power<br>overcurrent'].map((name, i) => line(name, '', time, values.map(value => (value & (1 << i)) !== 0 ? 1 : 0)))
            plots.push({ id: 'power_flags', title: 'Power flags', data, layout: layout('Power flags', 50, true) })
        }
    }
    if (log.messageTypes.PM) {
        const message = log.get('PM'), time = times(message)
        plots.push({ id: 'performance_load', title: 'Load', data: [line(undefined, '%', time, numbers(message, 'Load').map(value => value * (1 / 10)))], layout: layout('Load (%)') },
            { id: 'performance_mem', title: 'Free memory', data: [line(undefined, 'B', time, numbers(message, 'Mem'))], layout: layout('Free memory (bytes)', 60) })
        const data = [line('Worst', 'Hz', time, numbers(message, 'MaxT').map(value => 1 / (value * (1 / 1000000)))), line('Average', 'Hz')]
        if (message?.LR) data[1] = line('Average', 'Hz', time, numbers(message, 'LR'))
        plots.push({ id: 'performance_time', title: 'Loop times', data, layout: layout('Loop rate (Hz)') })
    }
    plots.push(...dataRatePlots(log, params))
    if (log.messageTypes.STAK) {
        const stacks = Object.keys(log.messageTypes.STAK.instances ?? {}).map(instance => log.get_instance('STAK', instance))
        stacks.sort((a, b) => (numbers(b, 'Pri')[0] ?? NaN) - (numbers(a, 'Pri')[0] ?? NaN))
        const free: PlotFields[] = [], used: PlotFields[] = []
        for (const message of stacks) {
            const name = String(message?.Name?.[0]), time = times(message), total = numbers(message, 'Total'), available = numbers(message, 'Free')
            free.push(line(name, 'B', time, available))
            used.push(line(name, '%', time, total.map((value, i) => ((value - available[i]!) / value) * 100)))
        }
        plots.push({ id: 'stack_mem', title: 'Free memory', data: free, layout: layout('Free memory (bytes)') }, { id: 'stack_pct', title: 'Memory usage', data: used, layout: layout('Memory usage (%)') })
    }
    if (log.messageTypes.DSF) {
        const message = log.get('DSF'), time = times(message)
        plots.push({ id: 'log_dropped', title: 'Dropped messages', data: [line(undefined, '', time, numbers(message, 'Dp'))], layout: layout('Dropped messages') },
            { id: 'log_buffer', title: 'Free Buffer Space', data: ['FMx', 'FAv', 'FMn'].map((field, i) => line(['Maximum', 'Average', 'Minimum'][i], 'B', time, numbers(message, field))), layout: layout('Free Buffer Space (bytes)') })
    }
    const stats = Object.entries(log.stats())
    plots.push({ id: 'log_stats', title: 'Log Composition', data: [{ type: 'pie', textposition: 'inside', textinfo: 'label+percent', hovertemplate: '%{label}<br>%{value:,i} Bytes<br>%{percent}<extra></extra>', labels: stats.map(([key]) => key), values: stats.map(([, value]) => value?.size) }], layout: { showlegend: false, margin: { b: 10, l: 50, r: 50, t: 10 } } })
    const drift = clockDriftPlot(log)
    if (drift) plots.push(drift)
    return plots
}

/** Compare independent GPS time to the FC clock, excluding the blended GPS and invalid fixes. */
function clockDriftPlot(log: DataflashLog): LogPlot | undefined {
    const data: PlotFields[] = []
    let start: number | undefined, end: number | undefined, maximum: number | undefined
    for (const instance of Object.keys(log.messageTypes.GPS?.instances ?? {})) {
        if (Number(instance) === 2) continue
        const message = log.get_instance('GPS', instance), time = numbers(message, 'TimeUS')
        const status = numbers(message, 'Status'), weeks = numbers(message, 'GWk'), ms = numbers(message, 'GMS')
        const values = Array.from({ length: time.length }, () => NaN)
        let first: { gps: number; time: number } | undefined, haveDrift = false
        for (let i = 0; i < time.length; i++) {
            if (status[i]! < 3 || weeks[i]! <= 1000 || ms[i] === 0) continue
            const gps = weeks[i]! * (7 * 24 * 60 * 60 * 1000) + ms[i]!
            if (!first) { first = { gps, time: time[i]! }; values[i] = 0; continue }
            values[i] = (gps - first.gps) - (time[i]! - first.time) * 0.001
            haveDrift = true
            if (start === undefined || first.time < start) start = first.time
            if (end === undefined || time[i]! > end) end = time[i]!
            if (maximum === undefined || Math.abs(values[i]!) > maximum) maximum = Math.abs(values[i]!)
        }
        if (haveDrift) data.push(line(`GPS ${instance}`, 'ms', times(message), values))
    }
    if (!data.length) return undefined
    const minimum = ((end ?? NaN) - (start ?? NaN)) * 0.001 * 1000 * 10 ** -6
    const plotLayout = layout('Clock drift (ms)')
    if (maximum !== undefined && maximum < minimum) plotLayout.yaxis = { title: { text: 'Clock drift (ms)' }, range: [-minimum, minimum], autorange: false }
    return { id: 'clock_drift', title: 'Clock drift', data, layout: plotLayout }
}
