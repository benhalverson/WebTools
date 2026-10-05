import type { Matrix3, Vector3 } from './matrix.ts'

export interface RotationPreset {
    readonly id: number
    readonly label: string
    readonly angles: Vector3
    readonly matrix: Matrix3
}

/** Exact ArduPilot coefficients, including signed zero, from the retained legacy
 * Matrix3.from_rotation convention. Do not regenerate presets from displayed Euler
 * angles: the discrete rotations intentionally use exact zeros and fixed constants.
 */
export const rotationPresets: readonly RotationPreset[] = [
    { id: 0, label: 'None', angles: [0, 0, 0], matrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    { id: 1, label: 'Yaw45', angles: [0, 0, 45], matrix: [[0.7071067811865476, -0.7071067811865476, 0], [0.7071067811865476, 0.7071067811865476, 0], [0, 0, 1]] },
    { id: 2, label: 'Yaw90', angles: [0, 0, 90], matrix: [[-0, -1, -0], [1, 0, 0], [0, 0, 1]] },
    { id: 3, label: 'Yaw135', angles: [0, 0, 135], matrix: [[-0.7071067811865476, -0.7071067811865476, -0], [0.7071067811865476, -0.7071067811865476, 0], [0, 0, 1]] },
    { id: 4, label: 'Yaw180', angles: [0, 0, 180], matrix: [[-1, -0, -0], [-0, -1, -0], [0, 0, 1]] },
    { id: 5, label: 'Yaw225', angles: [0, 0, 225], matrix: [[-0.7071067811865476, 0.7071067811865476, 0], [-0.7071067811865476, -0.7071067811865476, -0], [0, 0, 1]] },
    { id: 6, label: 'Yaw270', angles: [0, 0, 270], matrix: [[0, 1, 0], [-1, -0, -0], [0, 0, 1]] },
    { id: 7, label: 'Yaw315', angles: [0, 0, 315], matrix: [[0.7071067811865476, 0.7071067811865476, 0], [-0.7071067811865476, 0.7071067811865476, 0], [0, 0, 1]] },
    { id: 8, label: 'Roll180', angles: [180, 0, 0], matrix: [[1, 0, 0], [-0, -1, -0], [-0, -0, -1]] },
    { id: 9, label: 'Yaw45Roll180', angles: [180, 0, 45], matrix: [[0.7071067811865476, 0.7071067811865476, 0], [0.7071067811865476, -0.7071067811865476, 0], [-0, -0, -1]] },
    { id: 10, label: 'Yaw90Roll180', angles: [180, 0, 90], matrix: [[0, 1, 0], [1, 0, 0], [-0, -0, -1]] },
    { id: 11, label: 'Yaw135Roll180', angles: [180, 0, 135], matrix: [[-0.7071067811865476, 0.7071067811865476, 0], [0.7071067811865476, 0.7071067811865476, 0], [-0, -0, -1]] },
    { id: 12, label: 'Pitch180', angles: [0, 180, 0], matrix: [[-1, -0, -0], [0, 1, 0], [-0, -0, -1]] },
    { id: 13, label: 'Yaw225Roll180', angles: [180, 0, 225], matrix: [[-0.7071067811865476, -0.7071067811865476, -0], [-0.7071067811865476, 0.7071067811865476, 0], [-0, -0, -1]] },
    { id: 14, label: 'Yaw270Roll180', angles: [180, 0, 270], matrix: [[-0, -1, -0], [-1, -0, -0], [-0, -0, -1]] },
    { id: 15, label: 'Yaw315Roll180', angles: [180, 0, 315], matrix: [[0.7071067811865476, -0.7071067811865476, 0], [-0.7071067811865476, -0.7071067811865476, -0], [-0, -0, -1]] },
    { id: 16, label: 'Roll90', angles: [90, 0, 0], matrix: [[1, 0, 0], [-0, -0, -1], [0, 1, 0]] },
    { id: 17, label: 'Yaw45Roll90', angles: [90, 0, 45], matrix: [[0.7071067811865476, 0, 0.7071067811865476], [0.7071067811865476, 0, -0.7071067811865476], [0, 1, 0]] },
    { id: 18, label: 'Yaw90Roll90', angles: [90, 0, 90], matrix: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] },
    { id: 19, label: 'Yaw135Roll90', angles: [90, 0, 135], matrix: [[-0.7071067811865476, -0, 0.7071067811865476], [0.7071067811865476, 0, 0.7071067811865476], [0, 1, 0]] },
    { id: 20, label: 'Roll270', angles: [270, 0, 0], matrix: [[1, 0, 0], [0, 0, 1], [-0, -1, -0]] },
    { id: 21, label: 'Yaw45Roll270', angles: [270, 0, 45], matrix: [[0.7071067811865476, 0, -0.7071067811865476], [0.7071067811865476, 0, 0.7071067811865476], [-0, -1, -0]] },
    { id: 22, label: 'Yaw90Roll270', angles: [270, 0, 90], matrix: [[-0, -0, -1], [1, 0, 0], [-0, -1, -0]] },
    { id: 23, label: 'Yaw135Roll270', angles: [270, 0, 135], matrix: [[-0.7071067811865476, -0, -0.7071067811865476], [0.7071067811865476, 0, -0.7071067811865476], [-0, -1, -0]] },
    { id: 24, label: 'Pitch90', angles: [0, 90, 0], matrix: [[0, 0, 1], [0, 1, 0], [-1, -0, -0]] },
    { id: 25, label: 'Pitch270', angles: [0, 270, 0], matrix: [[-0, -0, -1], [0, 1, 0], [1, 0, 0]] },
    { id: 26, label: 'Yaw90Pitch180', angles: [0, 180, 90], matrix: [[-0, -1, -0], [-1, -0, -0], [-0, -0, -1]] },
    { id: 27, label: 'Yaw270Pitch180', angles: [0, 180, 270], matrix: [[0, 1, 0], [1, 0, 0], [-0, -0, -1]] },
    { id: 28, label: 'Pitch90Roll90', angles: [90, 90, 0], matrix: [[0, 1, 0], [-0, -0, -1], [-1, -0, -0]] },
    { id: 29, label: 'Pitch90Roll180', angles: [180, 90, 0], matrix: [[-0, -0, -1], [-0, -1, -0], [-1, -0, -0]] },
    { id: 30, label: 'Pitch90Roll270', angles: [270, 90, 0], matrix: [[-0, -1, -0], [0, 0, 1], [-1, -0, -0]] },
    { id: 31, label: 'Pitch180Roll90', angles: [90, 180, 0], matrix: [[-1, -0, -0], [-0, -0, -1], [-0, -1, -0]] },
    { id: 32, label: 'Pitch180Roll270', angles: [270, 180, 0], matrix: [[-1, -0, -0], [0, 0, 1], [0, 1, 0]] },
    { id: 33, label: 'Pitch270Roll90', angles: [90, 270, 0], matrix: [[-0, -1, -0], [-0, -0, -1], [1, 0, 0]] },
    { id: 34, label: 'Pitch270Roll180', angles: [180, 270, 0], matrix: [[0, 0, 1], [-0, -1, -0], [1, 0, 0]] },
    { id: 35, label: 'Pitch270Roll270', angles: [270, 270, 0], matrix: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] },
    { id: 36, label: 'Yaw90Pitch180Roll90', angles: [90, 180, 90], matrix: [[0, 0, 1], [-1, -0, -0], [-0, -1, -0]] },
    { id: 37, label: 'Yaw270Roll90', angles: [90, 0, 270], matrix: [[-0, -0, -1], [-1, -0, -0], [0, 1, 0]] },
    { id: 38, label: 'Yaw293Pitch68Roll180', angles: [90, 68.8, 293.3], matrix: [[0.14303897231223747, 0.3687764865032038, -0.9184463813430871], [-0.3321327777966474, -0.8562894214664188, -0.3955455025629652], [-0.9323238012155122, 0.3616245700820924, 2.214311861220361e-17]] },
    { id: 39, label: 'Pitch315', angles: [0, 315, 0], matrix: [[0.7071067811865476, 0, -0.7071067811865476], [0, 1, 0], [0.7071067811865476, 0, 0.7071067811865476]] },
    { id: 40, label: 'Pitch315Roll90', angles: [90, 315, 0], matrix: [[0.7071067811865476, -0.7071067811865476, 0], [-0, -0, -1], [0.7071067811865476, 0.7071067811865476, 0]] },
    { id: 41, label: 'Pitch7', angles: [0, 7, 0], matrix: [[0.992546151641322, 0, 0.12186934340514749], [0, 1, 0], [-0.12186934340514749, 0, 0.992546151641322]] },
    { id: 42, label: 'Roll45', angles: [45, 0, 0], matrix: [[1, 0, 0], [0, 0.7071067811865476, -0.7071067811865476], [0, 0.7071067811865476, 0.7071067811865476]] },
    { id: 43, label: 'Roll315', angles: [315, 0, 0], matrix: [[1, 0, 0], [0, 0.7071067811865476, 0.7071067811865476], [0, -0.7071067811865476, 0.7071067811865476]] },
]

/** Looks up supported standard rotations; custom IDs are intentionally absent. */
export function findPreset(id: number): RotationPreset | undefined {
    return rotationPresets.find(preset => preset.id === id)
}

/** Both legacy custom slots share the currently displayed angles. */
export function isCustomRotation(id: number): boolean {
    return id === 101 || id === 102
}
