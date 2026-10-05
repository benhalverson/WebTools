import type { PlotFields } from '@webtools/react-workflows'

export interface SensorOffset {
    readonly name: string
    readonly position: readonly [number, number, number]
}
const hover = '<extra></extra>%{meta}<br>X: %{x:.2f} m<br>Y: %{y:.2f} m<br>Z: %{z:.2f} m'

/** Builds the legacy trace slots, including hidden sensors, so Plotly assigns the
 * same colors and legend order when a parameter file has missing devices. */
export function offsetTraces(offsets: readonly SensorOffset[]): PlotFields[] {
    const data: PlotFields[] = [{ x: [0], y: [0], z: [0], mode: 'markers', type: 'scatter3d', name: 'GC', meta: 'GC', marker: { color: 'rgb(0,0,0)' }, showlegend: false, hovertemplate: '<extra></extra>CG' }]
    const names = [
        ...Array.from({ length: 5 }, (_, i) => `IMU ${i + 1}`),
        ...Array.from({ length: 2 }, (_, i) => [`GPS ${i + 1}`, `GPS ${i + 1} Slave`]).flat(),
        ...Array.from({ length: 10 }, (_, i) => `Rangefinder ${i + 1}`), 'FLOW 1', 'VISO 1',
    ]
    for (const name of names) {
        const offset = offsets.find(item => item.name === name || item.name === `${name} Master`)
        const actualName = offset?.name ?? name.replace(' Slave', '')
        data.push({ mode: 'markers', type: 'scatter3d', name: actualName, meta: actualName, visible: !!offset, hovertemplate: hover,
            ...(offset ? { x: [offset.position[0]], y: [offset.position[1]], z: [offset.position[2]] } : {}) })
    }
    for (const [index, color] of ['rgb(0,0,255)', 'rgb(255,0,0)', 'rgb(0,255,0)'].entries()) {
        const direction = [0, 0, 0]
        direction[index] = 0.2
        const [x, y, z] = direction
        data.push({ type: 'cone', x: [x], y: [y], z: [z], u: [x], v: [y], w: [z], sizemode: 'raw', sizeref: 0.4, showscale: false, hoverinfo: 'none', colorscale: [[0, color], [1, color]] })
        data.push({ type: 'scatter3d', mode: 'lines', x: [0, x], y: [0, y], z: [0, z], showlegend: false, hoverinfo: 'none', line: { color, width: 10 } })
    }
    return data
}

/** Preserves the forward/right/down axis directions and legacy camera bounds. */
export function offsetLayout(maxOffset: number): PlotFields {
    /** Builds one axis with the exact legacy display attributes. */
    function axis(text: string, reverse: boolean): PlotFields {
        return { title: { text }, zeroline: false, showline: true, mirror: true, showspikes: false,
            range: reverse ? [maxOffset, -maxOffset] : [-maxOffset, maxOffset] }
    }
    return { width: 800, height: 800,
        scene: { xaxis: axis('X offset, forward (m)', false), yaxis: axis('Y offset, right (m)', true), zaxis: axis('Z offset, down (m)', true),
            aspectratio: { x: 0.75, y: 0.75, z: 0.75 }, camera: { eye: { x: -1.25, y: 1.25, z: 1.25 } } },
        showlegend: true, legend: { itemclick: false, itemdoubleclick: false }, margin: { b: 50, l: 50, r: 50, t: 20 } }
}
