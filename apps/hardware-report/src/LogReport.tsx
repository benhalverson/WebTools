import { Fragment, useEffect, useState } from 'react'
import { metadataTransport } from './metadata-transport.ts'
import type { LogHardwareReport } from './model/log-report.ts'
import {
    releaseMetadata,
    type MetadataFetch,
    type Release,
    type Link,
} from './model/log-metadata.ts'
/** Render line-separated legacy report text using React-owned nodes. */
function Lines({ lines }: { lines: readonly string[] }) {
    return (
        <>
            {lines.map((line, i) => (
                <Fragment key={i}>
                    {i > 0 && <br />}
                    {line}
                </Fragment>
            ))}
        </>
    )
}
/** Render official metadata links without interpreting provider HTML. */
function Links({ links }: { links: readonly Link[] }) {
    return (
        <>
            {links.map((link, i) => (
                <Fragment key={i}>
                    {i > 0 && ', '}
                    <a href={link.url}>{link.name}</a>
                </Fragment>
            ))}
        </>
    )
}
/** Own metadata cancellation across log replacement, hash changes and unmount. */
function ReleaseCheck({
    hash,
    request,
}: {
    hash: string
    request: MetadataFetch | null | undefined
}) {
    const [release, setRelease] = useState<Release | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        let active = true
        /** Resolve optional vendor readiness without reviving an unmounted report. */
        async function check(): Promise<void> {
            const transport = request === undefined ? await metadataTransport() : request
            if (!active) return
            const result = await releaseMetadata(hash, controller.signal, transport)
            if (active) setRelease(result)
        }
        void check().catch(() => { /* Aborted report work has no UI owner. */ })
        return () => {
            active = false
            controller.abort()
        }
    }, [hash, request])
    if (!release) return <br />
    return (
        <>
            <br />
            <Lines lines={release.text.split('\n')} />
            {release.links && (
                <>
                    {release.text === 'Official release:' && <br />}
                    <Links links={release.links} />
                </>
            )}
            {!!release.branches?.length && (
                <>
                    <br />
                    Branches @ HEAD: <Links links={release.branches} />
                </>
            )}
            {release.branchError && (
                <>
                    <br />
                    {release.branchError}
                </>
            )}
        </>
    )
}
/** Parse checked-in board identifiers with legacy prefix removal and last-definition precedence. */
export function parseBoardTypes(text: string): Record<number, string> {
    const boards: Record<number, string> = {}
    for (const line of text.match(/[^\r\n]+/g) ?? []) {
        const match = line.match(/(^[-\w]+)\s+(\d+)/)
        if (match)
            boards[Number(match[2])] = match[1]!
                .replace(/^TARGET_HW_/, '')
                .replace(/^EXT_HW_/, '')
                .replace(/^AP_HW_/, '')
    }
    return boards
}
/** Display all remaining log-driven report sections with independent metadata request ownership. */
export function LogReport({
    report,
    assetBase,
    request,
    area = 'beforeSensors',
}: {
    report: LogHardwareReport
    assetBase: string
    request?: MetadataFetch | null
    area?: 'beforeSensors' | 'afterSensors'
}) {
    const [boards, setBoards] = useState<Record<number, string>>({})
    useEffect(() => {
        if (area === 'afterSensors') return
        const controller = new AbortController()
        let active = true
        void (request ?? fetch)(`${assetBase}board_types.txt`, {
            signal: controller.signal,
        })
            .then((response) => (response.ok ? response.text() : ''))
            .then((text) => {
                if (active) setBoards(parseBoardTypes(text))
            })
            .catch(() => {})
        return () => {
            active = false
            controller.abort()
        }
    }, [assetBase, request, area])
    const { version, can, watchdogs, internalErrors, iomcu } = report
    const drivers = [...new Set(can.map((node) => node.driver))]
    return (
        <>
            {area === 'beforeSensors' && version.fw_string != null && (
                <>
                    <h3>Firmware</h3>
                    <div id="VER">
                        {version.fw_string}
                        {version.os_string != null && (
                            <>
                                <br />
                                {version.os_string}
                            </>
                        )}
                        {version.fw_hash && (
                            <ReleaseCheck
                                key={version.fw_hash}
                                hash={version.fw_hash}
                                request={request}
                            />
                        )}
                    </div>
                </>
            )}
            {area === 'beforeSensors' &&
                (version.flight_controller != null ||
                    version.board_id != null) && (
                    <>
                        <h3>Flight Controller</h3>
                        <div id="FC">
                            {version.flight_controller}
                            {version.flight_controller != null &&
                                version.board_id != null && (
                                    <>
                                        <br />
                                        <br />
                                    </>
                                )}
                            {version.board_id != null && (
                                <>
                                    Board ID: {version.board_id}
                                    {boards[version.board_id] &&
                                        ` ${boards[version.board_id]}`}
                                </>
                            )}
                        </div>
                    </>
                )}
            {area === 'beforeSensors' && watchdogs.length > 0 && (
                <>
                    <h3>Watchdog</h3>
                    <div id="WDOG">
                        {watchdogs.map((watchdog, i) => (
                            <Fragment key={i}>
                                {i > 0 && <br />}
                                {watchdogs.length > 1 && (
                                    <h4>Watchdog {i + 1}</h4>
                                )}
                                <Lines lines={watchdog.lines} />
                                <br />
                                Fault ICS Register:{' '}
                                <details
                                    style={{
                                        display: 'inline',
                                        verticalAlign: 'top',
                                    }}
                                >
                                    <summary>
                                        0x{watchdog.icsr.toString(16)}
                                    </summary>
                                    <Lines lines={watchdog.icsrLines} />
                                    <br />
                                </details>
                                <br />
                                <Lines lines={watchdog.tail} />
                            </Fragment>
                        ))}
                    </div>
                </>
            )}
            {area === 'beforeSensors' && internalErrors.length > 0 && (
                <>
                    <h3>Internal Errors</h3>
                    <div id="InternalError">
                        <Lines lines={internalErrors} />
                    </div>
                </>
            )}
            {area === 'beforeSensors' && iomcu.length > 0 && (
                <>
                    <h3>IOMCU</h3>
                    <div id="IOMCU">
                        <Lines lines={iomcu} />
                    </div>
                </>
            )}
            {area === 'afterSensors' && can.length > 0 && (
                <>
                    <h3>DroneCAN devices</h3>
                    <div id="DroneCAN">
                        {drivers.map((driver) => (
                            <Fragment key={driver}>
                                {driver !== 'all' && <h4>Driver {driver}:</h4>}
                                <table>
                                    <tbody>
                                        <tr>
                                            {can
                                                .filter(
                                                    (node) =>
                                                        node.driver === driver,
                                                )
                                                .map((node, i) => (
                                                    <td key={i}>
                                                        <fieldset>
                                                            <legend>
                                                                Node id{' '}
                                                                {node.node}
                                                            </legend>
                                                            Name: {node.name}
                                                            <br />
                                                            Firmware version:{' '}
                                                            {node.version}
                                                            {node.name.startsWith(
                                                                'org.ardupilot',
                                                            ) && (
                                                                <ReleaseCheck
                                                                    hash={
                                                                        node.hash
                                                                    }
                                                                    request={
                                                                        request
                                                                    }
                                                                />
                                                            )}
                                                            <br />
                                                            UID1: 0x
                                                            {node.uid1.toString(
                                                                16,
                                                            )}
                                                            <br />
                                                            UID2: 0x
                                                            {node.uid2.toString(
                                                                16,
                                                            )}
                                                        </fieldset>
                                                    </td>
                                                ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </Fragment>
                        ))}
                    </div>
                </>
            )}
        </>
    )
}

/** Render warnings in original discovery order, including each embedded crash dump. */
export function LogWarnings({
    warnings,
    watchdog,
    crashFiles,
    assetBase,
}: {
    warnings: readonly string[]
    watchdog: boolean
    crashFiles: readonly string[]
    assetBase: string
}) {
    const entries = [
        ...warnings.map((text) => ({
            text,
            icon: 'orange',
            anchor: undefined,
        })),
        ...(watchdog
            ? [
                  {
                      text: 'Watchdog reboot detected, see Watchdog section.',
                      icon: 'red',
                      anchor: 'independent-watchdog-and-crash-dump',
                  },
              ]
            : []),
        ...crashFiles.map(() => ({
            text: 'Crash dump file detected.',
            icon: 'red',
            anchor: 'crash-dump',
        })),
    ]
    if (!entries.length) return null
    return (
        <>
            <h3>Warnings</h3>
            <div id="warnings">
                {entries.map((entry, i) => (
                    <table key={i}>
                        <tbody>
                            <tr>
                                <td>
                                    <img
                                        src={`${assetBase}images/exclamation-triangle-${entry.icon}.svg`}
                                        width="40"
                                        className="warning-icon"
                                        alt="Warning"
                                    />
                                </td>
                                <td>
                                    {entry.text}
                                    {entry.anchor && (
                                        <>
                                            <br />
                                            For more information see ArduPilot{' '}
                                            <a
                                                href={`https://ardupilot.org/copter/docs/common-watchdog.html#${entry.anchor}`}
                                            >
                                                documentation
                                            </a>
                                            .
                                        </>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                ))}
            </div>
        </>
    )
}
