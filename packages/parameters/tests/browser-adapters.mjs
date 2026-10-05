/** Provide the exact Node Buffer/assert subset used by unchanged parameter fixtures in Chromium. */
export function browserAdapters() {
    class TestBuffer extends Uint8Array {
        /** Decode hex fixtures or copy an existing byte array. */
        static from(value, encoding) {
            return encoding === 'hex' ? new TestBuffer(value.match(/../g).map(byte => parseInt(byte, 16))) : new TestBuffer(value);
        }
        /** Allocate zeroed bytes. */
        static alloc(size) { return new TestBuffer(size); }
        /** Concatenate fixture buffers while retaining explicit byte offsets. */
        static concat(buffers) {
            const bytes = new TestBuffer(buffers.reduce((sum, item) => sum + item.length, 0));
            let offset = 0;
            for (const item of buffers) { bytes.set(item, offset); offset += item.length; }
            return bytes;
        }
        /** Access this view's bytes without reading before its byte offset. */
        view() { return new DataView(this.buffer, this.byteOffset, this.byteLength); }
        /** Set a packed uint16 field. */
        writeUInt16LE(value, offset = 0) { this.view().setUint16(offset, value, true); }
        /** Read a packed uint16 field. */
        readUInt16LE(offset = 0) { return this.view().getUint16(offset, true); }
        /** Set a packed float32 fixture value. */
        writeFloatLE(value, offset = 0) { this.view().setFloat32(offset, value, true); }
        /** Serialize fixture bytes exactly as lowercase hex. */
        toString(encoding) {
            if (encoding !== 'hex') throw Error('Unsupported test encoding');
            return [...this].map(value => value.toString(16).padStart(2, '0')).join('');
        }
    }
    /** Compare fixture values recursively, including Maps, undefined, signed zero and byte views. */
    function equalDeep(a, b) {
        if (Object.is(a, b)) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
        if (a instanceof Map || b instanceof Map) return a instanceof Map && b instanceof Map && equalDeep([...a], [...b]);
        const left = Object.keys(a), right = Object.keys(b);
        return equalKeys(left, right) && left.every(key => equalDeep(a[key], b[key]));
    }
    /** Require identical own enumerable key sets before comparing values. */
    function equalKeys(a, b) { return a.length === b.length && a.every(key => b.includes(key)); }
    /** Verify an error exists and satisfies the fixture's optional regular expression. */
    function expectedError(error, expected) {
        if (!error || expected instanceof RegExp && !expected.test(error.message)) throw Error(`Expected ${expected || 'error'}, received ${error}`);
    }
    const assert = {
        /** Check strict scalar equality. */
        equal(a, b, message) { if (!Object.is(a, b)) throw Error(message || `${a} !== ${b}`); },
        /** Check exact structural fixture equality. */
        deepEqual(a, b, message) { if (!equalDeep(a, b)) throw Error(message || 'Deep equality failed'); },
        /** Require a synchronous error. */
        throws(run, expected) {
            let caught;
            try { run(); } catch (error) { caught = error; }
            expectedError(caught, expected);
        },
        /** Require an asynchronous error and optional message pattern. */
        async rejects(promise, expected) {
            let caught;
            try { await promise; } catch (error) { caught = error; }
            expectedError(caught, expected);
        },
    };
    return { assert, Buffer: TestBuffer };
}
