import { MAVParam, MAVParamDefinitions } from '@webtools/parameters'

/** One vehicle/account lifetime. The owner must disconnect the model before cancelling transfers. */
export interface ParameterSession {
    model: MAVParam
    definitions: MAVParamDefinitions
    vehicle: string
    /** Cancel outstanding FTP work, completing its callbacks with null. */
    cancel: () => void
    /** Invalidate values and release all transport resources; safe to call repeatedly. */
    dispose: () => void
}
/** Create a fresh session for a connected vehicle identity; never share a model across accounts. */
export type ParameterSessionFactory = (identity: string) => ParameterSession
