import L from 'leaflet'
import type { VehicleClass } from './telemetry.ts'
/** Build the unchanged legacy vehicle SVG, preserving geometry and heading rotation. */
export function vehicleIcon(kind: VehicleClass, rotateDeg = 0): L.DivIcon {
            const paths: Record<VehicleClass, string> = {
                plane: `
                    <!-- Fixed-wing aircraft top view -->
                    <g stroke-width="1" stroke="#333" fill="#e53935">
                        <!-- Fuselage -->
                        <path d="M12,20 L11,17 L11,10 L10,7 L10,4 L12,2 L14,4 L14,7 L13,10 L13,17 L12,20 Z"/>
                        <!-- Main wings -->
                        <path d="M3,11 L11,12 L11,14 L3,13 Z"/>
                        <path d="M21,11 L13,12 L13,14 L21,13 Z"/>
                        <!-- Tail wings -->
                        <path d="M7,18 L11,17 L11,18 L7,19 Z"/>
                        <path d="M17,18 L13,17 L13,18 L17,19 Z"/>
                    </g>
                `,
                copter: `
                    <!-- Quadcopter top view -->
                    <g stroke-width="1" stroke="#333" fill="#ff9800">
                        <!-- Center body -->
                        <circle cx="12" cy="12" r="3"/>
                        <!-- Arms -->
                        <rect x="11" y="4" width="2" height="16" />
                        <rect x="4" y="11" width="16" height="2" />
                        <!-- Motors/props -->
                        <circle cx="12" cy="5" r="2.5" fill="#666"/>
                        <circle cx="12" cy="19" r="2.5" fill="#666"/>
                        <circle cx="5" cy="12" r="2.5" fill="#666"/>
                        <circle cx="19" cy="12" r="2.5" fill="#666"/>
                    </g>
                `,
                rover: `
                    <!-- Ground vehicle top view -->
                    <g stroke-width="1" stroke="#333" fill="#4caf50">
                        <!-- Main body -->
                        <rect x="7" y="6" width="10" height="12" rx="2"/>
                        <!-- Wheels -->
                        <rect x="5" y="7" width="3" height="4" fill="#333" rx="0.5"/>
                        <rect x="16" y="7" width="3" height="4" fill="#333" rx="0.5"/>
                        <rect x="5" y="13" width="3" height="4" fill="#333" rx="0.5"/>
                        <rect x="16" y="13" width="3" height="4" fill="#333" rx="0.5"/>
                        <!-- Direction indicator -->
                        <path d="M12,6 L10,9 L12,8 L14,9 Z" fill="#fff"/>
                    </g>
                `,
                boat: `
                    <!-- Boat/USV top view -->
                    <g stroke-width="1" stroke="#333" fill="#2196f3">
                        <!-- Hull shape - pointed bow -->
                        <path d="M12,4 L8,10 L8,18 Q12,20 12,20 Q12,20 16,18 L16,10 L12,4 Z"/>
                        <!-- Deck detail -->
                        <rect x="10" y="11" width="4" height="5" fill="#1976d2" rx="0.5"/>
                        <!-- Bow indicator -->
                        <path d="M12,4 L11,7 L12,6 L13,7 Z" fill="#fff"/>
                    </g>
                `
            };

            const svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
                     style="transform: rotate(${rotateDeg}deg); transform-origin: center;">
                    ${paths[kind]}
                </svg>`;

            return L.divIcon({
                html: svg,
                className: "veh-ico",
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
}
