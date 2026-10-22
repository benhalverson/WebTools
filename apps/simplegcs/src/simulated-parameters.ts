import { MAVParam } from '@webtools/parameters'
import fixture from '../../../tests/fixtures/params.json' with { type: 'json' }
/** Keep exact authoritative packed bytes and emulate close-time application in the local peer. */
export class SimulatedParameters {
    readonly bytes = Uint8Array.from(fixture.hex.match(/../g)!, byte => parseInt(byte, 16))
    /** Apply validated upload values to their authoritative offsets, preserving readonly behavior. */
    apply(upload: Uint8Array): void {
        const download = upload.slice(), header = new DataView(download.buffer)
        header.setUint16(4, header.getUint16(2, true), true)
        for (const parameter of MAVParam.decode(download).values()) {
            const offset = fixture.offsets[parameter.name as keyof typeof fixture.offsets]?.offset
            if (offset === undefined || parameter.name === 'TEST_READONLY') continue
            const target = new DataView(this.bytes.buffer)
            if (parameter.type === 1) target.setInt8(offset, parameter.value)
            else if (parameter.type === 2) target.setInt16(offset, parameter.value, true)
            else if (parameter.type === 3) target.setInt32(offset, parameter.value, true)
            else target.setFloat32(offset, parameter.value, true)
        }
    }
}
