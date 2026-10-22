import { Fragment } from 'react'
import { downloadFile, type SaveAs } from '@webtools/react-workflows'
import type { EmbeddedFile, ExtractedDownload, WaypointGroup } from './model/log-extractions.ts'

/** Render the exact filenames exposed by the log, saving detached bytes and
 * retaining the legacy incomplete-mission notification before a download. */
export function Extractions({ waypoints, files, saveAs, onError }: {
    waypoints: readonly WaypointGroup[]; files: readonly EmbeddedFile[]
    saveAs: SaveAs | undefined; onError: (cause: unknown) => void
}) {
    /** Use the pinned download boundary, surfacing unavailable vendor resources. */
    function save(blob: Blob, name: string): void {
        try {
            if (!saveAs) throw new Error('Unable to load the download library. Please reload this page.')
            downloadFile(saveAs, blob, name)
        } catch (cause) { onError(cause) }
    }
    /** Warn about a sparse mission and then retain its original serialized bytes. */
    function mission(item: ExtractedDownload): void {
        if (item.incomplete) window.alert('Mission incomplete')
        save(new Blob([item.text], { type: 'text/plain;charset=utf-8' }), item.name)
    }
    return <>
        {waypoints.length > 0 && <><h3>Download Waypoints</h3><div id="WAYPOINTS">{waypoints.map(group => <Fragment key={group.title}>
            <h4>{group.title}</h4><p>{group.downloads.map((item, index) => <Fragment key={item.name}>{index > 0 && ', '}<a title="download file" href="#" onClick={event => { event.preventDefault(); mission(item) }}>{item.name}</a></Fragment>)}</p>
        </Fragment>)}</div></>}
        {files.length > 0 && <><h3>Download Files</h3><p id="FILES">{files.map((file, index) => <Fragment key={file.name}>{index > 0 && ', '}<a title="download file" href="#" onClick={event => { event.preventDefault(); save(new Blob([new Uint8Array(file.contents)]), file.name) }}>{file.name}</a></Fragment>)}</p></>}
    </>
}
