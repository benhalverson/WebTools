import type { Plugin } from 'vite'
/** Test-only instrumentation of the actual entry lifecycle; absent from ordinary dev/build output. */
export function mountHarness(): Plugin {
    return {
        name: 'sysid-test-mount', enforce: 'pre',
        /** Expose cleanup only in explicit browser-test builds, leaving App and React execution unchanged. */
        transform(code, id) {
            if (!id.endsWith('/src/main.tsx')) return undefined
            if (!code.endsWith('mount(root)\n')) throw new Error('SysID mount instrumentation no longer matches entry')
            return "import { identificationResult } from './protocol.ts'; window.__sysidDecode = identificationResult;\n" + code.replace(/mount\(root\)\n$/, 'window.__sysidMount = () => mount(root); window.__sysidUnmount = mount(root)\n')
        },
    }
}
