import { MAVLink20Processor } from '@webtools/mavlink';
import { MAVFTP, MissionParser, createFTPManager } from '@webtools/transfers';
import type { TransferTransport } from '@webtools/transfers';

/** Compile-check a browser consumer’s callback contracts and explicit disconnect ownership. */
export function consumer(transport: TransferTransport) {
    const processor = new MAVLink20Processor(null, 255, 190);
    const manager = createFTPManager();
    manager.setLink(processor, transport, 42, 1);
    manager.getFile('@MISSION/mission.dat', bytes => {
        if (bytes === null) return;
        const items = new MissionParser().parseMission(bytes);
        items?.forEach(item => item.pack(processor));
    });
    manager.putFile('@PARAM/param.pck', new Uint8Array([1, 2]), size => {
        const written: number | null = size;
        console.log(written);
    });
    const ftp = new MAVFTP(processor, transport);
    // @ts-expect-error Transfer-only state is not part of the consumer API.
    ftp.fileSize.toFixed();
    ftp.resetSessions(result => { const reset: boolean | null = result; console.log(reset); });
    for (const fence of new MissionParser().parseFence(new Uint8Array()) ?? []) {
        if (fence.type === 5001 || fence.type === 5002) console.log(fence.vertices);
        else console.log(fence.radius, fence.lat, fence.lng);
    }
    // @ts-expect-error Uploads accept bytes, never text.
    manager.putFile('invalid', 'text', () => {});
    // @ts-expect-error Download callback receives file bytes, not a byte count.
    manager.getFile('invalid', (size: number | null) => console.log(size));
    manager.clearLink();
}
