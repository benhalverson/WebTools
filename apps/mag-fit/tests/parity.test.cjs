const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const {reference,legacySource}=require('./legacy.cjs');
const root=path.resolve(__dirname,'../../..');
/** Compare exact serialized numbers; identical arithmetic and vendor require no tolerance in this runtime. */
function exact(expected,actual,label){assert.equal(JSON.stringify(actual),JSON.stringify(expected),label);}
/** Compare all calibration vectors, diagnostics and coordinate arrays against independent legacy execution. */
function compareFit(expected,actual){
    for(const compass of actual.compasses){const old=expected.compasses[compass.index];
        exact(old.params.offsets,compass.params.offsets,'recorded offsets');exact(old.expected,compass.expected,'expected field and bins');exact(old.raw,compass.raw,'raw field');exact(old.rotated,compass.rotated,'rotated field');
        exact(old.rotation,compass.rotation,'orientation');exact(old.coverage.value,compass.coverage,'coverage');
        for(const key of ['error','yaw','mean_error'])exact(old.orig[key],compass.orig[key],'existing '+key);
        for(let index=0;index<compass.fits.length;index++)for(const type of ['offsets','scale','iron']){
            const fit=compass.fits[index][type],oldFit=old.fits[index][type];exact(oldFit.params,fit.params,`${index} ${type} calibration`);assert.equal(Boolean(oldFit.valid),fit.valid);
            if(fit.valid)for(const key of ['x','y','z','error','yaw','mean_error'])exact(oldFit[key],fit[key],`${index} ${type} ${key}`);
        }
    }
    exact(expected.source,{x:actual.source.x,y:actual.source.y,z:actual.source.z},'source field');
}
test('recorded logs preserve numerical fits and parameter bytes against exact branch-base legacy',async()=>{
    globalThis.self={addEventListener(){}};
    const {loadDataflashParser}=await import('../../../packages/dataflash/dist/index.js');const Parser=await loadDataflashParser();
    const {readLog}=await import('../src/log.ts');const {calculateFit}=await import('../src/fit.ts');
    const {calculatedSelection,exportParameters,toggleChoice,choices}=await import('../src/selection.ts');
    const matrixContext=vm.createContext({});vm.runInContext(legacySource('modules/build/matrix/matrix.umd.js'),matrixContext);
    for(const file of ['packages/dataflash/fixtures/plane-4.6.2-prefix.BIN','apps/mag-fit/tests/fixtures/plane-4.6.2.BIN']){
        const buffer=await fs.readFile(path.join(root,file));const bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
        const parser=new Parser();parser.processData(bytes,[]);const log=readLog(parser,matrixContext.mlMatrix);const oracle=await reference(bytes,Parser);
        exact(oracle.snapshot().earth,log.earth,'earth model');
        for(const attitude of log.attitudes.keys())for(const orientation of [0,1,2])for(const cropped of [false,true]){
            const options={start:log.start+(cropped?(log.end-log.start)*.2:0),end:log.end-(cropped?(log.end-log.start)*.2:0),attitude,orientations:[orientation,0,0]};
            vm.runInContext('for (const mag of MAG_Data) if (mag) for (const motor of mag.fits) for (const type of ["offsets","scale","iron"]) motor[type].show.checked = false',oracle.context);
            const actual=calculateFit(log,options,matrixContext.mlMatrix);const expected=oracle.calculate(options);compareFit(expected,actual);
            let selection=calculatedSelection(actual.compasses);const output=exportParameters(actual.compasses,selection,[0,0,0],()=>true);
            vm.runInContext('save_parameters()',oracle.context);const download=oracle.downloads.at(-1);assert.equal(download.name,'MAGFit.param');assert.equal(await download.blob.text(),output.text,'exact serialized export bytes');
            for(const compass of actual.compasses)for(const choice of choices(compass).filter(choice=>!choice.original && choice.result.valid)){
                selection=toggleChoice(selection,choice.key,true);
                const [instance,fitIndex,type]=choice.key.split(':');
                vm.runInContext(`MAG_Data[${instance}].fits[${fitIndex}].${type}.show.checked = true; update_hidden(MAG_Data[${instance}].fits[${fitIndex}].${type}.show)`,oracle.context);
                for(const useOption of [1,2]){
                    for(const [index,label] of ['No change','Use',"Don't use"].entries())oracle.document.getElementById(`MAG${instance}use${label}`).checked=index===useOption;
                    const overrides=[0,0,0];overrides[compass.index]=useOption;
                    const changed=exportParameters(actual.compasses,selection,overrides,()=>true);
                    vm.runInContext('save_parameters()',oracle.context);
                    assert.equal(await oracle.downloads.at(-1).blob.text(),changed.text,'last-selected calibration and use override bytes');
                }
                for(const [index,label] of ['No change','Use',"Don't use"].entries())oracle.document.getElementById(`MAG${instance}use${label}`).checked=index===0;
            }

        }
    }
});

test('quaternion presets and immutable magnetic tables retain exact legacy values',async()=>{
    const {createHash}=require('node:crypto');
    const bytes=await fs.readFile(path.join(__dirname,'fixtures/plane-4.6.2.BIN'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),'9eb715d612bf4ddd06e956e2a26bf75932946903c13528774410a28bd5563096');
    const migrated=await fs.readFile(path.join(__dirname,'../src/magnetic-data.ts'),'utf8');
    assert.equal(migrated.replaceAll('export const ','const ').trimEnd(),legacySource('MAGFit/wmm.js').split('function interpolate_table')[0].trimEnd());
    const {Quaternion,slerp,right_angle_rotation}=await import('../src/quaternion.ts');
    const {expected_earth_field_lat_lon}=await import('../src/magnetic-model.ts');
    const context=vm.createContext({});vm.runInContext(legacySource('MAGFit/quaternion.js')+legacySource('MAGFit/wmm.js'),context);
    for(let rotation=0;rotation<=103;rotation++){
        const quaternion=new Quaternion();context.rotation=rotation;
        assert.equal(quaternion.from_rotation(rotation),vm.runInContext('var q = new Quaternion(); q.from_rotation(rotation)',context));
        exact(vm.runInContext('q.rotate([12,-93,51])',context),quaternion.rotate([12,-93,51]),'rotation vector');
        assert.equal(right_angle_rotation(rotation),context.right_angle_rotation(rotation));
    }
    for(const location of [[-89,-179],[0,0],[51.2,-.1],[89.9,179.9],[-90,-180],[90,180]])exact(context.expected_earth_field_lat_lon(...location),expected_earth_field_lat_lon(...location),'magnetic location');
    const a={q1:1,q2:0,q3:0,q4:0},c={q1:.5,q2:.5,q3:.5,q4:.5};context.a=a;context.c=c;
    for(const t of [0,.25,.5,1]){context.t=t;const expected=vm.runInContext('slerp(a,c,t)',context),actual=slerp(a,c,t);for(const key of ['q1','q2','q3','q4'])assert.equal(actual[key],expected[key]);}
});

test('older recorded format without MAG instances retains its rejection',async()=>{
    globalThis.self={addEventListener(){}};
    const {loadDataflashParser}=await import('../../../packages/dataflash/dist/index.js');const Parser=await loadDataflashParser();
    const {readLog}=await import('../src/log.ts');const matrixContext=vm.createContext({});vm.runInContext(legacySource('modules/build/matrix/matrix.umd.js'),matrixContext);
    const buffer=await fs.readFile(path.join(root,'packages/dataflash/fixtures/pymavlink-test.BIN'));const bytes=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
    const parser=new Parser();parser.processData(bytes,[]);assert.throws(()=>readLog(parser,matrixContext.mlMatrix),/No compass data in log/);
    const oracle=await reference(bytes,Parser);assert.ok(oracle.warnings.includes('No compass data in log'));
});
