const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { mavlink20, MAVLink20Processor } = require('@webtools/mavlink');

for (const format of ['require', 'import']) {
    test(`${format} consumer downloads and uploads through an isolated queue`, async t => {
        const { MAVFTP, createFTPManager } = format === 'require' ? require('@webtools/transfers') : await import('@webtools/transfers');
        const client = new MAVLink20Processor(null, 255, 190);
        const server = new MAVLink20Processor(null, 42, 1);
        const packetCodec = new MAVFTP(client, { send() {} });
        const manager = createFTPManager();
        const other = createFTPManager();
        const pending = [];
        const expected = Uint8Array.from({ length: 301 }, (_, i) => i & 255);
        const uploaded = new Uint8Array(expected.length);
        const results = [];
        manager.setLink(client, { send: bytes => pending.push(packetCodec.parseOp(server.decode(bytes).payload)) }, 42, 1);
        t.after(() => manager.clearLink());
        manager.getFile('@PARAM/param.pck', data => results.push(data), { sizeIsEstimate: true, fixedReadSize: true });
        manager.putFile('@PARAM/param.pck', expected, size => results.push(size));
        assert.equal(other.isBusy(), false);
        assert.equal(manager.queuedCount(), 1);
        /** Deliver a simulated ACK/NAK through real packet encoding and decoding. */
        function reply(request, payload = new Uint8Array(), { offset = request.offset, opcode = 128, seq = request.seq + 1 } = {}) {
            const op = packetCodec.packOp(seq & 65535, request.session, opcode, payload.length, request.opcode, 0, offset, payload);
            const message = new mavlink20.messages.file_transfer_protocol(0, 255, 190, Array.from(op));
            manager.handleMessage(client.decode(Uint8Array.from(message.pack(server))));
        }
        for (let steps = 0; pending.length && steps < 30; steps++) {
            const request = pending.shift();
            switch (request.opcode) {
                case 4: reply(request, Uint8Array.of(80, 0, 0, 0)); break;
                case 15:
                    reply(request, expected.subarray(0, 80));
                    reply(request, Uint8Array.of(6), { offset: expected.length, opcode: 129, seq: request.seq + 2 });
                    break;
                case 5: reply(request, expected.subarray(request.offset, request.offset + request.size)); break;
                case 7: uploaded.set(request.payload, request.offset); reply(request); break;
                case 6: case 1: reply(request); break;
                default: assert.fail(`Unexpected opcode ${request.opcode}`);
            }
        }
        assert.deepEqual(results, [expected, expected.length]);
        assert.deepEqual(uploaded, expected);
        assert.equal(manager.isBusy(), false);
        assert.equal(manager.queuedCount(), 0);
        assert.equal(pending.length, 0);
    });
}

test('legacy Node helper retains its offline usage path', () => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../../SimpleGCS/node_ftp.js')], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: node node_ftp.js/);
});
