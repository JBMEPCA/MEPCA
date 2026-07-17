"use client";

// Cartoon sniper modelled on JB's reference image: kneeling hunter in cap and
// gilet, bushy beard, bolt-action rifle shouldered and aimed to the right (at
// the Google-Ads phone he's "picking off" leads from). Barrel points right so
// he lines up with the phone mockup in the HQ hero.
//
// States drive the animation:
//   resting     — off duty, rifle lowered, calm breathing
//   walking     — being dragged / moving to a term tile
//   aiming      — locked on, scope glinting, holding steady
//   firing      — muzzle flash + recoil kick (one "shot")

export type SniperState = "resting" | "walking" | "aiming" | "firing";

export function Sniper({ state, size = 108 }: { state: SniperState; size?: number }) {
  return (
    <div className={`sniper sniper--${state}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 130 120" width={size} height={size} aria-hidden="true">
        {/* ground shadow */}
        <ellipse cx="52" cy="112" rx="40" ry="6" fill="rgb(0 0 0 / 0.18)" />

        {/* back leg kneeling */}
        <path d="M30 78 L20 104 L44 104 L46 84 Z" fill="#3f5138" />
        <ellipse cx="24" cy="106" rx="12" ry="5" fill="#20160f" />

        {/* front knee up */}
        <path d="M46 74 C40 84 40 92 44 100 L60 100 L60 78 Z" fill="#4a6042" />
        <ellipse cx="58" cy="104" rx="13" ry="5" fill="#20160f" />

        {/* the sniper's torso + arms + rifle recoil together */}
        <g className="sniper-rig">
          {/* gilet / body leaning into the shot */}
          <path
            d="M40 44 C30 46 26 62 30 78 C40 84 58 84 64 76 C68 64 66 50 58 44 Z"
            fill="#5a7150"
          />
          {/* ammo bandolier */}
          <path d="M38 48 L64 70" stroke="#7b5a34" strokeWidth="6" strokeLinecap="round" />
          <path d="M38 48 L64 70" stroke="#a9803f" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 5" />

          {/* backpack */}
          <path d="M28 52 C20 54 18 70 26 76 C32 74 34 60 34 54 Z" fill="#40342a" />

          {/* head: neck, face, beard, cap */}
          <g className="sniper-head">
            {/* face */}
            <circle cx="72" cy="40" r="13" fill="#e8b98f" />
            {/* beard */}
            <path d="M62 40 C62 54 82 54 82 40 C82 47 78 52 72 52 C66 52 62 47 62 40 Z" fill="#7b5a34" />
            {/* stern brow + eye aiming right */}
            <path d="M70 35 L82 34" stroke="#3a2a1a" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="80" cy="39" r="1.8" fill="#20160f" />
            {/* cap dome + peak (peak points right, toward target) */}
            <path d="M60 32 C60 20 78 18 84 28 C86 30 86 32 85 34 L64 34 C61 34 60 33 60 32 Z" fill="#3f5138" />
            <path d="M84 30 L102 30 C104 30 104 34 100 34 L84 34 Z" fill="#33422d" />
          </g>

          {/* rear arm gripping stock */}
          <path d="M48 56 C56 58 64 60 70 62 L66 70 C58 68 50 66 46 62 Z" fill="#4a6042" />

          {/* ---- RIFLE, aimed right ---- */}
          <g className="sniper-rifle">
            {/* stock */}
            <path d="M56 60 L70 58 L72 66 L58 70 Z" fill="#6b4a2a" />
            {/* body / receiver */}
            <rect x="70" y="57" width="26" height="7" rx="1.5" fill="#2b2b2e" />
            {/* bolt handle */}
            <rect x="82" y="52" width="3" height="7" rx="1.5" fill="#4a4a4e" />
            {/* scope */}
            <rect x="74" y="49" width="16" height="5" rx="2.5" fill="#1c1c1e" />
            <circle className="sniper-scope-glint" cx="90" cy="51.5" r="2.2" fill="#bfe6ff" />
            {/* long barrel to the right */}
            <rect x="96" y="58.5" width="30" height="4" rx="2" fill="#2b2b2e" />
            <rect x="122" y="59" width="6" height="3" rx="1.5" fill="#4a4a4e" />

            {/* muzzle flash (firing only) */}
            <g className="sniper-flash">
              <path
                d="M128 60 L138 54 L133 60 L140 60 L133 61 L138 67 L128 61 Z"
                fill="#ffd34d"
              />
              <circle cx="129" cy="60.5" r="3.4" fill="#ff8a1f" />
            </g>
          </g>

          {/* front arm on the fore-stock / trigger */}
          <path d="M58 62 C66 66 76 68 86 66 L84 73 C74 75 64 73 56 70 Z" fill="#5a7150" />
          {/* gloved hand */}
          <circle cx="86" cy="67" r="4.5" fill="#3a2a1a" />
        </g>
      </svg>
    </div>
  );
}
