import type { DataflashConstructor } from '@webtools/dataflash'
import { createFormatters } from './cells.ts'
import { parameterDiff, type LogEntry } from './model.ts'
import { TableResources } from './resources.ts'
interface Row { getData(): LogEntry }
interface Table { on(event: string, callback: (sorters: unknown, rows: Row[]) => void): void; getRows(): Row[]; redraw(force: boolean): void; destroy(): void }
interface Column { title: string; field?: string; width?: number; formatter?: string | ((cell: import('./cells.ts').Cell) => unknown); formatterParams?: Record<string, string>; sorter?: string; bottomCalc?: string | false | ((values: unknown[], data: LogEntry[]) => unknown); bottomCalcFormatter?: (cell: import('./cells.ts').Cell) => unknown; headerSort?: boolean }
interface TableOptions { height: string; data: LogEntry[]; index: string; layout: string; columns: Column[]; initialSort: { column: string; dir: string }[] }
/** Mount the pinned table engine while React owns its data and disposal. */
export function mountTable(element: HTMLElement, logs: LogEntry[], parser: DataflashConstructor, ignored: () => readonly boolean[], onError: (error: unknown) => void) {
    const Tabulator = Reflect.get(window, 'Tabulator') as new (element: HTMLElement, options: TableOptions) => Table
    const resources = new TableResources()
    const { buttons, name_format, size_format, flight_time_format, param_diff_format, total_param_diff_calc, get_dist_string, distance_format } = createFormatters(resources, parser, ignored, onError)
        // Tabulator will still show the bottom row if there is only one data row
        // manually disable in this case
        const multiple_rows = logs.length > 1
        const size_bottom_calc = multiple_rows ? "sum" : false
        const flight_time_bottom_calc = multiple_rows ? "sum" : false
        const flight_distance_bottom_calc = multiple_rows ? "sum" : false
        const param_diff_bottom_calc = multiple_rows ? total_param_diff_calc : false

        const table = new Tabulator(element, {
            height: "fit-content",
            data: logs,
            index: "info.rel_path",
            layout: "fitColumns",
            columns: [
                {
                    title: "Date",
                    field: "info.time_stamp",
                    width: 160,
                    formatter:"datetime",
                    formatterParams: {
                        outputFormat: "dd/MM/yyyy hh:mm:ss a",
                        invalidPlaceholder: "No GPS",
                    },
                    sorter:"datetime",
                },
                { title: "Name", field: "info.name", formatter:name_format },
                { title: "Size", field: "info.size", formatter:size_format, bottomCalc:size_bottom_calc, bottomCalcFormatter:size_format, width: 90 },
                { title: "Firmware Version", field:"info.fw_string" },
                { title: "Flight Time", field:"info.flight_time", formatter:flight_time_format, bottomCalc:flight_time_bottom_calc, bottomCalcFormatter:flight_time_format, width: 105 },
                { title: "Flight distance", field:"info.distance_traveled", formatter:distance_format, bottomCalc:flight_distance_bottom_calc, bottomCalcFormatter:get_dist_string, width: 125 },
                { title: "Param Changes", field:"param_diff", formatter:param_diff_format, headerSort:false, width: 110, bottomCalc:param_diff_bottom_calc, bottomCalcFormatter:param_diff_format },
                { title: "" , headerSort:false, formatter:buttons, width: 185 },
            ],
            initialSort: [
                { column:"info.time_stamp", dir:"asc"},
            ]
        })

    /** Recompute differences in displayed order and release the previous rendered cells. */
    function update(rows: Row[] = table.getRows()): void {
        if (!rows.length) return
        rows[0]!.getData().param_diff = null
        for (let index = 1; index < rows.length; index++) {
            rows[index]!.getData().param_diff = parameterDiff(rows[index]!.getData().info.params, rows[index - 1]!.getData().info.params, ignored())
        }
        resources.clearCells()
        table.redraw(true)
    }
    table.on('dataSorted', (_sorters, rows) => update(rows))
    return { update, /** Destroy vendor listeners before releasing all table-owned resources. */
        dispose() { table.destroy(); resources.dispose() } }
}
