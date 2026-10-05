const fs = require('node:fs');
const path = require('node:path');
/**
 * Create a Vite plugin that preserves the codec's classic-script semantics and
 * jspack's relative import. Each instance retains its resolved Vite configuration.
 * @returns Hooks that rewrite the browser entry and emit unchanged runtime assets.
 */
module.exports = function mavlinkAssets() {
    let base = '/';
    let building = false;
    return {
        name: 'webtools-mavlink-assets',
        /**
         * Capture the final asset base and whether this invocation builds output.
         * @param config Resolved Vite configuration, supplied before transform hooks.
         */
        configResolved(config) { base = config.base; building = config.command === 'build'; },
        /**
         * Point the production browser entry at the emitted classic-script asset.
         * @param code Module source supplied by Vite.
         * @param id Resolved module identifier; query suffixes are ignored for matching.
         * @returns Rewritten entry source, or null for dev mode and unrelated modules.
         * @throws When the entry is built with a relative asset base.
         */
        transform(code, id) {
            if (!building || path.resolve(id.split('?')[0]) !== path.join(__dirname,'browser.mjs')) return null;
            if (!base.startsWith('/') && !/^https?:\/\//.test(base)) throw new Error('MAVLink assets require an absolute Vite base (for example / or /tools/)');
            return {code:code.replace("new URL('./runtime/mavlink.js', import.meta.url).href",JSON.stringify(`${base}mavlink-runtime/mavlink.js`)),map:null};
        },
        /**
         * Emit the pinned codec, jspack, and license without transforming their bytes.
         * Uses Rollup's hook context to retain the relative runtime directory layout.
         * @throws When a required runtime asset cannot be read; the build must fail.
         */
        generateBundle() {
            for (const file of ['mavlink.js','local_modules/jspack/jspack.js','local_modules/jspack/LICENSE']) {
                this.emitFile({type:'asset',fileName:`mavlink-runtime/${file}`,source:fs.readFileSync(path.join(__dirname,'runtime',file))});
            }
        }
    };
};
