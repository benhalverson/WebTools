import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import type { DataflashLog } from '@webtools/dataflash'
import { pythonInputs } from '../src/dataset.ts'
import { initialConfiguration, presetConfiguration } from '../src/model.ts'
import { wheelResponse } from '../worker/wheel.ts'

const revision = '072046e49c5b0f77226d29e2de82b50772fa75c3'
const legacy = execFileSync('git', ['show', `${revision}:SysID/SysID.js`], { encoding: 'utf8' })
/** Capture the globals passed by unchanged baseline JS; Python is covered by real browser tests. */
async function baseline(config: ReturnType<typeof initialConfiguration>, mode: 'tf' | 'ss', log: DataflashLog): Promise<string> {
    const controls: Record<string, { value: string; checked?: boolean }> = {}
    /** Populate the exact DOM values read by legacy functions. */
    const put = (id: string, value: string, checked?: boolean): void => { controls[id] = checked === undefined ? { value } : { value, checked } }
    for (const [id,value] of Object.entries({ starttime: config.start,endtime: config.end,startfreq: config.frequencyStart,endfreq: config.frequencyEnd,cutofffreq: config.cutoff,customNumerator: config.numerator,customDenominator: config.denominator,tf_params: config.symbols,num_Outputs: String(config.outputs.length),A_order: String(config.matrixA.length),num_params: String(config.parameters.length),num_cons: String(config.constraints.length) })) put(id,value)
    for (const [prefix,signals] of [['input',[config.input]],['output',config.outputs]] as const) signals.forEach((signal,i) => {
        put(`${prefix}_name_${i + 1}`,signal.message); put(`${prefix}_field_${i + 1}`,signal.field)
        if (prefix === 'output') { put(`multiplier_checkbox_${i + 1}`,'',signal.multiplier !== null);put(`multiplier_${i + 1}`,signal.multiplier ?? '');put(`compensation_checkbox_${i + 1}`,'',signal.compensation !== null);put(`axis_dropdown_${i + 1}`,signal.compensation ?? 'Roll') }
    })
    config.parameters.forEach((value,i) => put(`param_name_${i + 1}`,value))
    config.bounds.forEach((row,i) => row.forEach((value,j) => put(`Bound_${j ? 'max' : 'min'}_${i + 1}`,value)))
    config.constraints.forEach((row,i) => row.forEach((value,j) => put(`Constraint_${j ? 'B' : 'A'}_${i + 1}`,value)))
    const globals: Record<string,unknown> = {}
    const context = vm.createContext({ console: { log() {} }, addToOutput() {}, document: {
        /** Resolve legacy scalar fields without modifying baseline code. */
        getElementById: (id: string) => controls[id],
        /** Resolve legacy matrix cells from the same form snapshot. */
        querySelector(selector: string) { const match = selector.match(/#(\w+) input\[name=\w+_r(\d+)_c(\d+)\]/)!; return { value: config[match[1] as 'matrixA'][Number(match[2])]![Number(match[3])]! } },
    }, parser: log })
    vm.runInContext(legacy.slice(legacy.indexOf('// Init pyodide environment')), context)
    context.runtime = { globals: { set(name: string,value: unknown) { globals[name] = value } }, runPython() { throw new Error('captured') } }
    vm.runInContext('pyodide = runtime',context)
    await assert.rejects(vm.runInContext(mode === 'tf' ? 'run_transfer_function_ID(parser)' : 'run_SS_ID(parser)',context), /captured/)
    return JSON.stringify(globals)
}

test('extracted Python is byte-identical to actual branch base', async () => {
    const scripts = [...legacy.matchAll(/await pyodide.runPython\(`([\s\S]*?)`\)/g)].slice(1)
    for (const [i,name] of ['transfer-function','state-space'].entries()) assert.equal(await readFile(new URL(`../src/${name}.py`,import.meta.url),'utf8'),scripts[i]![1])
})
test('Python globals retain exact serialized legacy bytes, including compensation and whitespace', async () => {
    const fields = { TimeUS: new Float64Array([0,1e6,2e6,3e6,4e6]), ROut: new Float64Array([1,2,3,4,5]), Gx: new Float64Array([5,6,7,8,9]), Ay: new Float64Array([3,4,5,6,7]), Roll: new Float64Array([10,20,30,40,50]) }
    const log = { get(_message: string,field: keyof typeof fields) { return fields[field] } } as unknown as DataflashLog
    for (const multiplier of ['0.01745','  ','0',null]) for (const mode of ['tf','ss'] as const) {
        const config = presetConfiguration(initialConfiguration(),'MR_Roll');config.start = '0.5';config.end = '3.5';config.frequencyStart = ' 1 ';config.frequencyEnd = '10';config.cutoff = '20';config.outputs[0]!.multiplier = multiplier;config.numerator = ' K ';config.denominator = 's + a';config.symbols = 'K a'
        const actual = pythonInputs(log,config,mode), expected = JSON.parse(await baseline(config,mode,log))
        // Key insertion order is not Python semantics; each value's serialized bytes must match exactly.
        assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort())
        for (const key of Object.keys(actual)) assert.equal(JSON.stringify(actual[key]),JSON.stringify(expected[key]),key)
    }
})
test('wheel parts preserve exact bytes and do not fetch on HEAD or after cancellation', async () => {
    const calls: string[] = []
    const binding = { async fetch(request: Request) { calls.push(new URL(request.url).pathname); return new Response(new Uint8Array([calls.length,0,255])) } }
    const request = new Request('https://local/SysID/python/scipy.whl')
    assert.deepEqual(new Uint8Array(await wheelResponse(request,binding,['a','b'],'/').arrayBuffer()),new Uint8Array([1,0,255,2,0,255]))
    calls.length = 0
    await wheelResponse(new Request(request,{ method: 'HEAD' }),binding,['a','b'],'/').arrayBuffer(); assert.equal(calls.length,0)
    assert.equal(wheelResponse(new Request(request,{ method: 'POST' }),binding,['a'],'/').status,405)
    const reader = wheelResponse(request,binding,['a','b'],'/').body!.getReader();await reader.read();await reader.cancel();assert.equal(calls.length,1)
})

test('SysID owns only its shared root/prefixed routing mount', async () => {
    const { applicationBase, applicationForPath } = await import('@webtools/routing')
    for (const prefix of ['/', '/Tools/WebTools/']) {
        const base = applicationBase('sysid',prefix)
        for (const path of [base,base.slice(0,-1),base+'runtime.html',base+'python/pyodide.asm.wasm']) assert.equal(applicationForPath(path,prefix),'sysid')
        assert.equal(applicationForPath(base.slice(0,-1)+'Other/',prefix),'portal')
        assert.equal(applicationForPath(prefix+'RotationCheck/',prefix),'rotationCheck')
    }
})

test('numeric result decoder preserves nonfinite values and rejects unrelated wire types', async () => {
    const { identificationResult } = await import('../src/protocol.ts')
    const wire = { frequency: [1,2,3], sourceAmplitude: [['NaN','Infinity','-Infinity']], sourcePhase: [[0,1,2]], fittedAmplitude: [[0,1,2]], fittedPhase: [[0,1,2]], coherence: [[0,1,2]] }
    const result = identificationResult(wire)
    assert.deepEqual(result.sourceAmplitude,[[NaN,Infinity,-Infinity]])
    assert.deepEqual(identificationResult(result),result)
    assert.throws(()=>identificationResult({...wire,frequency:['1']}),TypeError)
    assert.throws(()=>identificationResult({...wire,sourceAmplitude:[[{value:1}]]}),TypeError)
    assert.throws(()=>identificationResult({...wire,coherence:null}),TypeError)
})
