/* Deliberately small adapters for the authoritative synchronous Node fixtures. */
/** Supply only the Node APIs used by authoritative fixtures; never open an external connection. */
function browserAdapters(managerSource) {
    class TestBuffer extends Uint8Array {
        /** Allocate zero-filled bytes as Node Buffer.alloc does. */
        static alloc(length) { return new TestBuffer(length); }
        /** Write a fixture header’s unsigned 16-bit little-endian field. */
        writeUInt16LE(value, offset = 0) { new DataView(this.buffer).setUint16(offset, value, true); }
        /** Write a fixture file size as an unsigned 32-bit little-endian field. */
        writeUInt32LE(value, offset = 0) { new DataView(this.buffer).setUint32(offset, value, true); }
        /** Write a signed mission coordinate without numerical conversion. */
        writeInt32LE(value, offset = 0) { new DataView(this.buffer).setInt32(offset, value, true); }
        /** Round a fixture parameter through its authoritative float32 representation. */
        writeFloatLE(value, offset = 0) { new DataView(this.buffer).setFloat32(offset, value, true); }
    }
    const assert = {
        /** Match strict scalar equality, including negative zero and NaN. */
        equal(a, b, message) { if (!Object.is(a, b)) throw Error(message || `${a} !== ${b}`); },
        /** Reject identical scalar values. */
        notEqual(a, b, message) { if (Object.is(a, b)) throw Error(message || `${a} === ${b}`); },
        /** Compare fixture arrays/objects with byte arrays normalized to ordinary arrays. */
        deepEqual(a, b, message) {
            const normalized = value => JSON.stringify(value, (_key, item) => item instanceof Uint8Array ? Array.from(item) : item);
            this.equal(normalized(a), normalized(b), message);
        },
        /** Require a truthy fixture invariant. */
        ok(value, message) { if (!value) throw Error(message || 'Expected truthy value'); },
        /** Report an unexpected fixture branch. */
        fail(message) { throw Error(message); },
    };
    const vm = {
        createContext: context => context,
        runInContext: (_source, context) => new Function('window', 'MAVFTP', 'setTimeout', 'clearTimeout', managerSource)(
            context.window, context.MAVFTP, context.setTimeout, context.clearTimeout),
    };
    /** Execute one synchronous scenario with isolated fake time; restore browser globals even on failure. */
    function runWithTimers(run) {
        const originals = { setTimeout, clearTimeout, setInterval, clearInterval, now: Date.now };
        const after = [];
        const timers = new Map();
        let nextId = 0;
        let now = 1000;
        /** Register a one-shot or repeating callback on the scenario’s isolated clock. */
        const schedule = (callback, delay, interval) => {
            const id = ++nextId;
            timers.set(id, { callback, at: now + delay, interval });
            return id;
        };
        try {
            run({
                after: callback => after.push(callback),
                mock: { timers: {
                    /** Install deterministic time before the fixture constructs its transfer. */
                    enable({ now: start = 1000 }) {
                        now = start;
                        Date.now = () => now;
                        globalThis.setTimeout = (callback, delay) => schedule(callback, delay, 0);
                        globalThis.setInterval = (callback, delay) => schedule(callback, delay, delay);
                        globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id);
                    },
                    /** Advance one Node-style mock tick; new timers wait for the next tick. */
                    tick(ms) {
                        now += ms;
                        // Snapshot: timers created by callbacks belong to the next tick.
                        // eslint-disable-next-line unicorn/no-useless-spread
                        for (const [id, timer] of [...timers]) {
                            if (!timers.has(id) || timer.at > now) continue;
                            if (timer.interval) timer.at = now + timer.interval;
                            else timers.delete(id);
                            timer.callback();
                        }
                    },
                } },
            });
        } finally {
            for (const callback of after) callback();
            Object.assign(globalThis, { setTimeout: originals.setTimeout, clearTimeout: originals.clearTimeout,
                setInterval: originals.setInterval, clearInterval: originals.clearInterval });
            Date.now = originals.now;
        }
    }
    return { assert, Buffer: TestBuffer, vm, runWithTimers };
}
if (typeof module !== 'undefined') module.exports = { browserAdapters };
