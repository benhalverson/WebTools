import { find_parameter_metadata, is_parameter_metadata } from '@webtools/parameters'

const result = find_parameter_metadata({ABC: {Description: 7}}, 'ABC')
// @ts-expect-error A raw malformed lookup cannot be used as typed metadata.
result.Description.toUpperCase()
// @ts-expect-error Unknown includes null; callers must narrow before access.
const description: string = find_parameter_metadata({ABC: null}, 'ABC').Description
void description
if (is_parameter_metadata(result)) {
    const safeDescription: string | undefined = result.Description
    void safeDescription
}

// The controller accepts the reviewed transfer manager without casts or transport globals.
import { MAVParam, MAVParamDefinitions } from '@webtools/parameters'
import { createFTPManager } from '@webtools/transfers'
const manager = createFTPManager()
const model = new MAVParam({ ftp: manager })
model.subscribe(state => { const busy: boolean = state.busy; void busy })
model.changes(new Map([['EXAMPLE', 1]]))
// @ts-expect-error Parameter edits must contain numeric values.
model.apply(new Map([['EXAMPLE', '1']]))
// @ts-expect-error Transfers must provide both download and acknowledged upload.
new MAVParam({ ftp: { getFile() {} } })
const definitions = new MAVParamDefinitions({ cache: caches, fetch })
void definitions
import type { ParameterTransfer } from '@webtools/parameters'
declare const completion: Parameters<ParameterTransfer['putFile']>[2]
// @ts-expect-error Upload completion must be an acknowledged byte count or cancellation/failure.
completion(false)
