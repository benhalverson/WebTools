const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const comparisonRevision = '0f4607db3dccbc7d06e5847c02465dab38d1eb80';
/** Read exact committed legacy bytes from the assigned branch base, never the working implementation. */
function legacySource(file) { return execFileSync('git',['show',`${comparisonRevision}:${file}`],{cwd:root,maxBuffer:20*1024*1024}).toString(); }
/** Emulate only presentation controls; actual parser, matrices and all legacy calculations execute unchanged. */
async function reference(bytes, Parser) {
    const elements = new Map();
    /** Minimal element model for the old page's imperative controls. */
    function element(tag = '') {
        return {tag,children:[],style:{},dataset:{},value:'0',checked:false,disabled:false,previousElementSibling:{},
            /** Capture attributes used by selection and priority. */
            setAttribute(name,value) { if(name==='id') elements.set(String(value),this); if(name==='data-index')this.dataset.index=String(value); this[name]=String(value); },
            /** Append presentation nodes without evaluating any calibration. */
            appendChild(node){this.children.push(node);return node;},
            /** Preserve first-child legends when legacy initialization replaces controls. */
            replaceChildren(...nodes){this.children=nodes;},
            /** Legacy attaches callbacks; tests invoke the original functions directly. */
            addEventListener(){}, on(){}, removeAllListeners(){},
        };
    }
    const document = {
        /** Resolve stable presentation nodes by ID. */
        getElementById(id){if(!elements.has(id)) elements.set(id,element());return elements.get(id);},
        createElement:element,
        /** Text cannot affect calculations. */
        createTextNode(text){return {text};},
        /** Resolve checked radio controls using the same name-based selection. */
        querySelector(selector){const name=selector.match(/name="([^"]+)"/)[1];return [...elements.values()].find(value=>value.name===name && value.checked);},
    };
    const warnings=[];const downloads=[];
    const context=vm.createContext({document,console:{log(){},warn(){}},performance,ArrayBuffer,Float64Array,Blob,DataflashParser:Parser,
        alert:message=>warnings.push(message), confirm:()=>true, tippy(){}, open_in_update(){}, parameter_set_value(){},
        plot_default_color:index=>['#1f77b4','#ff7f0e','#2ca02c','#d62728'][index%4],
        Plotly:{purge(){},newPlot(){},redraw(){}},link_plot_axis_range(){},link_plot_reset(){},
        saveAs:(blob,name)=>downloads.push({blob,name}),
    });
    for(const file of ['modules/build/matrix/matrix.umd.js','Libraries/Array_Math.js','Libraries/Param_Helpers.js','Libraries/DecodeDevID.js','MAGFit/quaternion.js','MAGFit/wmm.js'])vm.runInContext(legacySource(file),context,{filename:file});
    // Replace only the browser import readiness hook with the identical pinned parser supplied by the harness.
    const source=legacySource('MAGFit/magfit.js').replace("const import_done = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });",'const import_done = Promise.resolve();');
    vm.runInContext(source,context,{filename:'MAGFit/magfit.js'});
    vm.runInContext('setup_plots()',context);
    await context.load(bytes);
    return {context,document,warnings,downloads,
        /** Run the original calculation entry point with identical analysis controls. */
        calculate(options){
            document.getElementById('TimeStart').value=options.start;document.getElementById('TimeEnd').value=options.end;
            vm.runInContext(`source = null; body_frame_earth_field.forEach((value,index) => value.select.checked = index === ${options.attitude})`,context);
            for(let i=0;i<3;i++)for(const option of ['Check','Fix 90','Fix 45']){const control=elements.get(`MAG${i}orientation${option}`);if(control)control.checked=['Check','Fix 90','Fix 45'].indexOf(option)===(options.orientations[i]??0);}
            vm.runInContext('calculate()',context);
            return this.snapshot();
        },
        /** Copy only numerical results, leaving the oracle's DOM state private. */
        snapshot(){return JSON.parse(vm.runInContext('JSON.stringify({compasses:MAG_Data,earth:earth_field,source:{x:source.x,y:source.y,z:source.z}})',context));},
    };
}
module.exports={reference,legacySource,comparisonRevision};
