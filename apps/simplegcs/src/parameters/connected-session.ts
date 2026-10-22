import { MAVParam, MAVParamDefinitions, type ParameterTransfer } from '@webtools/parameters'
import type { createFTPManager } from '@webtools/transfers'
import type { ParameterSession } from './session.ts'

/** Borrow the operations owner's single FTP queue for one discovered vehicle lifetime. */
export function connectedParameters(manager: ReturnType<typeof createFTPManager>, vehicleType: number): ParameterSession {
    const tag = 'parameters'
    const ftp: ParameterTransfer = {
        /** Queue exact packed-download options behind mission and fence work. */
        getFile(path, callback, options) { manager.getFile(path, callback, { ...options, tag }) },
        /** Queue acknowledged upload bytes on the same packet sequence and transport. */
        putFile(path, bytes, callback, options) { manager.putFile(path, bytes, callback, { ...options, tag }) },
    }
    const model = new MAVParam({ ftp })
    let disposed = false
    return { model, definitions: new MAVParamDefinitions(), vehicle: MAVParam.vehicleName(vehicleType),
        /** Cancel only parameter jobs; command downloads retain their queue positions. */
        cancel() { model.cancelPending(); manager.cancelByTag(tag) },
        /** Invalidate asynchronous model work before completing its transfer callbacks. */
        dispose() { if (disposed) return; disposed = true; model.disconnect(); manager.cancelByTag(tag) },
    }
}
