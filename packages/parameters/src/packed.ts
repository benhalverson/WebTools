import type { PackedParameter, ParameterValue } from './types.js';

export const DOWNLOAD = '@PARAM/param.pck?withdefaults=1';
export const UPLOAD = '@PARAM/param.pck';
const sizes: Readonly<Record<number, number>> = {1:1, 2:2, 3:4, 4:4};
/** Validate the legacy uppercase, sixteen-character wire name. */
export const validName = (name: string): boolean => /^[A-Z0-9_]{1,16}$/.test(name);
/** Validate integer widths or round to finite float32, preserving legacy errors. */
export const valueForType = (value: number, type: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Value must be a finite number');
    const limits: Readonly<Record<number, readonly [number, number]>> = {1:[-128,127], 2:[-32768,32767], 3:[-2147483648,2147483647]};
    if (type === 4) {
        const result = Math.fround(value);
        if (!Number.isFinite(result)) throw new Error('Value exceeds float32 range');
        return result;
    }
    if (!limits[type] || !Number.isInteger(value) || value < limits[type]![0] || value > limits[type]![1]) {
        throw new Error(`Value does not fit parameter type ${type}`);
    }
    return value;
};
/** Read a validated packed type in little-endian wire order. */
function readValue(view: DataView, offset: number, type: number): number {
    return type === 1 ? view.getInt8(offset) : type === 2 ? view.getInt16(offset,true) :
        type === 3 ? view.getInt32(offset,true) : view.getFloat32(offset,true);
}
/** Write a validated packed value in little-endian wire order. */
function writeValue(view: DataView, offset: number, type: number, value: number): void {
    if (type === 1) view.setInt8(offset,value);
    else if (type === 2) view.setInt16(offset,value,true);
    else if (type === 3) view.setInt32(offset,value,true);
    else view.setFloat32(offset,value,true);
}
/** Decode complete packed downloads including padding and optional defaults; reject malformed records. */
export function decode(data: Uint8Array): Map<string, PackedParameter> {
    if (!(data instanceof Uint8Array) || data.length < 6) throw new Error('Truncated parameter header');
    const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
    const magic = view.getUint16(0,true), count = view.getUint16(2,true), total = view.getUint16(4,true);
    if (![0x671b,0x671c].includes(magic) || count !== total) throw new Error('Invalid or partial parameter file');
    const params = new Map<string, PackedParameter>();
    let offset = 6, previous = '';
    while (offset < data.length) {
        if (data[offset] === 0) { offset++; continue; } // Block padding.
        if (offset + 2 > data.length) throw new Error('Truncated parameter record');
        const type = data[offset]! & 15, flags = data[offset]! >> 4;
        const common = data[offset+1]! & 15, suffix = (data[offset+1]! >> 4) + 1;
        const hasDefault = magic === 0x671c && flags === 1;
        if (!sizes[type] || flags > (magic === 0x671c ? 1 : 0) || common > previous.length || common+suffix > 16) {
            throw new Error('Invalid parameter type, flags or name prefix');
        }
        offset += 2;
        if (offset + suffix + sizes[type]!*(hasDefault ? 2 : 1) > data.length) throw new Error('Truncated parameter value');
        const name = previous.slice(0,common) + String.fromCharCode(...data.subarray(offset,offset+suffix));
        if (!validName(name) || params.has(name)) throw new Error('Invalid or duplicate parameter name');
        offset += suffix;
        const value = valueForType(readValue(view,offset,type),type); offset += sizes[type]!;
        let defaultValue = magic === 0x671c ? value : undefined;
        if (hasDefault) { defaultValue = valueForType(readValue(view,offset,type),type); offset += sizes[type]!; }
        params.set(name,{name,value,type,defaultValue});
        previous = name;
    }
    if (params.size !== count) throw new Error(`Parameter count mismatch: ${params.size} / ${count}`);
    return params;
}
/** Encode sorted changes with prefix compression and the upload byte-length header. */
export function encodeUpload(params: Iterable<ParameterValue>): Uint8Array {
    const list = [...params].sort((a,b)=>a.name.localeCompare(b.name,'en'));
    const chunks = []; let previous = '', length = 6;
    const names = new Set();
    for (const p of list) {
        if (!validName(p.name) || names.has(p.name)) throw new Error('Invalid or duplicate parameter name');
        names.add(p.name);
        const value = valueForType(p.value,p.type);
        let common = 0;
        while (common < Math.min(previous.length,p.name.length,15) && previous[common] === p.name[common]) common++;
        const suffix = p.name.slice(common);
        const bytes = new Uint8Array(2+suffix.length+sizes[p.type]!);
        bytes[0] = p.type; bytes[1] = ((suffix.length-1)<<4)|common;
        bytes.set(new TextEncoder().encode(suffix),2);
        writeValue(new DataView(bytes.buffer),2+suffix.length,p.type,value);
        chunks.push(bytes); length += bytes.length; previous = p.name;
    }
    if (length > 65535 || list.length > 65535) throw new Error('Packed upload exceeds the 65535-byte format limit; split the file');
    const result = new Uint8Array(length), view = new DataView(result.buffer);
    view.setUint16(0,0x671b,true); view.setUint16(2,list.length,true); view.setUint16(4,length,true);
    let offset=6; for (const chunk of chunks) { result.set(chunk,offset); offset+=chunk.length; }
    return result;
}
/** Parse MAVProxy or QGC text, rejecting duplicates and malformed numeric literals. */
export function parseText(text: string): Map<string, number> {
    const values = new Map<string, number>();
    for (const [index,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()) {
        const line = raw.split(/[#;]/,1)[0]!.trim();
        if (!line) continue;
        const fields = line.split(/[\s,=]+/);
        let name = '', value = '';
        if (fields.length === 2) [name,value] = fields as [string, string];
        else if (fields.length === 5 && /^\d+$/.test(fields[0]!) && /^\d+$/.test(fields[1]!)) [, ,name,value] = fields as [string, string, string, string, string];
        else throw new Error(`Line ${index+1}: expected PARAM_NAME VALUE`);
        name = name.toUpperCase();
        if (!validName(name) || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) {
            throw new Error(`Line ${index+1}: invalid name or value`);
        }
        if (values.has(name)) throw new Error(`Line ${index+1}: duplicate ${name}`);
        values.set(name,Number(value));
    }
    if (!values.size) throw new Error('No parameters in file');
    return values;
}
/** Format integers exactly and floats using the shortest float32 round-trip decimal. */
export function formatValue(p: Pick<ParameterValue, "type" | "value">, value=p.value): string {
    // Use the shortest decimal that round-trips to the same float32.
    if (p.type !== 4) return String(value);
    for (let digits=1; digits<=9; digits++) {
        const text = Number(value.toPrecision(digits)).toString();
        if (Math.fround(Number(text)) === value) return text;
    }
    return String(value);
}
/** Serialize parameters in the legacy sorted tab-separated download format. */
export function saveText(params: Iterable<ParameterValue>): string {
    return '# ArduPilot parameters\n' + [...params].sort((a,b)=>a.name.localeCompare(b.name,'en'))
        .map(p=>`${p.name}\t${formatValue(p)}`).join('\n')+'\n';
}
