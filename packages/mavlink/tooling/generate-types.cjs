const fs = require('node:fs');
const path = require('node:path');
const { mavlink20: mav } = require('../../../modules/MAVLink/mavlink.js');
const root = path.resolve(__dirname, '..');
/**
 * Derive declarations from the pinned codec metadata and handwritten boundary.
 * Instantiates each message only to inspect its field order and wire format;
 * this function does not write files or initialize a transport.
 * @returns Complete deterministic declaration text for build verification or regeneration.
 * @throws When the boundary cannot be read or a message's format and field count disagree.
 */
function generate() {
    const lines = ['// Generated declarations from the pinned runtime metadata; do not hand edit.', fs.readFileSync(path.join(root, 'src/boundary.txt'), 'utf8')];
    const names = Object.keys(mav.messages).filter(name => name !== 'bad_data');
    const args = {};
    const inputFields = {};
    for (const name of names) {
        const message = new mav.messages[name]();
        const formats = [...message._format.slice(1).matchAll(/(\d*)([a-zA-Z])/g)];
        if (formats.length !== message.fieldnames.length) throw new Error(`Unexpected format for ${name}`);
        const fields = message.fieldnames.map((field, index) => {
            const [, count, code] = formats[message.order_map[index]];
            const scalar = code === 'q' || code === 'Q' ? 'Int64' : code === 's' || code === 'c' ? 'string' : 'number';
            const type = code !== 's' && Number(count) > 1 ? `${scalar}[]` : scalar;
            const input = type.replace(/Int64/g, 'Int64Input').replace(/^string$/, 'StringInput');
            return { field, type, input };
        });
        inputFields[name] = fields.map(({field,input}) => `${field}: ${input}`).join('; ');
        args[name] = fields.map(({field, input}) => `${field}?: ${input}`).join(', ');
        lines.push(`export interface ${name} extends MessageBase {`, `    _name: '${message._name}';`, '    _header: Header;', ...fields.map(({field,type}) => `    ${field}: ${type};`), '}');
    }
    lines.push(`export type Message = ${names.join(' | ')};`, 'export type ParsedMessage = Message | BadData;', 'export interface MessageConstructors {');
    for (const name of names) lines.push(`    ${name}: { new(${args[name]}): Outgoing<${name}, { ${inputFields[name]} }> };`);
    lines.push('    bad_data: { new(data: Bytes, reason: string): BadData };', '}', 'export interface Runtime {', '    ready: Promise<void>;', '    messages: MessageConstructors;', '    map: Record<number, { format: string; type: MessageConstructors[keyof Omit<MessageConstructors, "bad_data">]; order_map: number[]; crc_extra: number }>;', '    x25Crc(bytes: Bytes, crc?: number): number;', '    sha256(bytes: Bytes): Uint8Array;', '    create_signature(key: Bytes, bytes: Bytes): Uint8Array;', '    header: { new(msgId: number, mlen?: number, seq?: number, srcSystem?: number, srcComponent?: number, incompat_flags?: number, compat_flags?: number): Header };');
    for (const [key,value] of Object.entries(mav)) if (typeof value === 'number' || typeof value === 'string') lines.push(`    ${key}: ${JSON.stringify(value)};`);
    lines.push('}', 'export declare const mavlink20: Runtime;', '');
    return lines.join('\n');
}
module.exports = { generate };
if (require.main === module) fs.writeFileSync(path.join(root, 'src/index.d.ts'), generate());
