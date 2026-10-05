import transfers = require('@webtools/transfers');
import codec = require('@webtools/mavlink');
const processor = new codec.MAVLink20Processor(null, 255, 190);
const ftp = new transfers.MAVFTP(processor, { send(_bytes: Uint8Array) {} });
ftp.getFile('virtual.dat', bytes => { const result: Uint8Array | null = bytes; console.log(result); });
ftp.cancel();
