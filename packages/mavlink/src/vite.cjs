const fs = require('node:fs');
const path = require('node:path');
/** Preserve classic-script semantics and jspack's relative import in Vite builds. */
module.exports = function mavlinkAssets() {
    let base = '/';
    let building = false;
    return {
        name: 'webtools-mavlink-assets',
        configResolved(config) { base = config.base; building = config.command === 'build'; },
        transform(code, id) {
            if (!building || path.resolve(id.split('?')[0]) !== path.join(__dirname,'browser.mjs')) return null;
            if (!base.startsWith('/') && !/^https?:\/\//.test(base)) throw new Error('MAVLink assets require an absolute Vite base (for example / or /tools/)');
            return {code:code.replace("new URL('./runtime/mavlink.js', import.meta.url).href",JSON.stringify(`${base}mavlink-runtime/mavlink.js`)),map:null};
        },
        generateBundle() {
            for (const file of ['mavlink.js','local_modules/jspack/jspack.js','local_modules/jspack/LICENSE']) {
                this.emitFile({type:'asset',fileName:`mavlink-runtime/${file}`,source:fs.readFileSync(path.join(__dirname,'runtime',file))});
            }
        }
    };
};
