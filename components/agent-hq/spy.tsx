"use client";

// Cartoon spy modelled on JB's reference image: wide-brim fedora, popped-collar
// trench coat, watchful eyes under the brim, skinny legs, big shoes.
// States drive the animation: sleeping | walking | investigating | reporting

export type SpyState = "sleeping" | "walking" | "investigating" | "reporting";

export function Spy({ state, size = 88 }: { state: SpyState; size?: number }) {
  return (
    <div className={`spy spy--${state}`} style={{ width: size, height: size * 1.35 }}>
      <svg viewBox="0 0 100 135" width={size} height={size * 1.35} aria-hidden="true">
        {/* legs + shoes (animated when walking) */}
        <g className="spy-leg spy-leg--left">
          <rect x="40" y="106" width="5" height="18" rx="2.5" fill="#111" />
          <ellipse cx="36" cy="126" rx="10" ry="4.5" fill="#111" />
        </g>
        <g className="spy-leg spy-leg--right">
          <rect x="55" y="106" width="5" height="18" rx="2.5" fill="#111" />
          <ellipse cx="64" cy="126" rx="10" ry="4.5" fill="#111" />
        </g>

        {/* body: trench coat */}
        <g className="spy-body">
          <path
            d="M50 30 C24 30 14 52 14 76 C14 98 28 110 50 110 C72 110 86 98 86 76 C86 52 76 30 50 30 Z"
            fill="#1c1c1e"
          />
          {/* coat seam + buttons */}
          <line x1="50" y1="72" x2="50" y2="108" stroke="#000" strokeWidth="1.5" />
          <circle cx="44" cy="80" r="2.4" fill="#3a3a3c" />
          <circle cx="56" cy="80" r="2.4" fill="#3a3a3c" />
          <circle cx="44" cy="92" r="2.4" fill="#3a3a3c" />
          <circle cx="56" cy="92" r="2.4" fill="#3a3a3c" />
          {/* cuffs */}
          <rect x="12" y="76" width="8" height="16" rx="2" fill="#2c2c2e" />
          <rect x="80" y="76" width="8" height="16" rx="2" fill="#2c2c2e" />
          {/* popped collar lapels */}
          <path d="M50 30 L28 38 L44 62 L50 44 Z" fill="#3a3a3c" />
          <path d="M50 30 L72 38 L56 62 L50 44 Z" fill="#2c2c2e" />
          {/* face in shadow */}
          <path d="M50 18 C40 18 34 26 34 34 L50 52 L66 34 C66 26 60 18 50 18 Z" fill="#000" />
          {/* eyes */}
          <g className="spy-eyes">
            <ellipse cx="43" cy="30" rx="5.5" ry="4.5" fill="#fff" />
            <ellipse cx="57" cy="30" rx="5.5" ry="4.5" fill="#fff" />
            <circle className="spy-pupil" cx="45" cy="30.5" r="2.2" fill="#000" />
            <circle className="spy-pupil" cx="55" cy="30.5" r="2.2" fill="#000" />
            {/* stern brows */}
            <path d="M37 26 L48 28" stroke="#000" strokeWidth="3" strokeLinecap="round" />
            <path d="M63 26 L52 28" stroke="#000" strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* closed eyes for sleeping */}
          <g className="spy-eyes-closed">
            <path d="M38 31 Q43 34 48 31" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M52 31 Q57 34 62 31" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
          {/* fedora */}
          <g className="spy-hat">
            <ellipse cx="50" cy="20" rx="34" ry="7" fill="#2c2c2e" />
            <path d="M30 20 C30 6 38 0 50 0 C62 0 70 6 70 20 Z" fill="#1c1c1e" />
            <rect x="30" y="14" width="40" height="5" rx="2.5" fill="#0a0a0a" />
          </g>
        </g>

        {/* magnifying glass (investigating only) */}
        <g className="spy-magnifier">
          <circle cx="86" cy="52" r="11" fill="none" stroke="#8a8a8e" strokeWidth="3.5" />
          <circle cx="86" cy="52" r="8" fill="#b9d7f0" opacity="0.35" />
          <line x1="93" y1="61" x2="100" y2="70" stroke="#8a8a8e" strokeWidth="4" strokeLinecap="round" />
        </g>
      </svg>

      {/* sleeping z's */}
      <div className="spy-zzz" aria-hidden="true">
        <span>z</span>
        <span>z</span>
        <span>z</span>
      </div>
    </div>
  );
}
