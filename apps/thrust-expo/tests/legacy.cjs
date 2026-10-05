const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const revision = 'ac32dd6815808a5f3f4894e155c8cfdb72a715f4';

/** Reads the actual pre-migration revision, never a rewritten implementation oracle. */
function source(file) {
    return execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

/** Runs unchanged owned legacy calculations against controllable DOM and vendor boundaries. */
function legacyReference() {
    const elements = {};
    let rows = [];
    let downloaded;
    const context = vm.createContext({
        Blob, console,
        document: {
            /** Provides legacy mutable input properties without browser formatting differences. */
            getElementById(id) {
                return elements[id] ??= { value: '',
                    /** Mirrors the metadata change path used by example loading. */
                    dispatchEvent() { vm.runInContext(`params.${id}.value = parseFloat(document.getElementById('${id}').value); updatePlotData()`, context); },
                };
            },
            /** Selects only owned parameter controls during reset. */
            querySelectorAll() { return Object.entries(elements).filter(([id]) => /^(MOT_|MOTOR_|COPTER_)/.test(id)).map(([id, element]) => ({ ...element, id })); },
            /** Initialization is explicitly controlled by the oracle. */
            addEventListener() {},
        },
        window: { /** Leaves browser lifecycle outside the numerical oracle. */ addEventListener() {} },
        Plotly: {
            /** Plot rendering cannot alter the numerical oracle. */ purge() {},
            /** Plot rendering cannot alter the numerical oracle. */ newPlot() {},
            /** Trace mutations are captured from the legacy plot state directly. */ react() {},
            /** Capture is limited to authored layout fields. */ relayout() {},
        },
        /** Retains precisely the blob bytes selected by the original download handler. */
        saveAs(blob) { downloaded = blob; },
        Event: class { /** Creates the legacy change event shape. */ constructor(type) { this.type = type; } },
    });
    for (const file of ['Libraries/Array_Math.js', 'Libraries/Param_Helpers.js', 'ThrustExpo/ThrustExpo.js']) vm.runInContext(source(file), context, { filename: file });
    context.table = {
        /** Exposes identical measurement values to the legacy fitter. */ getData() { return rows; },
        /** Retains built-in example rows exactly as authored. */ setData(value) { rows = value; },
    };
    vm.runInContext('thrustTable = table; for (const [id, entry] of Object.entries(params)) {entry.value = entry.default; document.getElementById(id).value = entry.default;} initThrustExpoPlot(); initThrustErrorPlot(); initThrustPwmPlot();', context);
    return {
        /** Loads the unchanged example and its original default hover mass. */
        example() { vm.runInContext('loadExample()', context); return this.snapshot(); },
        /** Replays a parameter change including the intentional zero-expo truthiness behavior. */
        parameter(id, value) {
            context.changedValue = value;
            vm.runInContext(`params.${id}.value = changedValue; document.getElementById('${id}').value = changedValue; updatePlotData(${id === 'MOT_THST_EXPO' ? 'changedValue' : ''})`, context);
            return this.snapshot();
        },
        /** Replaces measurements without normalization so string, zero and invalid rows stay distinct. */
        rows(value) { rows = value; vm.runInContext('updatePlotData()', context); return this.snapshot(); },
        /** Reads the public table contents for editing scenarios. */
        data() { return JSON.parse(JSON.stringify(rows)); },
        /** Captures all owned traces, markers and formatted parameter values. */
        snapshot() {
            return JSON.parse(vm.runInContext('JSON.stringify({expo: String(document.getElementById("MOT_THST_EXPO").value), hover: String(document.getElementById("MOT_THST_HOVER").value ?? ""), plots: [thrustExpoPlot, thrustErrorPlot, thrustPwmPlot].map(p => ({data: p.data ?? [], shapes: p.layout.shapes, annotations: p.layout.annotations}))})', context));
        },
        /** Returns byte-exact parameter serialization from the original save function. */
        async download() { vm.runInContext('saveParamFile()', context); return Buffer.from(await downloaded.arrayBuffer()); },
    };
}
module.exports = { legacyReference, revision, source };
