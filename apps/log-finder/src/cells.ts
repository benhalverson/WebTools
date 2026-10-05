import type { DataflashConstructor } from '@webtools/dataflash'
import { get_param_download_text, param_to_string } from '@webtools/parameters'
import { availableDestinations, transferFile } from '@webtools/react-workflows'
import { parameterDiff, type LogEntry } from './model.ts'
import { readFile } from './directory.ts'
import { vendors, type Tooltip } from './vendors.ts'
import type { TableResources } from './resources.ts'
export interface Cell { getRow(): { getData(): LogEntry } }
/** Build cell renderers scoped to one table’s resource lifetime. */
export function createFormatters(resources: TableResources, DataflashParser: DataflashConstructor, ignored: () => readonly boolean[], onError: (error: unknown) => void) {
    const L = vendors().leaflet
// custom formatter to add a param download button
        /** Download the final parameter values using the exact shared serializer. */
        function param_download_button(cell: Cell) {

            /** Serialize the selected log and retain its basename for download. */

            function save_parameters() {
                const log = cell.getRow().getData()
                const params = log.info.params

                if (Object.keys(params).length == 0) {
                    return
                }

                // Get contents of file to download
                const text = get_param_download_text(params)

                // make sure there are no slashes in file name
                let log_file_name = log.info.name.replace(/.*[/\\]/, '')

                // Replace the file extension
                const file_name = (log_file_name.substr(0, log_file_name.lastIndexOf('.')) || log_file_name) + ".param"

                // Save
                var blob = new Blob([text], { type: "text/plain;charset=utf-8" })
                resources.download(blob, file_name)
            }

            let button = document.createElement("input")
            button.setAttribute('value', 'Parameters')
            button.setAttribute('type', 'button')
            button.addEventListener("click", save_parameters)
            button.disabled = Object.keys(cell.getRow().getData().info.params).length == 0

            return button
        }

        // custom formatter to add a open in button
        /** Offer only destinations allowed by this log’s available messages. */
        function open_in_button(cell: Cell) {

            // Button to hold tool tip
            let button = document.createElement("input")
            button.setAttribute('value', 'Open In')
            button.setAttribute('type', 'button')

            /** Return the original File without changing its bytes or name. */

            function get_file_fun() {
                return cell.getRow().getData().fileHandle
            }

            const content = document.createElement('div')
            for (const destination of availableDestinations(window.location.pathname)) {
                const input = document.createElement('input')
                input.type = 'button'
                input.value = destination.name
                input.style.margin = '3px 0'
                input.disabled = !destination.enabled(cell.getRow().getData().info.available_log_messages)
                input.onclick = () => resources.transfers.add(transferFile(get_file_fun(), destination))
                content.append(input, document.createElement('br'))
            }


            resources.tip(button, {
                content: content,
                placement: 'left',
                interactive: true,
                appendTo: () => document.body,
            })
            return button
        }

        // Formatter to add custom buttons
        /** Show legacy crash, watchdog and disabled arming warnings. */
        function check_warnings(cell: Cell) {
            const log = cell.getRow().getData()
            const arming_checks_disabled = (("ARMING_SKIPCHK" in log.info.params) && log.info.params.ARMING_SKIPCHK! > 0) ||(("ARMING_CHECK" in log.info.params) && log.info.params.ARMING_CHECK === 0)
            if (!arming_checks_disabled && !log.info.watchdog && !log.info.crash_dump) {
                // Nothing to warn about
                return
            }

            let img = document.createElement("img")
            img.style.width = "20px"
            img.style.verticalAlign = "bottom"

            if (log.info.crash_dump || log.info.watchdog) {
                img.src = "images/exclamation-triangle-red.svg"

            } else {
                // Arming checks 0
                img.src = "images/exclamation-triangle-orange.svg"

            }

            let tippy_div = document.createElement("div")

            if (log.info.crash_dump) {
                const para = document.createElement("p")
                tippy_div.appendChild(para)
                para.appendChild(document.createTextNode("Crash Dump file detected."))
                para.appendChild(document.createElement("br"))
                para.appendChild(document.createTextNode("For more information see ArduPilot "))

                const link = document.createElement("a")
                link.href = "https://ardupilot.org/copter/docs/common-watchdog.html#crash-dump"
                link.appendChild(document.createTextNode("documentation"))
                link.style.color="red"

                para.appendChild(link)
                para.appendChild(document.createTextNode("."))
            }

            if (log.info.watchdog) {
                const para = document.createElement("p")
                tippy_div.appendChild(para)
                para.appendChild(document.createTextNode("Watchdog reboot detected."))
                para.appendChild(document.createElement("br"))
                para.appendChild(document.createTextNode("For more information see ArduPilot "))

                const link = document.createElement("a")
                link.href = "https://ardupilot.org/copter/docs/common-watchdog.html#independent-watchdog-and-crash-dump"
                link.appendChild(document.createTextNode("documentation"))
                link.style.color="red"

                para.appendChild(link)
                para.appendChild(document.createTextNode("."))
            }

            if (arming_checks_disabled) {
                const para = document.createElement("p")
                tippy_div.appendChild(para)
                para.appendChild(document.createTextNode("Arming checks disabled."))
            }

            resources.tip(img, {
                content: tippy_div,
                placement: 'left',
                interactive: true,
                appendTo: () => document.body,
            })

            return img
        }

        // Formatter to add custom buttons
        /** Compose the action column without changing its spacing. */
        function buttons(cell: Cell) {
            let div = document.createElement("div")
            div.appendChild(param_download_button(cell))
            div.appendChild(document.createTextNode(" "))
            div.appendChild(open_in_button(cell))

            const warning = check_warnings(cell)
            if (warning != null) {
                div.appendChild(document.createTextNode(" "))
                div.appendChild(warning)
            }
            return div
        }

        // Name formatter to add path on tooltip
        /** Display the basename with the complete relative path in a tooltip. */
        function name_format(cell: Cell) {
            let div = document.createElement("div")
            const file = cell.getRow().getData().fileHandle
            if (file == null) {
                return
            }
            div.appendChild(document.createTextNode(file.name))

            resources.tip(div, {
                content: cell.getRow().getData().info.rel_path,
                interactive: true,
                appendTo: () => document.body,
            })

            return div
        }

        // Make file size a nice string with units
        /** Render binary file-size units with two decimals. */
        function size_format(cell: Cell) {
            const size = cell.getRow().getData().info.size
            const unit_array = ['B', 'kB', 'MB', 'GB', 'TB']
            const unit_index = (size == 0) ? 0 : Math.floor(Math.log(size) / Math.log(1024))
            const scaled_size = size / Math.pow(1024, unit_index)
            return scaled_size.toFixed(2) + " " + unit_array[unit_index]
        }

        // Make flight time a nice string with units
        /** Render elapsed cumulative flight time with pinned Luxon formatting. */
        function flight_time_format(cell: Cell) {
            const flight_time = cell.getRow().getData().info.flight_time
            if (flight_time == null) {
                return "Unknown"
            }

            // Try human readable
            if (flight_time == 0) {
                return "-"
            }
            const dur = vendors().luxon.Duration.fromMillis(flight_time * 1000)
            return dur.rescale().toHuman({listStyle: 'narrow', unitDisplay: 'short'})

            // Might like this better, not sure
            //return dur.toFormat("hh:mm:ss")
        }

        // Format a param diff count and popup with details
        /** Render counts and sorted detail sections for adjacent parameter differences. */
        function param_diff_format(cell: Cell) {
            const diff = cell.getRow().getData().param_diff
            if (diff == null) {
                return "-"
            }

            const count = Object.keys(diff.added).length + Object.keys(diff.missing).length + Object.keys(diff.changed).length
            const count_div = document.createElement("div")
            count_div.appendChild(document.createTextNode(String(count)))

            let tippy_div = document.createElement("div")
            if (count == 0) {
                tippy_div.appendChild(document.createTextNode("No change"))

            } else {
                tippy_div.style.width = '325px'
                tippy_div.style.maxHeight = '90vh'
                tippy_div.style.overflow = 'auto'

                // Sort alphabetically, localeCompare does underscores differently to built in sort
                /** Order parameter names with the legacy numeric locale comparison. */
                function param_sort(a: string, b: string) {
                    return a.localeCompare(b, undefined, {numeric: true})
                }

                if (Object.keys(diff.added).length > 0) {


                    const details = document.createElement("details")
                    details.setAttribute("open", '');
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("New:"))
                    details.appendChild(summary)

                    for (const name of Object.keys(diff.added).sort(param_sort)) {
                        const text = name + ": " + param_to_string(diff.added[name]!)
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }

                if (Object.keys(diff.missing).length > 0) {
                    const details = document.createElement("details")
                    details.setAttribute("open", '');
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("Missing:"))
                    details.appendChild(summary)

                    for (const name of Object.keys(diff.missing).sort(param_sort)) {
                        const text = name + ": " + param_to_string(diff.missing[name]!)
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }

                if (Object.keys(diff.changed).length > 0) {
                    const details = document.createElement("details")
                    details.setAttribute("open", '');
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("Changed:"))
                    details.appendChild(summary)

                    for (const name of Object.keys(diff.changed).sort(param_sort)) {
                        const text = name + ": " + param_to_string(diff.changed[name]!.from) + " => " + param_to_string(diff.changed[name]!.to)
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }
            }

            resources.tip(count_div, {
                content: tippy_div,
                maxWidth: '350px',
                placement: 'left',
                interactive: true,
                appendTo: () => document.body,
            })

            return count_div
        }

        // Find the param diff between the first and last row
        /** Retain the legacy bottom-row first-versus-last parameter direction. */
        function total_param_diff_calc(_values: unknown[], data: LogEntry[]) {
            const len = data.length
            if (len <= 1) {
                return null
            }
            return parameterDiff(data[len-1]!.info.params, data[0]!.info.params, ignored())
        }

        /** Format distance using the legacy two-kilometre threshold. */

        function get_dist_string(cell: Cell) {
            const dist_m = cell.getRow().getData().info.distance_traveled
            if (dist_m == null) {
                return "-"
            }
            if (dist_m < 2000) {
                return dist_m.toFixed(2) + " m"
            }
            const dist_km = dist_m / 1000.0
            return dist_km.toFixed(2) + " km"
        }

        /** Lazily preview positions when the optional map library is available. */

        function distance_format(cell: Cell) {

            if (cell.getRow().getData().info.distance_traveled == null) {
                return "-"
            }

            const div = document.createElement("div")
            div.appendChild(document.createTextNode(get_dist_string(cell)))

            // Add map tool tip
            /** Allocate one map and cancellable file read for this tooltip. */
            function tippy_show(instance: Tooltip) {

                if (instance.props.content !== "") {
                    // Content already loaded
                    return
                }

                let tippy_div = document.createElement("div")
                instance.setContent(tippy_div)

                tippy_div.style.width = '500px';
                tippy_div.style.height = '500px';

                let map = L!.map(tippy_div)

                L!.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                }).addTo(map)

                resources.maps.add(map)
                const file = cell.getRow().getData().fileHandle
                const signal = resources.signal
                void readFile(file, signal).then(bytes => {
                    if (signal.aborted) return
                    const log = new DataflashParser()
                    log.processData(bytes, [])
                    if (!('POS' in log.messageTypes)) return
                    const lat = log.get('POS', 'Lat') as Float64Array
                    const lng = log.get('POS', 'Lng') as Float64Array
                    const points: [number, number][] = Array.from(lat, (value, index) => [value * 1e-7, lng[index]! * 1e-7])
                    const polyline = L!.polyline(points).addTo(map)
                    map.fitBounds(polyline.getBounds())
                }).catch(error => { if (!signal.aborted) onError(error) })

            }

            if (typeof L !== 'undefined') {
                // Add map tool tip if leaflet is available
                resources.tip(div, {
                    maxWidth: '750px',
                    placement: 'left',
                    delay: [500, 0],
                    interactive: true,
                    appendTo: () => document.body,
                    onShow: tippy_show
                })
            }

            return div
        }


    return { buttons, name_format, size_format, flight_time_format, param_diff_format, total_param_diff_calc, get_dist_string, distance_format }
}
