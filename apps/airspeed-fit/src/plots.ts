/* oxlint-disable unicorn/no-new-array -- Preserve legacy sparse allocation and numerical behavior. */
// Indexed assertions preserve legacy missing-sample arithmetic; they do not fill or validate data.
import type { PlotFields } from '@webtools/react-workflows'
import { linear_interp } from '@webtools/numerics'
import type { Analysis, Flight, Options } from './model.ts'
export interface PlotSpec {
    data: PlotFields[]
    layout: PlotFields
}
/** Format diagnostics exactly as the legacy display, including non-finite values. */
export function fmt(v: number | null | undefined, d: number): string {
    return v == null || !isFinite(v) ? 'n/a' : v.toFixed(d)
}
/** Compare the logged and fitted scale against the same shared wind-implied airspeed. */
export function sensor_series(analysis: Analysis, i: number) {
    const { fit: fit_result, sensors: ASP_Data } = analysis
    if (fit_result == null) return null
    const ps = fit_result.per_sensor[i]!
    if (ps == null) return null
    const D = fit_result.D
    const n = D.length
    /** Average residuals without changing accumulation order. */
    const mean = (a: number[]) => {
        let s = 0
        for (const v of a) s += v
        return s / a.length
    }
    const out = {
        pred_after: ps.pred,
        resid_after: ps.resid,
        rms_after: ps.residual_rms,
        mean_after: mean(ps.resid),
        ratio_after: ps.ratio,
        ratio_before: ASP_Data[i]!.current_ratio,
        pred_before: null as number[] | null,
        resid_before: null as number[] | null,
        rms_before: null as number | null,
        mean_before: null as number | null,
    }
    const rb = ASP_Data[i]!.current_ratio
    if (rb != null && isFinite(rb) && rb > 0) {
        const kb = Math.sqrt(rb)
        const pb = new Array(n),
            res = new Array(n)
        let s2 = 0
        for (let m = 0; m < n; m++) {
            pb[m]! = kb * ps.u[m]!
            res[m]! = D[m]! - pb[m]!
            s2 += res[m]! * res[m]!
        }
        out.pred_before = pb
        out.resid_before = res
        out.rms_before = Math.sqrt(s2 / n)
        out.mean_before = mean(res)
    }
    return out
}

const sensor_line_colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']
/** Clamp plot color selection to the last legacy sensor color. */
function sensor_line_color(i: number): string {
    return sensor_line_colors[Math.min(i, sensor_line_colors.length - 1)]!
}
/** Build before/after TAS traces against the common wind triangle. */
export function redraw_combined_tas(analysis: Analysis): PlotSpec {
    const { fit: fit_result, sensors: ASP_Data } = analysis
    if (fit_result == null) return { data: [], layout: {} }
    const wm = fit_result
    const t0 = wm.t[0]!
    const tmin = wm.t.map((x) => x - t0)
    const traces: PlotFields[] = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(analysis, i)
        if (s == null) continue
        const col = sensor_line_color(i)
        const grp = 's' + i,
            gt = { text: 'Sensor ' + (ASP_Data[i]!.instance + 1) }
        if (s.pred_before != null) {
            traces.push({
                mode: 'lines',
                name: 'before',
                legendgroup: grp,
                legendgrouptitle: gt,
                line: { color: col, width: 1, dash: 'dot' },
                opacity: 0.7,
                hovertemplate: '<extra></extra>%{y:.2f} m/s at %{x:.1f} s',
                x: tmin,
                y: s.pred_before,
            })
        }
        traces.push({
            mode: 'lines',
            name: 'after',
            legendgroup: grp,
            legendgrouptitle: gt,
            line: { color: col, width: 1.2 },
            hovertemplate: '<extra></extra>%{y:.2f} m/s at %{x:.1f} s',
            x: tmin,
            y: s.pred_after,
        })
    }
    // Expected (truth) drawn last so it sits on top of the noisy pitot lines.
    traces.push({
        mode: 'lines',
        name: 'Expected',
        line: { color: '#000000', width: 1.5 },
        hovertemplate: '<extra></extra>%{y:.2f} m/s at %{x:.1f} s',
        x: tmin,
        y: wm.D,
    })
    return {
        data: traces,
        layout: {
            xaxis: { title: { text: 'time in window (s)' }, zeroline: false, showline: true, mirror: true },
            yaxis: { title: { text: 'true airspeed (m/s)' }, zeroline: false, showline: true, mirror: true },
            showlegend: true,
            legend: { itemclick: 'toggle', itemdoubleclick: 'toggleothers', groupclick: 'toggleitem' },
            margin: { b: 50, l: 60, r: 30, t: 20 },
        },
    }
}

/** Build before/after residual traces with independent legend toggles. */
export function redraw_combined_resid(analysis: Analysis): PlotSpec {
    const { fit: fit_result, sensors: ASP_Data } = analysis
    if (fit_result == null) return { data: [], layout: {} }
    const wm = fit_result
    const t0 = wm.t[0]!
    const tmin = wm.t.map((x) => x - t0)
    const traces: PlotFields[] = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(analysis, i)
        if (s == null) continue
        const col = sensor_line_color(i)
        const grp = 's' + i,
            gt = { text: 'Sensor ' + (ASP_Data[i]!.instance + 1) }
        if (s.resid_before != null) {
            traces.push({
                mode: 'lines',
                name: 'before',
                legendgroup: grp,
                legendgrouptitle: gt,
                line: { color: col, width: 0.8, dash: 'dot' },
                opacity: 0.7,
                hovertemplate: '<extra></extra>%{y:.2f} m/s at %{x:.1f} s',
                x: tmin,
                y: s.resid_before,
            })
        }
        traces.push({
            mode: 'lines',
            name: 'after',
            legendgroup: grp,
            legendgrouptitle: gt,
            line: { color: col, width: 0.9 },
            hovertemplate: '<extra></extra>%{y:.2f} m/s at %{x:.1f} s',
            x: tmin,
            y: s.resid_after,
        })
    }
    return {
        data: traces,
        layout: {
            xaxis: { title: { text: 'time in window (s)' }, zeroline: false, showline: true, mirror: true },
            yaxis: { title: { text: 'residual (m/s)' }, zeroline: true, showline: true, mirror: true },
            showlegend: true,
            legend: { itemclick: 'toggle', itemdoubleclick: 'toggleothers', groupclick: 'toggleitem' },
            margin: { b: 50, l: 60, r: 30, t: 20 },
        },
    }
}

/** Build grouped RMS bars with the legacy absolute bias overlays. */
export function redraw_rms_bar(analysis: Analysis): PlotSpec {
    const { fit: fit_result, sensors: ASP_Data } = analysis
    if (fit_result == null) return { data: [], layout: {} }
    // Grouped by calibration state (existing vs fitted), one bar per sensor. The
    // RMS is the full bar; a narrower dark bar overlaid at the same position (same
    // offsetgroup) shows the magnitude of the mean error (bias). |mean| ≤ RMS, and
    // the fit drives the bias to ~0 by construction, so the dark bar collapsing to
    // nothing after calibration = the bias was removed, leaving only the scatter.
    const cats = ['Existing', 'Fitted']
    const rms_traces: PlotFields[] = [],
        mean_traces: PlotFields[] = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(analysis, i)
        if (s == null) continue
        const og = 's' + i
        const rms = [s.rms_before, s.rms_after]
        const bias = [Math.abs(s.mean_before ?? 0), Math.abs(s.mean_after)]
        const signed = [s.mean_before, s.mean_after]
        rms_traces.push({
            type: 'bar',
            name: 'Sensor ' + (ASP_Data[i]!.instance + 1),
            offsetgroup: og,
            alignmentgroup: 'g',
            marker: { color: sensor_line_color(i), opacity: 0.55 },
            hovertemplate: '<extra></extra>RMS %{y:.2f} m/s',
            x: cats,
            y: rms,
            text: rms.map((v) => fmt(v, 2)),
            textposition: 'outside',
            cliponaxis: false,
        })
        mean_traces.push({
            type: 'bar',
            name: 'mean error',
            legendgroup: 'mean',
            offsetgroup: og,
            alignmentgroup: 'g',
            width: 0.16,
            showlegend: i == 0,
            marker: { color: 'rgba(30,30,30,0.8)' },
            customdata: signed,
            hovertemplate: '<extra></extra>mean error %{customdata:.2f} m/s',
            x: cats,
            y: bias,
        })
    }
    // Draw the RMS bars first, then the narrower bias bars on top of them.
    return {
        data: rms_traces.concat(mean_traces),
        layout: {
            barmode: 'group',
            xaxis: { showline: true, mirror: true },
            yaxis: {
                title: { text: 'residual error (m/s)' },
                zeroline: true,
                showline: true,
                mirror: true,
                rangemode: 'tozero',
            },
            showlegend: true,
            margin: { b: 40, l: 60, r: 30, t: 20 },
        },
    }
}

/** Build wind trajectories, uncertainty bands and onboard EKF overlays. */
export function redraw_wind_model(analysis: Analysis): PlotSpec {
    const { fit: fit_result, combined } = analysis
    if (fit_result == null) return { data: [], layout: {} }

    const wm = fit_result
    const t0 = wm.t[0]!
    const tmin = wm.t.map((x) => x - t0)
    const wn = wm.wind_ne.map((w) => w[0]!)
    const we = wm.wind_ne.map((w) => w[1]!)

    // Smoothed wind(t) with 1-sigma bands + onboard EKF overlay
    const wn_hi = wn.map((v, i) => v + wm.wind_sigma[i]![0]!)
    const wn_lo = wn.map((v, i) => v - wm.wind_sigma[i]![0]!)
    const we_hi = we.map((v, i) => v + wm.wind_sigma[i]![1]!)
    const we_lo = we.map((v, i) => v - wm.wind_sigma[i]![1]!)
    const wind_traces: PlotFields[] = [
        {
            x: tmin.concat(tmin.slice().reverse()),
            y: wn_hi.concat(wn_lo.slice().reverse()),
            fill: 'toself',
            fillcolor: 'rgba(31,119,180,0.15)',
            line: { width: 0 },
            hoverinfo: 'skip',
            showlegend: false,
        },
        {
            x: tmin.concat(tmin.slice().reverse()),
            y: we_hi.concat(we_lo.slice().reverse()),
            fill: 'toself',
            fillcolor: 'rgba(255,127,14,0.15)',
            line: { width: 0 },
            hoverinfo: 'skip',
            showlegend: false,
        },
        {
            mode: 'lines',
            name: 'Wn (North)',
            line: { color: '#1f77b4', width: 2 },
            hovertemplate: '<extra></extra>Wn %{y:.2f} m/s',
            x: tmin,
            y: wn,
        },
        {
            mode: 'lines',
            name: 'We (East)',
            line: { color: '#ff7f0e', width: 2 },
            hovertemplate: '<extra></extra>We %{y:.2f} m/s',
            x: tmin,
            y: we,
        },
    ]
    if (combined.wind_n != null) {
        const ekf_wn = linear_interp(combined.wind_n, combined.t, wm.t)
        const ekf_we = linear_interp(combined.wind_e!, combined.t, wm.t)
        wind_traces.push({
            mode: 'lines',
            name: 'EKF Wn',
            line: { color: '#1f77b4', width: 1, dash: 'dot' },
            opacity: 0.6,
            hovertemplate: '<extra></extra>EKF Wn %{y:.2f} m/s',
            x: tmin,
            y: ekf_wn,
        })
        wind_traces.push({
            mode: 'lines',
            name: 'EKF We',
            line: { color: '#ff7f0e', width: 1, dash: 'dot' },
            opacity: 0.6,
            hovertemplate: '<extra></extra>EKF We %{y:.2f} m/s',
            x: tmin,
            y: ekf_we,
        })
    }
    return {
        data: wind_traces,
        layout: {
            title: { text: 'Estimated wind vs onboard EKF wind (drift ' + fmt(wm.wind_drift, 2) + ' m/s)' },
            xaxis: { title: { text: 'time in window (s)' }, zeroline: false, showline: true, mirror: true },
            yaxis: { title: { text: 'wind component (m/s)' }, zeroline: true, showline: true, mirror: true },
            showlegend: true,
            legend: { itemclick: 'toggle', itemdoubleclick: 'toggleothers', orientation: 'h' },
            margin: { b: 50, l: 60, r: 30, t: 40 },
        },
    }
}

/** Use the legacy Plotly categorical palette indices for the flight axes. */
function plot_default_color(i: number): string {
    return ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd'][i]!
}
/** Select the progressively lighter legacy airspeed trace color. */
function airspeed_color(i: number): string {
    return ['#1f77b4', '#6baed6', '#9ecae1', '#c6dbef'][Math.min(i, 3)]!
}
/** Build the original four-axis flight plot and selected time range. */
export function flightPlot(log_data: Flight | null, options: Pick<Options, 'start' | 'end'>): PlotSpec {
    const data: PlotFields[] = []
    const layout: PlotFields = {
        xaxis: {
            title: { text: 'Time (s)' },
            domain: [0.07, 0.93],
            type: 'linear',
            zeroline: false,
            showline: true,
            mirror: true,
            rangeslider: {},
        },
        yaxis: {
            title: { text: 'Airspeed (m/s)' },
            zeroline: false,
            showline: true,
            mirror: true,
            side: 'left',
            position: 0,
            color: '#1f77b4',
        },
        yaxis2: {
            title: { text: 'Ground speed (m/s)' },
            zeroline: false,
            showline: true,
            mirror: true,
            side: 'left',
            position: 0.06,
            color: plot_default_color(2),
            overlaying: 'y',
        },
        yaxis3: {
            title: { text: 'Altitude (m)' },
            zeroline: false,
            showline: true,
            mirror: true,
            side: 'right',
            position: 1,
            color: plot_default_color(3),
            overlaying: 'y',
        },
        yaxis4: {
            title: { text: 'Roll (deg)' },
            zeroline: false,
            showline: true,
            mirror: true,
            side: 'right',
            position: 0.94,
            color: plot_default_color(4),
            overlaying: 'y',
        },
        showlegend: true,
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    if (!log_data) return { data, layout }
    const ASP_Data = log_data.sensors
    layout.xaxis = { ...(layout.xaxis as PlotFields), range: [options.start, options.end], autorange: false }

    /** Add a raw stream with its original units and hover precision. */
    function add_trace(name: string, yaxis: string, color: string, x: number[], y: number[], unit: string, dp: number) {
        data.push({
            mode: 'lines',
            name,
            meta: name,
            yaxis,
            line: { color },
            hovertemplate: '<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.' + dp + 'f} ' + unit,
            x,
            y,
        })
    }

    // Airspeed for each sensor (progressively lighter blue)
    for (let i = 0; i < ASP_Data.length; i++) {
        const d = ASP_Data[i]!
        add_trace('Airspeed ' + (d.instance + 1), 'y', airspeed_color(i), d.time, d.asp_reported, 'm/s', 2)
    }

    // Ground speed from first source
    const s = log_data.sources[0]!
    const gnd = new Array(s.time.length)
    for (let i = 0; i < s.time.length; i++) gnd[i]! = Math.hypot(s.vn[i]!, s.ve[i]!)
    add_trace('Ground speed', 'y2', plot_default_color(2), s.time, gnd, 'm/s', 2)

    // Altitude
    add_trace('Altitude', 'y3', plot_default_color(3), log_data.pos.time, log_data.pos.rel_alt, 'm', 1)

    // Roll angle (a good stand-in for whether the vehicle is loitering)
    if (log_data.att != null) {
        add_trace('Roll', 'y4', plot_default_color(4), log_data.att.time, log_data.att.roll, 'deg', 1)
    }

    return { data, layout }
}
