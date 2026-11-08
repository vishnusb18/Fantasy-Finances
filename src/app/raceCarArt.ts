/** Original Formula-style vector art from the supplied purple/gold V4 reference. */
export const raceCarArt = (
  number: string,
) => `<svg class="grand-prix-car" viewBox="0 0 180 94" role="img" aria-label="Gold open-wheel race car number ${number}">
 <ellipse cx="90" cy="48" rx="80" ry="23" fill="#190f35" opacity=".24"/>
 <!-- Rear slicks and front slicks, visible outside body as on a real F1 car -->
 <rect x="25" y="5" width="31" height="25" rx="7" fill="#1d1631" stroke="#493a56" stroke-width="2"/>
 <rect x="25" y="64" width="31" height="25" rx="7" fill="#1d1631" stroke="#493a56" stroke-width="2"/>
 <rect x="127" y="5" width="32" height="25" rx="7" fill="#1d1631" stroke="#493a56" stroke-width="2"/>
 <rect x="127" y="64" width="32" height="25" rx="7" fill="#1d1631" stroke="#493a56" stroke-width="2"/>
 <path d="M35 10 L46 10 M35 84 L46 84 M138 10 L149 10 M138 84 L149 84" stroke="#8a7a92" stroke-width="3" stroke-linecap="round"/>
 <!-- Rear wing with end plates and aerodynamic slats -->
 <path d="M8 15 L21 15 L23 78 L8 78Z" fill="#ffda66" stroke="#fff3b7" stroke-width="2"/>
 <rect x="6" y="13" width="21" height="6" rx="2" fill="#fff4b8"/>
 <rect x="6" y="75" width="21" height="6" rx="2" fill="#fff4b8"/>
 <path d="M12 22 L12 71 M19 22 L19 71" stroke="#7b469e" stroke-width="2.5"/>
 <!-- Chassis / sidepods -->
 <path d="M23 38 L52 35 L72 24 L106 28 L121 35 L157 42 L167 47 L157 52 L121 59 L106 66 L72 70 L52 59 L23 56Z" fill="#ffd66c" stroke="#fff7c8" stroke-width="2.5" stroke-linejoin="round"/>
 <path d="M57 33 L72 22 L104 26 L105 39 L65 40Z" fill="#ffe9a3" stroke="#a16cba" stroke-width="1.5"/>
 <path d="M57 61 L72 72 L104 68 L105 55 L65 54Z" fill="#ffe9a3" stroke="#a16cba" stroke-width="1.5"/>
 <path d="M65 28 L103 32 M65 66 L103 62" stroke="#a973bb" stroke-width="2" stroke-linecap="round"/>
 <!-- Main top stripe and narrow tapered nose -->
 <path d="M28 45 L69 41 L122 44 L167 47 L122 50 L69 53 L28 49Z" fill="#7c4bb4"/>
 <path d="M120 45 L161 47 L120 49" fill="#fff0b5"/>
 <!-- Cockpit, halo, and driver's helmet -->
 <ellipse cx="86" cy="47" rx="19" ry="15" fill="#291744" stroke="#fff0ac" stroke-width="2.5"/>
 <ellipse cx="82" cy="47" rx="10" ry="9" fill="#dcc7ff"/>
 <path d="M75 37 L76 55 M97 37 L97 55 M75 37 Q88 28 97 37" fill="none" stroke="#efb844" stroke-width="4" stroke-linecap="round"/>
 <!-- Racing number / sponsor plate -->
 <rect x="107" y="35" width="20" height="24" rx="8" fill="#fff2c5"/>
 <text class="numeric" x="117" y="51" text-anchor="middle" font-family="Pixelify Sans,system-ui,sans-serif" font-weight="500" font-size="12" fill="var(--type-on-card, #321c58)">${number}</text>
 <!-- Front wing, prominent endplates / splitter -->
 <path d="M155 27 Q164 35 177 35 L177 59 Q164 59 155 67 L151 56 L151 38Z" fill="#ffe590" stroke="#fff8d2" stroke-width="2.5"/>
 <path d="M157 32 L171 40 M157 62 L171 54" stroke="#7343a4" stroke-width="2"/>
 <rect x="170" y="31" width="7" height="7" rx="2" fill="#7041a0"/>
 <rect x="170" y="55" width="7" height="7" rx="2" fill="#7041a0"/>
 </svg>`;
