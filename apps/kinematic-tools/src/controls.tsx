import { ParameterControl } from '@webtools/react-workflows'
import { mainParameters, type Axis, type Mode, type Values } from './model.ts'
interface Props {
    plane: boolean; base: string; axis: Axis; mode: Mode; values: Values; metadata: unknown
    onAxis: (axis: Axis) => void; onMode: (mode: Mode) => void; onValue: (key: string, value: string) => void
}
/** Controlled legacy control groups. Inactive axes retain their input strings;
 * metadata supplies labels, units and descriptions without clamping parameters.
 */
export function Controls({ plane, base, axis, mode, values, metadata, onAxis, onMode, onValue }: Props) {
    const parameters = mainParameters(axis)
    const axes: [Axis, string][] = [['R', 'Roll'], ['P', 'Pitch'], ...(!plane ? [['Y', 'Yaw'] as [Axis, string]] : [])]
    const modes: [Mode, string, string][] = [['angle', 'Angle', 'pos'], ['rate', 'Rate', 'rate'], ...(!plane ? [['angle+rate', 'Angle + Rate', 'pos_rate'] as [Mode, string, string]] : [])]
    /** Keep legacy group hints accessible without owning a global tooltip singleton. */
    function hint(text: string) { return <img src={`${base}images/question-circle.svg`} className="hint" title={text} alt={text} /> }
    /** Render one raw numeric input with the existing bounds and disable rules. */
    function input(key: string, label: string) {
        return <p key={key}><input id={key} type="number" value={values[key] ?? ''} disabled={(key === 'desired_pos' && mode === 'rate') || (key === 'desired_vel' && mode === 'angle')}
            {...(key === 'end_time' ? { min: 0.1, step: 0.1, max: 10 } : {})} onChange={event => onValue(key, event.currentTarget.value)} /><label htmlFor={key}>{label}</label></p>
    }
    /** Apply mode disables to the selected main-axis time constants only. */
    function parameter(name: string) {
        return <ParameterControl key={name} name={name} value={values[name] ?? ''} metadata={metadata} allowValues={plane}
            disabled={!plane && ((name === parameters.rate_tc && mode !== 'rate') || (name === 'ATC_INPUT_TC' && mode === 'rate'))}
            onChange={value => onValue(name, value)} />
    }
    const height = plane ? 150 : 120
    return <table className="controls"><tbody><tr>
        <td><fieldset style={{ width: 60, height }}><legend>Axis {hint('Change the parameters used to the selected axis')}</legend>
            {axes.map(([value, label]) => <p key={value}><input id={`axis_${label.toLowerCase()}`} type="radio" name="axis" value={value} checked={axis === value} onChange={() => onAxis(value)} /><label htmlFor={`axis_${label.toLowerCase()}`}>{label}</label></p>)}
        </fieldset></td>
        <td><fieldset style={{ width: 110, height }}><legend>Mode {hint('Change the parameters used to the selected axis')}</legend>
            {modes.map(([value, label, id]) => <p key={value}><input id={`mode_${id}`} type="radio" name="mode" value={value} checked={mode === value} onChange={() => onMode(value)} /><label htmlFor={`mode_${id}`}>{label}</label></p>)}
        </fieldset></td>
        <td><fieldset style={{ width: 245, height }}><legend>Inputs {hint(`Desired angle and rate from the pilot or ${plane ? 'navigation' : 'position'} controller. End time set the minimum runtime of the simulation.`)}</legend>
            {input('desired_pos', 'Desired angle (deg)')}{input('desired_vel', 'Desired angular rate (deg/s)')}{input('end_time', 'End time (s)')}
        </fieldset></td>
        <td><fieldset style={{ width: 245, height }}><legend>Initial conditions {hint('The angle and rate that the vehicle starts at.')}</legend>
            {input('initial_pos', 'Starting angle (deg)')}{input('initial_vel', 'Starting angular rate (deg/s)')}
        </fieldset></td>
        <td><fieldset className="parameters" style={{ width: 330, height }}><legend>Parameters {hint('The ArduPilot parameters that define the input shaping vehicle model. Note that in some flight modes ATC_SLEW_YAW provides secondary yaw rate limit. Rate time constant also changes for acro mode.')}</legend>
            {plane ? <>
                <div id="roll_params" hidden={axis !== 'R'}>{['RLL2SRV_RMAX', 'RLL2SRV_ACCEL', 'RLL2SRV_TCONST', 'RLL_ANGLE_P'].map(parameter)}</div>
                <div id="pitch_params" hidden={axis !== 'P'}>{['PTCH2SRV_RMAX_UP', 'PTCH2SRV_RMAX_DN', 'PTCH2SRV_ACCEL', 'PTCH2SRV_TCONST', 'PTCH_ANGLE_P'].map(parameter)}</div>
            </> : <>
                {axes.map(([value, label]) => <div key={value} id={`${label.toLowerCase()}_params`} hidden={axis !== value}>{parameter(`ATC_RATE_${value}_MAX`)}{parameter(`ATC_ACC_${value}_MAX`)}</div>)}
                <div id="rp_rate_tc" hidden={axis === 'Y'}>{parameter('ACRO_RP_RATE_TC')}</div><div id="yaw_rate_tc" hidden={axis !== 'Y'}>{parameter('PILOT_Y_RATE_TC')}</div>
                {parameter('ATC_INPUT_TC')}
            </>}
        </fieldset></td>
    </tr></tbody></table>
}
