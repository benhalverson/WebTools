import { matrixFromEuler, type Matrix3, type Vector3 } from './matrix.ts'
import { findPreset, isCustomRotation } from './presets.ts'

export interface RotationSelection {
    readonly rotation: number
    readonly angles: readonly [string, string, string]
}
export const initialSelection: RotationSelection = { rotation: 0, angles: ['0', '0', '0'] }

/** Standard selections replace displayed angles; both custom slots inherit the
 * current values, matching the legacy shared controls rather than storing slots.
 * Unsupported IDs are programmer errors and never silently become identity.
 */
export function selectRotation(current: RotationSelection, rotation: number): RotationSelection {
    if (isCustomRotation(rotation)) return { ...current, rotation }
    const preset = findPreset(rotation)
    if (!preset) throw new RangeError(`Unsupported rotation: ${rotation}`)
    const [roll, pitch, yaw] = preset.angles
    return { rotation, angles: [String(roll), String(pitch), String(yaw)] }
}

/** Presets use exact discrete matrices. Empty/non-finite custom input fails with
 * an actionable error instead of dispatching NaN coordinates to Plotly.
 */
export function selectionMatrix(selection: RotationSelection): Matrix3 {
    if (isCustomRotation(selection.rotation)) {
        const angles: Vector3 = [
            Number.parseFloat(selection.angles[0]),
            Number.parseFloat(selection.angles[1]),
            Number.parseFloat(selection.angles[2]),
        ]
        return matrixFromEuler(angles)
    }
    const preset = findPreset(selection.rotation)
    if (!preset) throw new RangeError(`Unsupported rotation: ${selection.rotation}`)
    return preset.matrix
}
