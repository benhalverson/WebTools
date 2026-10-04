/* Shared by Node and Chromium. Source fixtures are read unchanged from tests/.
   Tracing snapshots complete packets and outcomes, never just a payload hash. */
/** Collect unchanged fixture cases with injected exports and exact packet/result observation.
 * Does not execute cases or modify fixture source; the runner owns timers and isolation.
 */
function collectFixtures({ source, managerSource, codec, implementation, trace, assert, Buffer, vm }) {
    /** Freeze observations before later packet processing mutates their backing arrays. */
    const snapshot = value => JSON.parse(JSON.stringify(value, (_key, item) => {
        if (item instanceof Uint8Array) return Array.from(item);
        return item === undefined ? { undefined: true } : item;
    }));
    class TracedFTP extends implementation.MAVFTP {
        /** Observe every transmitted packet before forwarding to the fixture’s transport. */
        constructor(processor, transport) {
            super(processor, { send(bytes) {
                trace.push(['send', Date.now(), Array.from(bytes)]);
                return transport.send(bytes);
            } });
        }
        /** Snapshot outcomes before legacy cleanup or callbacks can mutate state. */
        complete(data) {
            trace.push(['complete', snapshot(data)]);
            return super.complete(data);
        }
    }
    class TracedParser extends implementation.MissionParser {
        /** Capture complete decoded mission values for differential comparison. */
        parseMission(data) {
            const result = super.parseMission(data);
            trace.push(['mission', snapshot(result)]);
            return result;
        }
        /** Capture grouped fence values and validation failures for comparison. */
        parseFence(data) {
            const result = super.parseFence(data);
            trace.push(['fence', snapshot(result)]);
            return result;
        }
    }
    const observedAssert = Object.fromEntries(['equal', 'notEqual', 'deepEqual', 'ok', 'fail'].map(name => [name, (...args) => {
        trace.push([name, snapshot(args)]);
        return assert[name](...args);
    }]));
    const scenarios = [];
    const dependencies = {
        'node:test': (name, run) => scenarios.push([name, run]),
        'node:assert/strict': observedAssert,
        'node:fs': { readFileSync: () => managerSource },
        'node:vm': implementation.createFTPManager ? {
            createContext: context => context,
            runInContext: (_source, context) => {
                context.window.FTPManager = implementation.createFTPManager((processor, transport) => new context.MAVFTP(processor, transport));
            },
        } : vm,
        '../modules/MAVLink/mavlink.js': codec,
        '../modules/MAVLink/mavftp.js': { MAVFTP: TracedFTP, MissionParser: TracedParser },
    };
    /** Resolve only the explicit test-only dependencies of the authoritative source. */
    const requireFixture = name => {
        if (!(name in dependencies)) throw new Error(`Unexpected fixture dependency: ${name}`);
        return dependencies[name];
    };
    new Function('require', 'Buffer', source)(requireFixture, Buffer);
    return scenarios;
}
if (typeof module !== 'undefined') module.exports = { collectFixtures };
