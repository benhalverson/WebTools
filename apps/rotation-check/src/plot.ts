import type { PlotFields } from '@webtools/react-workflows'
import { rotateVector, type Matrix3, type Vector3 } from './matrix.ts'

const originSize = 0.2
const rotatedSize = originSize * 1.5
const originVectors: readonly Vector3[] = [[originSize, 0, 0], [0, originSize, 0], [0, 0, originSize]]
const rotatedVectors: readonly Vector3[] = [[rotatedSize, 0, 0], [0, rotatedSize, 0], [0, 0, rotatedSize]]
const colors = ['0,0,255', '255,0,0', '0,255,0'] as const

/** Creates new trace objects per update so Plotly never mutates application state. */
function vectorTraces([x, y, z]: Vector3, color: string): readonly PlotFields[] {
    return [
        { type: 'cone', x: [x], y: [y], z: [z], u: [x], v: [y], w: [z], sizemode: 'raw',
            sizeref: originSize * 2.0, showscale: false, hoverinfo: 'none', colorscale: [[0, color], [1, color]] },
        { type: 'scatter3d', mode: 'lines', x: [0, x], y: [0, y], z: [0, z], showlegend: false,
            hoverinfo: 'none', line: { color, width: 10 } },
    ]
}

/** Keeps origin traces first and rotated traces second, in forward/right/down order. */
export function rotationTraces(matrix: Matrix3): readonly PlotFields[] {
    return [
        ...originVectors.flatMap((vector, index) => vectorTraces(vector, `rgba(${colors[index]},0.5)`)),
        ...rotatedVectors.flatMap((vector, index) => vectorTraces(rotateVector(matrix, vector), `rgba(${colors[index]},1.0)`)),
    ]
}

/** Returns an owned layout; stable uirevision retains camera changes until reset. */
export function rotationLayout(): PlotFields {
    return {
        width: 1000, height: 800, uirevision: 'rotation-check',
        scene: {
            xaxis: { title: { text: 'X, forward' }, range: [-0.3, 0.3], zeroline: false, showline: true, mirror: true, showspikes: false },
            yaxis: { title: { text: 'Y, right' }, range: [0.3, -0.3], zeroline: false, showline: true, mirror: true, showspikes: false },
            zaxis: { title: { text: 'Z, down' }, range: [0.3, -0.3], zeroline: false, showline: true, mirror: true, showspikes: false },
            aspectratio: { x: 0.75, y: 0.75, z: 0.75 },
            camera: { eye: { x: -1.25, y: 1.25, z: 1.25 } },
        },
        showlegend: true, legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }
}
