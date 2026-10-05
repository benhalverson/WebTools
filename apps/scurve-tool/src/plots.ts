import type { PlotFields } from '@webtools/react-workflows'
import type { TrajectoryResult, Vector3 } from './trajectory.ts'

export interface PlotModel {
    data: PlotFields[]
    layout: PlotFields
}

export type KinematicKey = 'snap' | 'jerk' | 'accel' | 'vel' | 'pos'
export type TrajectoryPlots = Record<KinematicKey | 'waypoint', PlotModel>
export interface PlotOptions {
    radius: number
    showRadius: boolean
    color: 'velocity' | 'acceleration' | 'jerk' | null
}

const kinematics = [
    { key: 'snap', title: 'Snap', unit: 'm/s⁴' },
    { key: 'jerk', title: 'Jerk', unit: 'm/s³' },
    { key: 'accel', title: 'Acceleration', unit: 'm/s²' },
    { key: 'vel', title: 'Velocity', unit: 'm/s' },
    { key: 'pos', title: 'Position', unit: 'm' },
] as const

/** Retains the legacy arithmetic order rather than changing to Math.hypot. */
function vectorLength([x, y, z]: Vector3): number {
    return Math.sqrt(x * x + y * y + z * z)
}

/** Builds the legacy mesh verbatim, including floating angle accumulation and
 * its original triangle topology. The center uses North/East/Down coordinates. */
export function generateSphere([north, east, down]: Vector3, radius: number, steps: number): PlotFields {
    const x: number[] = [], y: number[] = [], z: number[] = []
    const i: number[] = [], j: number[] = [], k: number[] = []
    const angleStep = Math.PI / steps
    for (let theta = 0; theta < Math.PI; theta += angleStep) {
        for (let phi = 0; phi < 2 * Math.PI; phi += angleStep) {
            x.push(north + radius * Math.sin(theta) * Math.cos(phi))
            y.push(east + radius * Math.sin(theta) * Math.sin(phi))
            z.push(-down + radius * Math.cos(theta))
        }
    }
    for (let m = 0; m < steps - 1; m++) {
        for (let n = 0; n < steps * 2 - 1; n++) {
            const p1 = m * steps * 2 + n
            const p2 = p1 + 1
            const p3 = p1 + steps * 2
            const p4 = p3 + 1
            i.push(p1, p2, p3, p2, p4, p3)
            j.push(p2, p4, p4, p4, p3, p3)
            k.push(p3, p3, p1, p1, p1, p2)
        }
    }
    return { type: 'mesh3d', x, y, z, i, j, k, opacity: 0.3,
        color: 'rgba(255, 0, 0, 0.5)', flatshading: true, hoverinfo: 'none' }
}

/** Creates fresh axis objects so Plotly cannot mutate another plot's layout. */
function axis(title: string): PlotFields {
    return { title: { text: title }, zeroline: false, showline: true, mirror: true }
}

/** Copies trajectory arrays at the vendor boundary; plots never own model data. */
function kinematicPlot(result: TrajectoryResult | null, key: KinematicKey, title: string, unit: string): PlotModel {
    return {
        data: result?.curves.map((curve, index) => ({
            x: [...curve.time], y: [...curve[key]], name: `Leg ${index + 1}`, mode: 'lines',
            hovertemplate: `<extra></extra>%{x:.2f} s<br>%{y:.2f} ${unit}`,
        })) ?? [],
        layout: {
            legend: { itemclick: false, itemdoubleclick: false },
            margin: { b: 50, l: 60, r: 50, t: 20 },
            xaxis: axis('Time (s)'), yaxis: axis(`${title} (${unit})`), showlegend: true,
        },
    }
}

/** Creates the waypoint/target traces and equal ranges used by the old page.
 * The historical N/E hover labels and reversed north axis are intentional. */
function waypointPlot(result: TrajectoryResult | null, options: PlotOptions): PlotModel {
    const waypoints = result?.waypoints ?? []
    const points: PlotFields = {
        type: 'scatter3d', x: waypoints.map(v => v[0]), y: waypoints.map(v => v[1]),
        z: waypoints.map(v => -v[2]), meta: [1, 2, 3, 4], name: 'WP', mode: 'lines+markers',
        hovertemplate: '<extra></extra>WP: %{meta}<br> %{x:.0f} m<br>%{y:.0f} m<br>%{z:.0f} m',
    }
    const colorbar: PlotFields = { title: '', len: 0.75, thickness: 40 }
    const line: PlotFields = { width: 10, color: [1], colorscale: 'Viridis', colorbar }
    const target: PlotFields = {
        type: 'scatter3d', x: result?.positions.map(v => v[0]) ?? [],
        y: result?.positions.map(v => v[1]) ?? [], z: result?.positions.map(v => -v[2]) ?? [],
        name: 'Target', mode: 'lines', line,
        hovertemplate: '<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>Vel = %{line.color:.2f} m/s',
    }
    const data = [points, target]
    const xaxis: PlotFields = { title: { text: 'North (m)' }, autorange: false, zeroline: false }
    const yaxis: PlotFields = { title: { text: 'East (m)' }, autorange: false, zeroline: false }
    const zaxis: PlotFields = { title: { text: 'Up (m)' }, autorange: false, zeroline: false }
    if (result) {
        if (options.color) {
            const choices = {
                velocity: { values: result.velocities, title: 'Vel', unit: 'm/s' },
                acceleration: { values: result.accelerations, title: 'Accel', unit: 'm/s²' },
                jerk: { values: result.jerks, title: 'Jerk', unit: 'm/s³' },
            }
            const choice = choices[options.color]
            line.color = choice.values.map(vectorLength)
            colorbar.title = `${choice.title} Magnitude`
            target.hovertemplate = `<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>${choice.title} = %{line.color:.2f} ${choice.unit}`
        } else {
            line.color = 'rgba(0, 0, 0, 1)'
            line.showscale = false
        }
        if (options.showRadius) {
            data.push(...waypoints.map(point => generateSphere(point, options.radius, 100)))
        }
        let minimum = Infinity, maximum = -Infinity
        for (const [north, east, down] of waypoints) {
            minimum = Math.min(minimum, north, east, -down)
            maximum = Math.max(maximum, north, east, -down)
        }
        minimum -= options.radius
        maximum += options.radius
        xaxis.range = [maximum, minimum]
        yaxis.range = [minimum, maximum]
        zaxis.range = [minimum, maximum]
    }
    return { data, layout: {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        scene: { xaxis, yaxis, zaxis, aspectmode: 'cube' },
    } }
}

/** Produces all six independent vendor snapshots, including empty startup plots.
 * Callers own shared time-axis interaction state and the Plot component lifetime. */
export function createPlots(result: TrajectoryResult | null, options: PlotOptions): TrajectoryPlots {
    const [snap, jerk, accel, vel, pos] = kinematics.map(({ key, title, unit }) =>
        kinematicPlot(result, key, title, unit))
    // The fixed descriptor tuple always produces these five plots.
    if (!snap || !jerk || !accel || !vel || !pos) throw new Error('Missing kinematic plot descriptor')
    return { waypoint: waypointPlot(result, options), snap, jerk, accel, vel, pos }
}
