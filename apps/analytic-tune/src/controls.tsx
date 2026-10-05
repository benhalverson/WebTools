import { ParameterControl } from '@webtools/react-workflows'
import { parameterDefinitions, parameterVisible, type Axis, type Parameters, type Vehicle } from './parameters.ts'

/** Render all original parameter controls; hidden groups retain their state and export order. */
export function ParameterControls({ values, metadata, vehicle, axis, onChange, harmonicBits }: {
    harmonicBits: number; values: Parameters; metadata: unknown; vehicle: Vehicle; axis: Axis; onChange: (name: string, value: string) => void
}) {
    return <form id="params" onSubmit={event => event.preventDefault()}>
        {['INS Settings', 'First Notch Filter', 'Second Notch Filter', 'Loop Rate', 'Attitude Controller Parameters', 'Controller Notch Filters', 'Notch Inputs'].map((section, sectionIndex) => <fieldset key={section}>
            <legend>{section}</legend>
            {parameterDefinitions.filter(({ name, group }) => {
                if (name.startsWith('INS_HNTCH_')) return sectionIndex === 1
                if (name.startsWith('INS_HNTC2_')) return sectionIndex === 2
                if (name === 'SCHED_LOOP_RATE') return sectionIndex === 3
                if (name === 'GyroSampleRate' || name === 'INS_GYRO_FILTER') return sectionIndex === 0
                if (group.includes('NOTCH') || group.startsWith('FILT')) return sectionIndex === 5
                return group ? sectionIndex === 4 : sectionIndex === 6
            }).map(({ name, group }) => <div key={name} hidden={!parameterVisible(name, group, values, vehicle, axis)}>
                <ParameterControl name={name} value={values[name] ?? ''} metadata={metadata} bitmaskSize={name.endsWith('HMNCS') ? harmonicBits : 32} allowValues={name !== 'SCHED_LOOP_RATE'}
                    disabled={['INS_HNTCH_', 'INS_HNTC2_'].some(prefix => name.startsWith(prefix) && name !== prefix + 'ENABLE' && !(Number(values[prefix + 'ENABLE']) > 0))}
                    onChange={value => onChange(name, value)} />
            </div>)}
        </fieldset>)}
    </form>
}
