import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import vm from 'node:vm'
import { blankRows, calculate, defaultParameters, parameterFile, parseParameterFile, type Calculation, type CalculationState, type ThrustRow } from '../src/model.ts'
import { exampleRows } from '../src/example.ts'

// This is the actual pre-migration main revision, not a generated expected-value implementation.
const comparisonRevision = 'ac32dd6815808a5f3f4894e155c8cfdb72a715f4'
/** Read immutable legacy source from the recorded comparison revision. */
function legacySource(path: string): string {
    return execFileSync('git', ['show', `${comparisonRevision}:${path}`], { encoding: 'utf8' })
}
const pageSource = legacySource('ThrustExpo/ThrustExpo.js')
const arraySource = legacySource('Libraries/Array_Math.js')
const parameterSource = legacySource('Libraries/Param_Helpers.js')

/** Construct an isolated oracle that runs original owned page functions and captures their actual plot/export outputs. */
function oracle() {
    const fields: Record<string, { value: string }> = { MOT_THST_HOVER: { value: '' }, MOT_THST_EXPO: { value: '0.65' } }
    let saved: Blob | undefined
    const context = vm.createContext({
        Blob,
        document: { addEventListener() {}, getElementById(id: string) { return fields[id] } },
        window: { addEventListener() {} },
        Plotly: { react() {}, relayout() {} },
        saveAs(blob: Blob) { saved = blob },
    })
    vm.runInContext(arraySource + '\n' + parameterSource + '\n' + pageSource, context)
    vm.runInContext('Object.values(params).forEach(param => param.value = param.default); thrustErrorPlot.layout={shapes:[{}]}; thrustPwmPlot.layout={};', context)
    return {
        /** Run the retained recalculation functions after substituting only external table/control inputs. */
        calculate(rows: readonly ThrustRow[], state: CalculationState, forced?: number | null): Calculation {
            context.rows = rows
            context.inputParameters = state.parameters
            context.savedHover = state.saveHover
            context.forced = forced
            fields.MOT_THST_HOVER!.value = state.hoverDisplay
            vm.runInContext('for (const name in inputParameters) params[name].value = inputParameters[name]; params.MOT_THST_HOVER.save=savedHover; thrustTable={getData:()=>rows}; updatePlotData(forced);', context)
            const value = vm.runInContext(`({state:{parameters:Object.fromEntries(Object.entries(params).map(([name,param])=>[name,param.value])),saveHover:params.MOT_THST_HOVER.save,hoverDisplay:document.getElementById('MOT_THST_HOVER').value},expoData:thrustExpoPlot.data,errorData:thrustErrorPlot.data,pwmData:thrustPwmPlot.data,gradientMean:thrustErrorPlot.layout.shapes[0].visible ? thrustErrorPlot.layout.shapes[0].y0 : null})`, context) as Calculation
            return structuredClone(value)
        },
        /** Execute the original Blob download path and read its exact UTF-8 payload. */
        async file(): Promise<string> {
            vm.runInContext('saveParamFile()', context)
            assert.ok(saved)
            return saved.text()
        },
    }
}

/** Build fresh reset state for independent fit comparisons. */
function initial(): CalculationState {
    return { parameters: defaultParameters(), saveHover: false, hoverDisplay: '' }
}

/** Compare all original curve coordinates and parameters exactly; unchanged operation order needs no numerical tolerance. */
async function compare(rows: readonly ThrustRow[], state: CalculationState, forced?: number | null): Promise<Calculation> {
    const legacy = oracle()
    const expected = legacy.calculate(rows, state, forced)
    const actual = calculate(rows, state, forced)
    assert.deepEqual(actual.state, expected.state)
    assert.deepEqual(actual.expoData, expected.expoData)
    assert.deepEqual(actual.errorData, expected.errorData)
    assert.deepEqual(actual.pwmData, expected.pwmData)
    assert.equal(actual.gradientMean, expected.gradientMean)
    assert.equal(parameterFile(actual.state), await legacy.file())
    return actual
}

test('published measurements match immutable legacy fixture and fitted series/export bytes exactly', async () => {
    const context = vm.createContext({ document: { addEventListener() {}, getElementById() { return { dispatchEvent() {} } } }, window: { addEventListener() {} }, Event: class {} })
    vm.runInContext(pageSource, context)
    vm.runInContext('updatePlotData=()=>{}; thrustTable={setData:data=>globalThis.example=data}; loadExample();', context)
    assert.deepEqual(exampleRows, structuredClone(context.example))
    const state = initial()
    state.parameters.COPTER_AUW = 2.5
    await compare(exampleRows, state)
    for (const expo of [0, -0.75, 0.65, 1, -1]) await compare(exampleRows, state, expo)
})

test('sparse, zero, malformed, single-row and unsorted measurements retain legacy behavior', async () => {
    /** Supply a stand row while leaving optional measured channels empty. */
    const row = (pwm: ThrustRow['pwm'], thrust: ThrustRow['thrust']): ThrustRow => ({ pwm, thrust, voltage: '', current: '' })
    for (const rows of [blankRows(), [row(1000, 0), row('1000', '0'), row('', 5), row(undefined, 1), row('bad', 2), row(2000, 2)], [row(1400, 1)], [row(1000, 0.2), row(1800, 1.7), row(1300, 0.5), row(2000, 2)], [row(' ', ' ')]]) {
        await compare(rows, initial())
    }
})

test('hover rounding, endpoint clamping and stale saved estimate survive subsequent invalid data and zero mass', async () => {
    let state = initial()
    for (const mass of [2.5, 100, 0.001, 0]) {
        state = { ...state, parameters: { ...state.parameters, COPTER_AUW: mass } }
        state = (await compare(exampleRows, state)).state
    }
    assert.equal(state.saveHover, true)
    assert.equal(state.hoverDisplay, '')
    await compare(blankRows(), state)
})

test('parameter parser preserves file order, duplicates and parseFloat semantics', () => {
    assert.deepEqual(parseParameterFile('MOT_PWM_MIN,1100suffix\nMOT_THST_EXPO,0\nMOT_PWM_MIN,1200\nUNKNOWN,1\nMOT_SPIN_ARM,\n MOT_SPIN_MAX,0.9'), [
        { name: 'MOT_PWM_MIN', value: 1100 }, { name: 'MOT_THST_EXPO', value: 0 }, { name: 'MOT_PWM_MIN', value: 1200 }, { name: 'MOT_SPIN_ARM', value: NaN },
    ])
})

/** Create genuine retained event handlers with DOM-like number-input string coercion for reducer comparisons. */
function eventOracle() {
    const context = vm.createContext({ Blob, document: { addEventListener() {} }, window: { addEventListener() {} }, Plotly: { react() {}, relayout() {} }, load_param_inputs() {}, Event: class { type: string; /** Store the event name consumed by retained handlers. */ constructor(type: string) { this.type = type } } })
    vm.runInContext(arraySource + '\n' + parameterSource + '\n' + pageSource, context)
    vm.runInContext(`
        const controls=Object.fromEntries(Object.entries(params).map(([name,param])=>[name,{
            id:name, name, stored: param.default == null ? '' : String(param.default), listeners:{},
            get value(){return this.stored}, set value(value){ this.stored = value == null || !Number.isFinite(Number(value)) ? '' : String(value) },
            addEventListener(event,callback){this.listeners[event]=callback},
            dispatchEvent(event){this.listeners[event.type]?.call(this,event)}
        }]));
        controls.paramFile={addEventListener(){}};
        document.getElementById=name=>controls[name];
        document.querySelectorAll=()=>Object.values(controls).filter(control=>control.id);
        Object.values(params).forEach(param=>param.value=param.default);
        let storedRows=[];
        thrustTable={getData:()=>storedRows, setData:rows=>{storedRows=rows}};
        thrustErrorPlot.layout={shapes:[{}]};
        Plotly.purge=()=>{}; Plotly.newPlot=()=>{};
        Plotly.relayout=(_plot,changes)=>{thrustPwmPlot.layout.xaxis.range=changes['xaxis.range']};
        initThrustPwmPlot();
        initParamInputs();
    `, context)
    return {
        /** Replay native input/change dispatch order without sharing reducer logic with the oracle. */
        event(name: string, value: string, user: boolean) {
            context.name = name; context.value = value; context.user = user
            vm.runInContext(`controls[name].value=value; if(user)controls[name].dispatchEvent(new Event('input')); controls[name].dispatchEvent(new Event('change'));`, context)
        },
        /** Replace table input and invoke the original data-change recalculation. */
        rows(rows: readonly ThrustRow[]): void {
            context.nextRows = rows
            vm.runInContext('thrustTable.setData(nextRows); updatePlotData();', context)
        },
        /** Execute the original reset rather than reconstructing its intended behavior. */
        reset(): void { vm.runInContext('reset()', context) },
        /** Read the range actually passed to Plotly initialization or relayout. */
        pwmRange(): [number, number] {
            return structuredClone(vm.runInContext('thrustPwmPlot.layout.xaxis.range', context))
        },
        /** Return the externally visible form and independently maintained parameter storage. */
        snapshot(): { inputs: Record<string, string>; parameters: Record<string, number | null> } {
            return structuredClone(vm.runInContext(`({inputs:Object.fromEntries(Object.entries(params).map(([name])=>[name,controls[name].value])), parameters:Object.fromEntries(Object.entries(params).map(([name,param])=>[name,param.value]))})`, context))
        },
    }
}

test('spin-min native edits and change-only file events match retained original handlers', async () => {
    const { initialState, reduce } = await import('../src/state.ts')
    let state = initialState()
    const legacy = eventOracle()
    for (const event of [
        { name: 'MOT_SPIN_MIN', value: '0.25', user: false },
        { name: 'MOT_SPIN_ARM', value: '0.2', user: false },
        { name: 'MOT_SPIN_MIN', value: '0.1', user: true },
        { name: 'MOT_SPIN_MIN', value: '0.35', user: true },
        { name: 'MOT_PWM_MIN', value: '1100', user: false },
        { name: 'MOT_SPIN_ARM', value: '0.4', user: true },
    ] as const) {
        legacy.event(event.name, event.value, event.user)
        if (event.user) {
            state = reduce(state, { type: 'edit', name: event.name, value: event.value })
            state = reduce(state, { type: 'commit', name: event.name })
        } else state = reduce(state, { type: 'import', text: `${event.name},${event.value}` })
        const expected = legacy.snapshot()
        assert.deepEqual(state.inputs, expected.inputs)
        assert.deepEqual(state.calculation.state.parameters, expected.parameters)
    }
})


test('PWM axis retains the actual last plotted range through reset and empty-data parameter edits', async () => {
    const { initialState, reduce } = await import('../src/state.ts')
    const legacy = eventOracle()
    let state = initialState()
    assert.deepEqual(state.calculation.pwmRange, legacy.pwmRange())
    legacy.rows(exampleRows)
    state = reduce(state, { type: 'rows', rows: [...exampleRows] })
    for (const [name, value] of [['MOT_PWM_MIN', '1100'], ['MOT_PWM_MAX', '1900']] as const) {
        legacy.event(name, value, true)
        state = reduce(reduce(state, { type: 'edit', name, value }), { type: 'commit', name })
        assert.deepEqual(state.calculation.pwmRange, legacy.pwmRange())
    }
    assert.deepEqual(legacy.pwmRange(), [1100, 1900])
    legacy.reset()
    state = reduce(state, { type: 'reset' })
    assert.deepEqual(state.calculation.pwmRange, legacy.pwmRange())
    assert.deepEqual(state.calculation.state.parameters, legacy.snapshot().parameters)
    assert.deepEqual(state.inputs, legacy.snapshot().inputs)
    legacy.event('MOT_PWM_MIN', '1200', true)
    state = reduce(reduce(state, { type: 'edit', name: 'MOT_PWM_MIN', value: '1200' }), { type: 'commit', name: 'MOT_PWM_MIN' })
    assert.deepEqual(state.calculation.pwmRange, legacy.pwmRange())
    assert.deepEqual(state.calculation.pwmRange, [1100, 1900])
    assert.deepEqual(state.calculation.state.parameters, legacy.snapshot().parameters)
    legacy.rows(exampleRows)
    state = reduce(state, { type: 'rows', rows: [...exampleRows] })
    assert.deepEqual(state.calculation.pwmRange, legacy.pwmRange())
    assert.deepEqual(state.calculation.pwmRange, [1200, 2000])
})
