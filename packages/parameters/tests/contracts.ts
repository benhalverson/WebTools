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
