import { loadDataflashParser, get_base_log_message_types, get_version_and_board } from './index.js'
/**
 * Inspect a local file through the built browser assets using a fresh parser.
 * @param file Log to read in this page; its bytes are never uploaded.
 * @returns Discovered base messages, instances, first GPS time and log metadata.
 * @throws File-read, import and upstream parse/extraction errors are propagated.
 * The parser and bytes are local to this call; no file reference is retained.
 */
export async function inspectFile(file: File) {
  const Parser = await loadDataflashParser()
  const log = new Parser()
  log.processData(await file.arrayBuffer(), [])
  const gpsInstance = Object.keys(log.messageTypes.GPS?.instances ?? {})[0]
  const gps = log.get_instance('GPS', gpsInstance ?? null, 'TimeUS')
  const instances = Object.fromEntries(Object.entries(log.messageTypes)
    .filter((entry) => entry[1]?.instances !== undefined)
    .map(([name, type]) => [name, type?.instances]))
  return {
    messages: get_base_log_message_types(log), instances,
    firstGpsTime: gps?.[0], start: log.extractStartTime()?.toISOString(),
    metadata: get_version_and_board(log),
  }
}
