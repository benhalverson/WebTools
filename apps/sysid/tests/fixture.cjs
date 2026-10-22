/** Fixed local DataFlash log with a broad-band input and a known first-order response.
 * No flight/hardware data or external provider is used. Float storage is part of the fixture format.
 */
function fixture() {
    const parts = [];
    /** Emit the standard 89-byte DataFlash FMT record. */
    function format(id, name, fields) {
        const bytes = Buffer.alloc(89); bytes.set([0xa3,0x95,0x80,id,3 + 8 + (fields.length - 1) * 4]);
        bytes.write(name,5,4); bytes.write('Q' + 'f'.repeat(fields.length - 1),9,16); bytes.write(fields.join(','),25,64); parts.push(bytes);
    }
    format(1,'RATE',['TimeUS','ROut','POut','YOut','AOut']);
    format(2,'SIDD',['TimeUS','Gx','Gy','Gz','Az','Ay','Ax']);
    format(3,'ATT',['TimeUS','Roll','Pitch']);
    let state = 0;
    for (let i = 0; i < 1024; i++) {
        const time = i * .08;
        const input = Math.sin(.4 * time + .055 * time * time) + .4 * Math.sin(2.7 * time) + .2 * Math.cos(6.2 * time);
        state += .08 * (-3 * state + 2 * input);
        for (const [id, values] of [[1,[input,input,input,input]],[2,[state,state,state,state,state,state]],[3,[.1 * Math.sin(time),.2 * Math.cos(time)]]]) {
            const bytes = Buffer.alloc(11 + values.length * 4); bytes.set([0xa3,0x95,id]); bytes.writeBigUInt64LE(BigInt(i * 80000),3); values.forEach((value,j) => bytes.writeFloatLE(value,11 + j * 4)); parts.push(bytes);
        }
    }
    return Buffer.concat(parts);
}
module.exports = { fixture };
