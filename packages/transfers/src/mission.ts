import { mavlink20 } from '@webtools/mavlink';
import type { MissionItem, Fence, FencePoint } from './types.js';

// Mission data parser
export class MissionParser {
    /** Decode an exact mission-file header and its 38-byte records without coordinate conversion.
     * @returns Fully populated command payloads, or null for an invalid header/count/length.
     * Generated message constructors are reused; decoded transport headers are not invented. */
    parseMissionItems(data: Uint8Array): MissionItem[] | null {
        if (!(data instanceof Uint8Array) || data.length < 10) return null;
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const magic = view.getUint16(0, true);
        const type = view.getUint16(2, true);
        const options = view.getUint16(4, true);
        const start = view.getUint16(6, true);
        const count = view.getUint16(8, true);
        if (magic !== 0x763d || type > 2 || options !== 0 || start !== 0 || data.length !== 10 + count * 38) return null;
        const items = [];
        for (let i = 0; i < count; i++) {
            const offset = 10 + i * 38;
            items.push(new mavlink20.messages.mission_item_int(
                view.getUint8(offset + 32), view.getUint8(offset + 33), view.getUint16(offset + 28, true),
                view.getUint8(offset + 34), view.getUint16(offset + 30, true),
                view.getUint8(offset + 35), view.getUint8(offset + 36),
                view.getFloat32(offset, true), view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true), view.getFloat32(offset + 12, true),
                view.getInt32(offset + 16, true), view.getInt32(offset + 20, true),
                view.getFloat32(offset + 24, true), view.getUint8(offset + 37)) as MissionItem);
        }
        return items;
    }

    // parse as a set of fences
    /** Group mission records into circle or polygon fences with validated geographic bounds.
     * Coordinates retain the legacy division by 1e7. Unknown commands are skipped; malformed
     * polygons, invalid radii or decoding failures return null, and an empty valid file returns []. */
    parseFence(data: Uint8Array): Fence[] | null {
        try {
            const items = this.parseMissionItems(data);
            if (!items) return null;
            const fences: Fence[] = [];
            let idx = 0;
            while (idx < items.length) {
                const item = items[idx]!;
                let fitem: Fence;
                if (item.command === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION ||
                    item.command === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION) {
                    fitem = { type: item.command, radius: item.param1,
                        lat: item.x / 1.0e7, lng: item.y / 1.0e7 };
                    idx++;
                } else if (item.command === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION ||
                           item.command === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION) {
                    const num_vertices = item.param1;
                    if (!Number.isInteger(num_vertices) || num_vertices < 3 || idx + num_vertices > items.length) return null;
                    const vertices: FencePoint[] = [];
                    fitem = { type: item.command, vertices, vertex_count: num_vertices };
                    for (let i = 0; i < num_vertices; i++) {
                        if (items[idx+i]!.command !== item.command || items[idx+i]!.param1 !== num_vertices) return null;
                        const lat = items[idx+i]!.x / 1.0e7;
                        const lng = items[idx+i]!.y / 1.0e7;
                        vertices.push({ lat, lng });
                    }
                    idx += num_vertices;
                } else {
                    idx++;
                    continue;
                }
                const points = 'vertices' in fitem ? fitem.vertices : [{ lat: fitem.lat, lng: fitem.lng }];
                if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
                    Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return null;
                if ('radius' in fitem && (!Number.isFinite(fitem.radius) || fitem.radius <= 0)) return null;
                fences.push(fitem);
            }
            return fences;
        } catch (e) {
            console.error("Error parsing fence data:", e);
            return null;
        }
    }

    // parse as a mission
    /** Decode mission records for consumers, reporting malformed data as null.
     * Catches and logs decoding exceptions using the existing helper’s error contract. */
    parseMission(data: Uint8Array): MissionItem[] | null {
	    try {
	        return this.parseMissionItems(data);
	    } catch (e) {
	        console.error("Error parsing mission data:", e);
	        return null;
	    }
    }
}
