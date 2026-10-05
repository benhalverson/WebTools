import { mavlink20 } from '@webtools/mavlink'
import type { MissionItem } from '@webtools/transfers'
export interface MissionPoint { seq: number; lat: number; lng: number }
const m = mavlink20
const locationCommands = new Set<number>([m.MAV_CMD_NAV_WAYPOINT, m.MAV_CMD_NAV_LOITER_UNLIM, m.MAV_CMD_NAV_LOITER_TURNS, m.MAV_CMD_NAV_LOITER_TIME,
    m.MAV_CMD_NAV_LAND, m.MAV_CMD_NAV_TAKEOFF, m.MAV_CMD_NAV_CONTINUE_AND_CHANGE_ALT, m.MAV_CMD_NAV_LOITER_TO_ALT,
    m.MAV_CMD_NAV_SPLINE_WAYPOINT, m.MAV_CMD_NAV_GUIDED_ENABLE, m.MAV_CMD_DO_SET_HOME, m.MAV_CMD_DO_RETURN_PATH_START,
    m.MAV_CMD_DO_LAND_START, m.MAV_CMD_DO_GO_AROUND, m.MAV_CMD_DO_SET_ROI_LOCATION, m.MAV_CMD_DO_SET_ROI,
    m.MAV_CMD_NAV_VTOL_TAKEOFF, m.MAV_CMD_NAV_VTOL_LAND, m.MAV_CMD_NAV_PAYLOAD_PLACE, 36])
const globalFrames = new Set([0, 3, 5, 6, 10, 11])
/** Select geographic commands only, retaining original sequence labels and multiplication order. */
export function missionPoints(items: readonly MissionItem[]): MissionPoint[] {
    return items.filter(item => locationCommands.has(item.command) && globalFrames.has(item.frame))
        .map(item => ({ seq: item.seq, lat: item.x * 1e-7, lng: item.y * 1e-7 }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && (p.lat !== 0 || p.lng !== 0))
}
