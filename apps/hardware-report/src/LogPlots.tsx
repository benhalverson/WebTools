import { Fragment, useMemo } from 'react'
import { Plot, type PlotlyApi } from '@webtools/react-workflows'
import type { LogPlot } from './model/log-plots.ts'

interface LogPlotsProps {
    plots: readonly LogPlot[]
    plotly: PlotlyApi | undefined
    byteLength: number
    onError: (error: unknown) => void
}
const config = { displaylogo: false }

/** Render one owned plot with the original heading level and explicit canvas dimensions. */
function ReportPlot({ plot, heading, plotly, byteLength, onError }: Omit<LogPlotsProps, 'plots'> & { plot: LogPlot; heading: 3 | 4 }) {
    const Heading = heading === 3 ? 'h3' : 'h4'
    const layout = useMemo(() => ({ ...plot.layout, width: 800, height: plot.id === 'log_stats' ? 800 : 400 }), [plot])
    return <div><Heading>{plot.title}</Heading>
        {plot.id === 'log_stats' && <p id="LOGSTATS">Total size: {byteLength} Bytes</p>}
        {plot.note && <p style={{ width: 600 }}>{plot.note}</p>}
        <div style={{ width: 800, height: plot.id === 'log_stats' ? 800 : 400 }}>
            {plotly && <Plot id={plot.id} plotly={plotly} data={plot.data} layout={layout} config={config} onError={onError} />}
        </div>
    </div>
}

/** Preserve legacy section order and grouping while shared Plot owns vendor cleanup. */
export function LogPlots({ plots, ...props }: LogPlotsProps) {
    const rates = plots.filter(plot => plot.id.startsWith('UART_') || plot.id.startsWith('CANS_'))
    const groups = [
        { ids: ['Temperature', 'Board_Voltage', 'power_flags'], heading: 3 as const },
        { ids: ['performance_load', 'performance_mem', 'performance_time'], title: 'CPU', id: 'CPU', heading: 4 as const },
        { ids: rates.map(plot => plot.id), title: 'Data Rates', id: 'DataRates', heading: 4 as const },
        { ids: ['stack_mem', 'stack_pct'], title: 'Stack', id: 'Stack', heading: 4 as const },
        { ids: ['log_dropped', 'log_buffer', 'log_stats'], title: 'Log stats', id: 'log_stats_header', heading: 4 as const },
        { ids: ['clock_drift'], heading: 3 as const },
    ]
    return <>{groups.map(group => {
        const selected = group.ids.flatMap(id => plots.filter(plot => plot.id === id))
        if (!selected.length) return null
        const content = selected.map(plot => <ReportPlot key={plot.id} plot={plot} heading={group.heading} {...props} />)
        return <Fragment key={group.ids[0]}>
            {group.title && <h3 id={group.id === 'DataRates' ? undefined : group.id}>{group.title}</h3>}
            {group.id === 'DataRates' ? <div id="DataRates" style={{ margin: '1em 0' }}>{content}</div> : content}
        </Fragment>
    })}</>
}
