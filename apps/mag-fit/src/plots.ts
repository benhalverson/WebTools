import type { PlotFields } from '@webtools/react-workflows'
import { array_scale, array_sub } from '@webtools/numerics'
import { array_wrap_PI } from './calibration.ts'
import { choices, type Selection } from './selection.ts'
import type { FitOutput, LogData } from './types.ts'
export interface Figure {
    id: string
    title: string
    data: PlotFields[]
    layout: PlotFields
}
const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']
const gauss = '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} mGauss'
/** Build a fresh Plotly layout so vendor mutation cannot leak into application state. */
function layout(title: string, range?: readonly number[]): PlotFields {
    return {
        width: 1200,
        height: 300,
        xaxis: {
            title: { text: 'Time (s)' },
            zeroline: false,
            showline: true,
            mirror: true,
            ...(range ? { range: [...range], autorange: false } : {}),
        },
        yaxis: { title: { text: title }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }
}
/** Generate all legacy scientific traces from the selected fit snapshot and visibility. */
export function figures(
    log: LogData | null,
    result: FitOutput | null,
    selection: Selection,
    range?: readonly number[],
    analysisRange?: readonly number[],
): Figure[] {
    const flightLayout = layout('')
    flightLayout.height = 450
    flightLayout.showlegend = false
    flightLayout.xaxis = {
        title: { text: 'Time (s)' },
        domain: [0.07, 0.93],
        type: 'linear',
        zeroline: false,
        showline: true,
        mirror: true,
        rangeslider: {},
        ...(analysisRange ? { range: [...analysisRange], autorange: false } : {}),
    }
    for (let i = 0; i < 4; i++)
        flightLayout[`yaxis${i ? i + 1 : ''}`] = {
            title: { text: ['Roll', 'Pitch', 'Throttle', 'Altitude'][i] },
            zeroline: false,
            showline: true,
            mirror: true,
            side: i < 2 ? 'left' : 'right',
            position: [0, 0.06, 0.94, 1][i],
            color: colors[i],
            ...(i ? { overlaying: 'y' } : {}),
        }
    const flight: Figure = {
        id: 'FlightData',
        title: 'Flight Data',
        layout: flightLayout,
        data:
            log?.flight.map((series, index) => ({
                mode: 'lines',
                name: series.name,
                meta: series.name,
                yaxis: `y${index ? index + 1 : ''}`,
                x: series.time,
                y: series.value,
                hovertemplate: `<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} ${series.unit}`,
            })) ?? [],
    }
    const definitions = [
        ['mag_plot_x', 'X component', 'Field x (mGauss)'],
        ['mag_plot_y', 'Y component', 'Field y (mGauss)'],
        ['mag_plot_z', 'Z component', 'Field z (mGauss)'],
        ['error_plot', 'Field error', 'Field error (mGauss)'],
        ['yaw_change_mag', 'Heading change', 'Change heading<br> New vs existing calibration (deg)'],
        [
            'yaw_change_att',
            'Attitude heading change',
            'Change heading<br> New vs selected attitude source (deg)',
        ],
        ['field_length', 'Magnetic field length', 'Measured field length (mGauss)'],
    ]
    const plots: Figure[] = definitions.map(([id, title, axis]) => ({
        id: id!,
        title: title!,
        layout: layout(axis!, range),
        data: [],
    }))
    for (let i = 0; i < plots.length; i++) {
        const plot = plots[i]!
        const component = (['x', 'y', 'z'] as const)[i]
        plot.data.push(
            i < 3 || i == 6
                ? {
                      mode: 'lines',
                      name: 'Expected',
                      meta: 'Expected',
                      line: { width: 4, color: '#000000' },
                      hovertemplate: gauss,
                      x: component ? result?.source.quaternion.time : [log?.start, log?.end],
                      y: component
                          ? result?.source[component]
                          : [log && log.earth.intensity * 1000, log && log.earth.intensity * 1000],
                  }
                : { line: { width: 4, color: '#000000' } },
        )
        for (const compass of result?.compasses ?? [])
            for (const [index, choice] of choices(compass).entries()) {
                const data = choice.result
                const values = component
                    ? data[component]
                    : i == 3
                      ? data.error
                      : i == 4
                        ? array_scale(array_wrap_PI(array_sub(data.yaw, compass.orig.yaw)), 180 / Math.PI)
                        : i == 5
                          ? array_scale(
                                array_wrap_PI(array_sub(data.yaw, compass.quaternion.yaw)),
                                180 / Math.PI,
                            )
                          : data.x.map((x, j) => Math.sqrt(x ** 2 + data.y[j]! ** 2 + data.z[j]! ** 2))
                plot.data.push({
                    mode: 'lines',
                    name: `Mag ${compass.index + 1}`,
                    meta: `Mag ${compass.index + 1}`,
                    visible: selection.visible.includes(choice.key),
                    legendgroup: index - 1,
                    legendgrouptitle: { text: choice.name },
                    hovertemplate:
                        i == 4 || i == 5 ? '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} deg' : gauss,
                    x: compass.time,
                    y: values,
                    ...(i == 4 ? { line: { width: choice.original ? 0 : 2 } } : {}),
                })
            }
    }
    const bars: Figure = {
        id: 'error_bars',
        title: 'Mean field error',
        layout: {
            ...layout('mean field error (mGauss)'),
            xaxis: { zeroline: false, showline: true, mirror: true },
            barmode: 'group',
        },
        data: (result?.compasses ?? []).map((compass) => {
            const all = choices(compass).filter((choice) => choice.original || choice.result.valid)
            return {
                type: 'bar',
                name: `Mag ${compass.index + 1}`,
                meta: `Mag ${compass.index + 1}`,
                marker: { color: colors[compass.index + 1] },
                hovertemplate: '<extra></extra>%{meta}<br>%{x}<br>%{y:.2f} mGauss',
                x: all.map((choice) => (choice.original ? 'Existing Calibration' : choice.name)),
                y: all.map((choice) => choice.result.mean_error),
                visible: choices(compass).some((choice) => selection.visible.includes(choice.key)),
            }
        }),
    }
    const motor: Figure = {
        id: 'motor_comp',
        title: 'Motor compensation',
        layout: layout('Current (A)', range),
        data: [],
    }
    for (const source of log?.motor ?? [])
        motor.data.push({
            mode: 'lines',
            name: '1',
            meta: 'Battery 1',
            x: source.time,
            y: source.value,
            legendgroup: 1,
            legendgrouptitle: { text: 'Battery current' },
            hovertemplate: '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} A',
        })
    const ordered = [
        plots[0]!,
        plots[1]!,
        plots[2]!,
        plots[4]!,
        plots[5]!,
        plots[6]!,
        ...(motor.data.length ? [motor] : []),
        plots[3]!,
        bars,
    ]
    const titles: Record<string, string> = {
        yaw_change_mag: 'Yaw change',
        field_length: 'Field length',
        motor_comp: 'Motor compensation sources',
        error_plot: 'Calibration error',
    }
    for (const plot of ordered) plot.title = titles[plot.id] ?? ''
    return [flight, ...ordered]
}
