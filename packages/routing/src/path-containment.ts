import * as nativePath from 'node:path'

type PathOperations = Pick<typeof nativePath, 'relative' | 'isAbsolute' | 'sep'>

/** Check whether candidate is a strict lexical descendant of base.
 * The native path implementation handles host separators, roots, and drives;
 * callers may supply another implementation to exercise its path semantics.
 * Reject the base itself and parent/sibling paths. This does not inspect the
 * filesystem or resolve symlinks; callers must validate real paths separately.
 */
export function isStrictDescendant(base: string, candidate: string, paths: PathOperations = nativePath): boolean {
    const relative = paths.relative(base, candidate)
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}
