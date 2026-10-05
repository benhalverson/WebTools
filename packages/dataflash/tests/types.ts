import type { DataflashLog, FieldValues, FormatIndex, Message } from '../src/index.js'

declare const log: DataflashLog
declare const dynamicField: string
declare const maybeEmpty: '' | 'TimeUS'
declare const lower: Lowercase<string>
declare const upper: Uppercase<string>

// Positive checks cover literal, empty literal, dynamic and union consumers.
const whole: Message | undefined = log.get('GPS', '')
const instance: Message | undefined = log.get_instance('GPS', null, '')
const values: FieldValues | undefined = log.get('GPS', 'TimeUS')
const instanceValues: FieldValues | undefined = log.get_instance('GPS', 0, 'TimeUS')
const dynamic: Message | FieldValues | undefined = log.get('GPS', dynamicField)
const union: Message | FieldValues | undefined = log.get_instance('GPS', 0, maybeEmpty)
const count: number | undefined = log.stats().FMT?.count
const lowercase: Message | FieldValues | undefined = log.get('GPS', lower)
const uppercase: Message | FieldValues | undefined = log.get_instance('GPS', 0, upper)

// These must remain errors: runtime permits a whole message or missing count.
// @ts-expect-error An empty field selects the whole message.
const wrongEmpty: FieldValues | undefined = log.get('GPS', '')
// @ts-expect-error A dynamic string may be empty.
const wrongDynamic: FieldValues | undefined = log.get('GPS', dynamicField)
// @ts-expect-error An instance field can also be empty.
const wrongInstance: FieldValues | undefined = log.get_instance('GPS', 0, dynamicField)
// @ts-expect-error Lowercase<string> also permits the empty string.
const wrongLower: FieldValues | undefined = log.get('GPS', lower)
// @ts-expect-error Uppercase<string> also permits the empty string.
const wrongUpper: FieldValues | undefined = log.get_instance('GPS', 0, upper)
// @ts-expect-error Even an existing stats record can have undefined count.
const wrongCount: number = log.stats().FMT!.count

void [whole, instance, values, instanceValues, dynamic, union, count,
  wrongEmpty, wrongDynamic, wrongInstance, wrongCount, lowercase, uppercase, wrongLower, wrongUpper]


// The constructor and instance indexing expose partial raw-reader state.
const initialFormat: FormatIndex = { Columns: ['TimeUS'], Format: 'Q' }
const instancedFormat: FormatIndex = { ...initialFormat, FormatOffset: [0], InstancesOffsetArray: { '0': [3] } }
const rawBytes: ArrayBuffer | null = log.buffer
const byteLength: number | undefined = log.buffer?.byteLength
const fieldOffset: number | undefined = log.FMT[128]?.FormatOffset?.[0]
const recordOffset: number | undefined = log.FMT[128]?.OffsetArray?.[0]
// @ts-expect-error A newly constructed parser has no buffer.
const unsafeBytes: ArrayBuffer = log.buffer
// @ts-expect-error Initial FMT entries have no format offsets.
const unsafeFieldOffset: number | undefined = initialFormat.FormatOffset[0]
// @ts-expect-error Instance indexing removes the flat record offsets.
const unsafeRecordOffset: number | undefined = instancedFormat.OffsetArray[0]
void [initialFormat, instancedFormat, rawBytes, byteLength, fieldOffset, recordOffset,
  unsafeBytes, unsafeFieldOffset, unsafeRecordOffset]
