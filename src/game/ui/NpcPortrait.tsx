import type { PortraitKey, SigilSpec } from "../portraits.ts";
import { SIGIL_SPECS } from "../portraits.ts";

/**
 * Original, self-authored character portraits for the NPC dialogue focus
 * scene. Inline SVG keeps the art source-controlled, lightweight and offline
 * safe — no runtime asset fetches, no third-party artwork.
 *
 * Elder Maren and Warden Cael get detailed face/upper-body close-ups; every
 * other NPC shares the tinted sigil-silhouette treatment so the frame,
 * lighting language and proportions stay cohesive.
 */

type ArtProps = { label: string; className?: string };

function MarenArt({ label, className }: ArtProps) {
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={label} className={className}>
      <defs>
        <radialGradient id="maren-bg" cx="42%" cy="36%" r="80%">
          <stop offset="0%" stopColor="#3b332a" />
          <stop offset="55%" stopColor="#221d17" />
          <stop offset="100%" stopColor="#14110e" />
        </radialGradient>
        <radialGradient id="maren-glow" cx="18%" cy="86%" r="62%">
          <stop offset="0%" stopColor="#ffb258" stopOpacity=".5" />
          <stop offset="45%" stopColor="#ff963c" stopOpacity=".16" />
          <stop offset="75%" stopColor="#ff963c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="maren-skin" x1="0" y1="0" x2="1" y2=".3">
          <stop offset="0%" stopColor="#ecc9a0" />
          <stop offset="55%" stopColor="#d3a071" />
          <stop offset="100%" stopColor="#b07a52" />
        </linearGradient>
        <linearGradient id="maren-hair" x1="0" y1="0" x2="1" y2=".4">
          <stop offset="0%" stopColor="#f4efe6" />
          <stop offset="100%" stopColor="#c9c2b4" />
        </linearGradient>
        <linearGradient id="maren-cloak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b8574" />
          <stop offset="100%" stopColor="#4e4a3e" />
        </linearGradient>
        <linearGradient id="maren-staff" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a5636" />
          <stop offset="100%" stopColor="#4a3018" />
        </linearGradient>
        <linearGradient id="maren-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="55%" stopColor="#0c0a14" stopOpacity="0" />
          <stop offset="100%" stopColor="#0c0a14" stopOpacity=".42" />
        </linearGradient>
        <radialGradient id="maren-vignette" cx="50%" cy="46%" r="72%">
          <stop offset="62%" stopColor="#080604" stopOpacity="0" />
          <stop offset="100%" stopColor="#080604" stopOpacity=".5" />
        </radialGradient>
      </defs>

      <rect width="240" height="240" fill="url(#maren-bg)" />
      <rect width="240" height="240" fill="url(#maren-glow)" />

      {/* Walking staff, lantern-knob catching the light */}
      <rect x="29" y="66" width="5" height="170" rx="2" fill="url(#maren-staff)" />
      <circle cx="31.5" cy="58" r="8.5" fill="#33261a" />
      <circle cx="29.5" cy="55.5" r="3" fill="#ffcf8a" opacity=".9" />
      <rect x="27.5" y="66" width="1.6" height="160" fill="#9a7046" opacity=".5" />

      {/* Back hair mass and bun with the auburn tie */}
      <path
        d="M120 36 C88 36 74 62 76 92 C77 112 72 132 66 146 C80 158 96 162 120 162 C144 162 160 158 174 146 C168 132 163 112 164 92 C166 62 152 36 120 36 Z"
        fill="url(#maren-hair)"
      />
      <circle cx="120" cy="34" r="15" fill="url(#maren-hair)" />
      <path d="M106 31 Q120 41 134 31" fill="none" stroke="#9a4a28" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="120" cy="39" r="3" fill="#9a4a28" />

      {/* Cloak shoulders, hood bunched at the neck */}
      <path
        d="M26 240 C28 196 56 164 92 152 C106 147 134 147 148 152 C184 164 212 196 214 240 Z"
        fill="url(#maren-cloak)"
      />
      <path d="M92 150 C100 138 140 138 148 150 C142 160 132 164 120 164 C108 164 98 160 92 150 Z" fill="#45403a" />
      <path d="M34 206 C44 178 66 160 92 152" fill="none" stroke="#a89f88" strokeWidth="3" opacity=".7" />
      <path d="M206 206 C196 178 174 160 148 152" fill="none" stroke="#a89f88" strokeWidth="3" opacity=".5" />
      <path d="M60 214 C64 200 72 188 84 178" fill="none" stroke="#3a362c" strokeWidth="2" opacity=".5" />
      <path d="M180 214 C176 200 168 188 156 178" fill="none" stroke="#3a362c" strokeWidth="2" opacity=".4" />

      {/* Amber clasp where the cloak meets */}
      <circle cx="120" cy="168" r="12" fill="#ffb258" opacity=".18" />
      <circle cx="120" cy="168" r="6.5" fill="#c98a3e" stroke="#7a4a22" strokeWidth="1.5" />
      <circle cx="118" cy="166" r="2" fill="#f0d090" />

      {/* Neck and face */}
      <path d="M107 134 L133 134 L131 158 L109 158 Z" fill="url(#maren-skin)" />
      <path d="M109 136 L131 136 L130 146 Q120 152 110 146 Z" fill="#8a5a3a" opacity=".35" />
      <ellipse cx="120" cy="98" rx="32" ry="38" fill="url(#maren-skin)" />
      <path
        d="M120 60 C140 62 152 78 152 98 C152 120 140 134 120 136 C138 128 148 114 148 98 C148 80 138 66 120 60 Z"
        fill="#7a4a2e"
        opacity=".14"
      />

      {/* Hairline with center part, side strands framing the face */}
      <path
        d="M86 92 C84 60 100 46 120 46 C140 46 156 60 154 92 C150 74 142 66 134 64 C128 74 112 74 106 64 C98 66 90 74 86 92 Z"
        fill="url(#maren-hair)"
      />
      <path d="M84 88 C78 108 78 128 84 146 C88 132 88 110 90 96 Z" fill="url(#maren-hair)" />
      <path d="M156 88 C162 108 162 128 156 146 C152 132 152 110 150 96 Z" fill="url(#maren-hair)" />

      {/* Ears mostly sheltered by the hair */}
      <ellipse cx="86" cy="100" rx="4.5" ry="7" fill="#caa077" />
      <ellipse cx="154" cy="100" rx="4.5" ry="7" fill="#caa077" />

      {/* Gentle closed eyes, white brows, age lines */}
      <path d="M97 83 Q107 79 118 82" fill="none" stroke="#ddd6c8" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M122 82 Q133 79 143 83" fill="none" stroke="#ddd6c8" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M98 97 Q107 102 116 97" fill="none" stroke="#4a3826" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M124 97 Q133 102 142 97" fill="none" stroke="#4a3826" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M99 91 Q107 88.5 115 91" fill="none" stroke="#b07850" strokeWidth="1.5" opacity=".35" />
      <path d="M125 91 Q133 88.5 141 91" fill="none" stroke="#b07850" strokeWidth="1.5" opacity=".35" />
      <path d="M100 100 Q107 103 114 100" fill="none" stroke="#6a4a32" strokeWidth="1.4" opacity=".45" />
      <path d="M126 100 Q133 103 140 100" fill="none" stroke="#6a4a32" strokeWidth="1.4" opacity=".45" />
      <path d="M99 106 Q107 108.5 115 106" fill="none" stroke="#b07850" strokeWidth="1.5" opacity=".5" />
      <path d="M125 106 Q133 108.5 141 106" fill="none" stroke="#b07850" strokeWidth="1.5" opacity=".5" />
      <path d="M101 71 Q120 67 139 71" fill="none" stroke="#b07850" strokeWidth="1.7" opacity=".38" />
      <path d="M103 77 Q120 73.5 137 77" fill="none" stroke="#b07850" strokeWidth="1.6" opacity=".28" />
      <path d="M95 94 L91 92 M95 98 L90 98" fill="none" stroke="#a06a42" strokeWidth="1.2" opacity=".35" />
      <path d="M145 94 L149 92 M145 98 L150 98" fill="none" stroke="#a06a42" strokeWidth="1.2" opacity=".35" />

      {/* Nose, nasolabial folds, kind mouth */}
      <path d="M121 98 L119 117" fill="none" stroke="#9a6238" strokeWidth="2.2" opacity=".5" />
      <path d="M116 102 L117 114" fill="none" stroke="#f2d8b0" strokeWidth="1.6" opacity=".55" />
      <path d="M114 117 Q120 121 126 117" fill="none" stroke="#9a6238" strokeWidth="2" opacity=".5" />
      <circle cx="115.5" cy="118.5" r="1.1" fill="#7a4a2a" opacity=".55" />
      <circle cx="124.5" cy="118.5" r="1.1" fill="#7a4a2a" opacity=".55" />
      <path d="M107 110 Q112 119 114 126" fill="none" stroke="#a06a42" strokeWidth="1.8" opacity=".32" />
      <path d="M133 110 Q128 119 126 126" fill="none" stroke="#a06a42" strokeWidth="1.8" opacity=".32" />
      <path d="M110 131 Q120 134 130 131" fill="none" stroke="#8a4f34" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M110 131 L108 133 M130 131 L132 133" fill="none" stroke="#8a4f34" strokeWidth="1.6" opacity=".6" />
      <path d="M114 137 Q120 139.5 126 137" fill="none" stroke="#b06a48" strokeWidth="1.6" opacity=".5" />
      <path d="M104 126 Q120 136 136 126 L136 131 Q120 140 104 131 Z" fill="#8a5a3a" opacity=".16" />

      {/* Warm cheeks, age spots, chin shadow */}
      <ellipse cx="102" cy="112" rx="6" ry="4" fill="#c97a4a" opacity=".12" />
      <ellipse cx="138" cy="112" rx="6" ry="4" fill="#c97a4a" opacity=".12" />
      <ellipse cx="99" cy="113" rx="1.5" ry="1.2" fill="#8a5a34" opacity=".3" />
      <ellipse cx="141" cy="117" rx="1.3" ry="1.1" fill="#8a5a34" opacity=".3" />
      <ellipse cx="129" cy="84" rx="1.2" ry="1" fill="#8a5a34" opacity=".3" />
      <ellipse cx="108" cy="86" rx="1.1" ry="1" fill="#8a5a34" opacity=".3" />

      {/* Lantern rim-light from the lower left, cool shade to the right */}
      <path d="M82 66 C72 88 72 112 78 134" fill="none" stroke="#ffcf8a" strokeWidth="2.4" opacity=".5" />
      <path d="M34 208 C42 182 60 164 88 154" fill="none" stroke="#ffcf8a" strokeWidth="2.2" opacity=".4" />
      <rect width="240" height="240" fill="url(#maren-shade)" />
      <rect width="240" height="240" fill="url(#maren-vignette)" />
    </svg>
  );
}

function CaelArt({ label, className }: ArtProps) {
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={label} className={className}>
      <defs>
        <radialGradient id="cael-bg" cx="58%" cy="34%" r="82%">
          <stop offset="0%" stopColor="#262d3a" />
          <stop offset="55%" stopColor="#14171e" />
          <stop offset="100%" stopColor="#0b0d11" />
        </radialGradient>
        <radialGradient id="cael-moon" cx="82%" cy="14%" r="55%">
          <stop offset="0%" stopColor="#96b4dc" stopOpacity=".3" />
          <stop offset="70%" stopColor="#96b4dc" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="cael-warm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffaa5a" stopOpacity=".14" />
          <stop offset="100%" stopColor="#ffaa5a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cael-skin" x1="0" y1="0" x2="1" y2=".3">
          <stop offset="0%" stopColor="#dcba92" />
          <stop offset="55%" stopColor="#c09468" />
          <stop offset="100%" stopColor="#9c6c48" />
        </linearGradient>
        <linearGradient id="cael-hair" x1="0" y1="0" x2="1" y2=".4">
          <stop offset="0%" stopColor="#33291f" />
          <stop offset="100%" stopColor="#1d1712" />
        </linearGradient>
        <linearGradient id="cael-steel" x1="0" y1="0" x2="1" y2=".2">
          <stop offset="0%" stopColor="#a8b2c2" />
          <stop offset="55%" stopColor="#525c6c" />
          <stop offset="100%" stopColor="#333a46" />
        </linearGradient>
        <linearGradient id="cael-cloak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b3247" />
          <stop offset="100%" stopColor="#151924" />
        </linearGradient>
        <linearGradient id="cael-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a0c14" stopOpacity=".35" />
          <stop offset="45%" stopColor="#0a0c14" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="cael-vignette" cx="50%" cy="46%" r="72%">
          <stop offset="62%" stopColor="#05070c" stopOpacity="0" />
          <stop offset="100%" stopColor="#05070c" stopOpacity=".55" />
        </radialGradient>
      </defs>

      <rect width="240" height="240" fill="url(#cael-bg)" />
      <rect width="240" height="240" fill="url(#cael-moon)" />

      {/* Cloak and steel pauldron, layered plates */}
      <path d="M34 240 C38 186 72 156 120 152 C168 156 202 186 206 240 Z" fill="url(#cael-cloak)" />
      <path d="M150 156 C180 170 200 200 204 240 L168 240 C176 210 172 180 158 162 Z" fill="#0e1118" opacity=".5" />
      <path
        d="M48 236 C40 200 46 168 74 152 C92 143 110 146 118 158 L100 180 C84 174 68 184 62 204 C58 216 58 226 60 236 Z"
        fill="url(#cael-steel)"
      />
      <path d="M58 196 Q74 186 96 184" fill="none" stroke="#232936" strokeWidth="2" opacity=".8" />
      <circle cx="66" cy="168" r="2" fill="#d5dde8" opacity=".8" />
      <circle cx="84" cy="158" r="2" fill="#d5dde8" opacity=".8" />
      <circle cx="102" cy="164" r="2" fill="#d5dde8" opacity=".8" />
      <path d="M52 200 C48 176 56 158 76 150" fill="none" stroke="#d8e0ec" strokeWidth="2.4" opacity=".65" />

      {/* Raised warden collar framing the jaw */}
      <path
        d="M94 152 C94 128 104 114 120 114 C136 114 146 128 146 152 L140 162 C136 142 128 134 120 134 C112 134 104 142 100 162 Z"
        fill="#1b2130"
        stroke="#39415a"
        strokeWidth="1.5"
      />

      {/* Neck and face */}
      <path d="M109 140 L131 140 L130 160 L110 160 Z" fill="url(#cael-skin)" />
      <path d="M110 142 L130 142 L129 150 L111 150 Z" fill="#14181f" opacity=".5" />
      <ellipse cx="120" cy="100" rx="30" ry="36" fill="url(#cael-skin)" />
      <path d="M92 104 C90 122 98 136 110 141 L104 146 C92 140 84 124 86 106 Z" fill="#8a5a38" opacity=".25" />
      <path d="M148 104 C150 122 142 136 130 141 L136 146 C148 140 156 124 154 106 Z" fill="#6e4526" opacity=".22" />

      {/* Close-cropped hair, thin steel circlet with the thorn gem */}
      <path
        d="M88 88 C86 58 102 44 120 44 C138 44 154 58 152 88 C148 72 140 62 132 60 C126 68 114 68 108 60 C100 62 92 72 88 88 Z"
        fill="url(#cael-hair)"
      />
      <path d="M96 58 L100 66 M144 58 L140 66" fill="none" stroke="#1d1712" strokeWidth="2" opacity=".6" />
      <path d="M90 72 Q120 58 150 72" fill="none" stroke="#97a2b4" strokeWidth="3" opacity=".95" />
      <circle cx="120" cy="63" r="3" fill="#c98a4e" />

      {/* Stern brow, steady grey-blue eyes */}
      <path d="M98 88 L117 84.5" fill="none" stroke="#241c14" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M123 84.5 L142 88" fill="none" stroke="#241c14" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M100 97 L117 97" fill="none" stroke="#20180f" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M123 97 L140 97" fill="none" stroke="#20180f" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="108.5" cy="100.5" rx="4.1" ry="4.5" fill="#6a7e94" />
      <circle cx="108.5" cy="100.5" r="1.8" fill="#14181f" />
      <circle cx="109.6" cy="99" r="1" fill="#e8f0fa" />
      <ellipse cx="131.5" cy="100.5" rx="4.1" ry="4.5" fill="#6a7e94" />
      <circle cx="131.5" cy="100.5" r="1.8" fill="#14181f" />
      <circle cx="132.6" cy="99" r="1" fill="#e8f0fa" />
      <path d="M101 103 L116 103" fill="none" stroke="#7a5236" strokeWidth="1.2" opacity=".4" />
      <path d="M124 103 L139 103" fill="none" stroke="#7a5236" strokeWidth="1.2" opacity=".4" />
      <ellipse cx="120" cy="139" rx="10" ry="4" fill="#6e4526" opacity=".18" />

      {/* Strong nose, firm mouth, old scar on the right cheek */}
      <path d="M121 94 L119.5 115" fill="none" stroke="#7a4e30" strokeWidth="2" opacity=".55" />
      <path d="M114 116 Q120 120 126 116" fill="none" stroke="#7a4e30" strokeWidth="2" opacity=".55" />
      <circle cx="115" cy="117.5" r="1.1" fill="#5a3822" opacity=".6" />
      <circle cx="125" cy="117.5" r="1.1" fill="#5a3822" opacity=".6" />
      <path d="M116.5 100 L117.5 112" fill="none" stroke="#e8c8a0" strokeWidth="1.5" opacity=".5" />
      <path d="M120 124 L120 129" fill="none" stroke="#8a5a38" strokeWidth="1.4" opacity=".35" />
      <path d="M111 131 L129 131" fill="none" stroke="#6e3f28" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M111 131 L109 133 M129 131 L131 133" fill="none" stroke="#6e3f28" strokeWidth="1.6" opacity=".7" />
      <path d="M115 136 Q120 138 125 136" fill="none" stroke="#8a5638" strokeWidth="1.5" opacity=".45" />
      <path d="M138 82 L143 96" fill="none" stroke="#a87458" strokeWidth="1.3" opacity=".55" />
      <path d="M137 80 L139 84" fill="none" stroke="#a87458" strokeWidth="1.1" opacity=".45" />

      {/* The Thorn Mark over the heart */}
      <g transform="translate(120 198)" opacity=".9">
        <path d="M0 14 L0 -5" fill="none" stroke="#c98a4e" strokeWidth="3" strokeLinecap="round" />
        <path d="M0 -1 L-8 -7 M0 1 L8 -6 M0 5 L-7 2" fill="none" stroke="#c98a4e" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M0 -13 L3.5 -5 L-3.5 -5 Z" fill="#c98a4e" />
      </g>

      {/* Moonlit rim on the right, lantern fill from the lower left */}
      <path d="M152 60 C158 84 158 110 152 132" fill="none" stroke="#a8c0dc" strokeWidth="2.2" opacity=".5" />
      <ellipse cx="60" cy="210" rx="70" ry="40" fill="url(#cael-warm)" />
      <rect width="240" height="240" fill="url(#cael-shade)" />
      <rect width="240" height="240" fill="url(#cael-vignette)" />
    </svg>
  );
}

function SigilEmblem({ mark, tint }: { mark: string; tint: string }) {
  switch (mark) {
    case "lantern":
      return (
        <g>
          <rect x="-5" y="-5" width="10" height="12" rx="2" fill={tint} />
          <path d="M-3.5 -5 A3.5 3.5 0 0 1 3.5 -5" fill="none" stroke={tint} strokeWidth="2" />
          <rect x="-2" y="-9" width="4" height="3" rx="1" fill={tint} />
          <circle cx="0" cy="1" r="2" fill="#fff" opacity=".85" />
        </g>
      );
    case "shield":
      return <path d="M0 -10 L8 -6.5 V0 C8 7 0 11.5 0 11.5 C0 11.5 -8 7 -8 0 V-6.5 Z" fill={tint} />;
    case "leaf":
      return (
        <g>
          <path d="M0 -9 C8 -7 9 1 0 9 C-9 1 -8 -7 0 -9 Z" fill={tint} />
          <path d="M0 -6 L0 6" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.2" />
        </g>
      );
    case "mug":
      return (
        <g>
          <rect x="-7" y="-4" width="12" height="12" rx="2" fill={tint} />
          <path d="M5 -2 C11 -2 11 6 5 6" fill="none" stroke={tint} strokeWidth="2.2" />
        </g>
      );
    case "coin":
      return (
        <g>
          <circle r="8" fill={tint} />
          <circle r="4.6" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="1.6" />
          <path d="M-4.5 0 L4.5 0" fill="none" stroke="rgba(0,0,0,.3)" strokeWidth="1.4" />
        </g>
      );
    case "thorn":
      return (
        <g fill="none" stroke={tint} strokeLinecap="round">
          <path d="M0 11 L0 -5" strokeWidth="3" />
          <path d="M0 -1 L-7 -7 M0 1 L7 -6 M0 5 L-6 1" strokeWidth="2.2" />
          <path d="M0 -13 L3 -4 L-3 -4 Z" fill={tint} stroke="none" />
        </g>
      );
    case "goblin":
      return (
        <g fill={tint}>
          <path d="M-13 5 L-4 0 L-13 -7 Z" />
          <path d="M13 5 L4 0 L13 -7 Z" />
          <circle r="5.5" />
          <circle r="5.5" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.3" />
          <path d="M-2.6 0 L2.6 0" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.3" />
        </g>
      );
    default:
      return null;
  }
}

function SigilArt({ spec, label, className }: { spec: SigilSpec; label: string; className?: string }) {
  const hood = spec.ears
    ? "M120 38 C92 38 76 58 75 84 L52 76 L68 96 C72 106 76 114 82 121 C74 136 68 152 66 172 L174 172 C172 152 166 136 158 121 C164 114 168 106 172 96 L188 76 L165 84 C164 58 148 38 120 38 Z"
    : "M120 38 C92 38 76 58 75 84 C74 100 78 114 86 124 C76 138 68 152 66 172 L174 172 C172 152 164 138 154 124 C162 114 166 100 165 84 C164 58 148 38 120 38 Z";
  const shoulders = "M34 240 C38 190 74 166 120 166 C166 166 202 190 206 240 Z";
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={label} className={className}>
      <defs>
        <radialGradient id="sigil-bg" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#241f19" />
          <stop offset="100%" stopColor="#100d0a" />
        </radialGradient>
        <linearGradient id="sigil-body" x1="0" y1="0" x2="1" y2=".25">
          <stop offset="0%" stopColor={spec.body[0]} />
          <stop offset="100%" stopColor={spec.body[1]} />
        </linearGradient>
        <linearGradient id="sigil-slot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050403" />
          <stop offset="100%" stopColor="#171310" />
        </linearGradient>
        <radialGradient id="sigil-vignette" cx="50%" cy="46%" r="72%">
          <stop offset="62%" stopColor="#060504" stopOpacity="0" />
          <stop offset="100%" stopColor="#060504" stopOpacity=".5" />
        </radialGradient>
        <clipPath id="sigil-clip">
          <path d={hood} />
          <path d={shoulders} />
        </clipPath>
      </defs>

      <rect width="240" height="240" fill="url(#sigil-bg)" />

      {/* Hooded bust — the lantern's impression of the speaker */}
      <path d={hood} fill="url(#sigil-body)" />
      <path d={shoulders} fill="url(#sigil-body)" />
      <g clipPath="url(#sigil-clip)">
        <path d="M128 30 C158 52 168 96 164 140 C160 184 140 214 122 232 L214 232 L214 30 Z" fill="#000" opacity=".2" />
        <path d="M84 116 C92 150 104 168 120 168 C136 168 148 150 156 116 L162 126 C152 162 138 180 120 180 C102 180 88 162 78 126 Z" fill="#000" opacity=".26" />
        <path d="M96 200 Q112 190 124 188" fill="none" stroke="#000" strokeWidth="2.5" opacity=".14" />
        <path d="M144 200 Q128 190 116 188" fill="none" stroke="#000" strokeWidth="2.5" opacity=".12" />
      </g>

      {/* Hood seam over the collar */}
      <path d="M84 118 C96 130 108 136 120 136 C132 136 144 130 156 118" fill="none" stroke="#000" strokeWidth="2.2" opacity=".3" />

      {/* Face slot under the hood brim, lit faintly along its lower edge */}
      <path d="M106 62 C106 54 112 50 120 50 C128 50 134 54 134 62 L132 92 C132 104 127 112 120 112 C113 112 108 104 108 92 Z" fill="url(#sigil-slot)" />
      <path d="M100 58 Q120 42 140 58 L138 70 Q120 56 102 70 Z" fill="#000" opacity=".7" />
      <path d="M110 108 Q120 114 130 108" fill="none" stroke={spec.rim} strokeWidth="1.6" opacity=".28" />

      {/* Lit edges, stronger on the facing side */}
      <path d="M80 68 C74 86 74 104 81 120" fill="none" stroke={spec.rim} strokeWidth="3.5" opacity=".95" strokeLinecap="round" />
      <path d="M160 70 C165 86 165 102 160 116" fill="none" stroke={spec.rim} strokeWidth="2" opacity=".18" strokeLinecap="round" />
      <path d="M44 208 C50 188 62 174 80 166" fill="none" stroke={spec.rim} strokeWidth="2" opacity=".4" />

      {/* Insignia plate and role emblem */}
      <circle cx="120" cy="202" r="19" fill="rgba(0,0,0,.38)" />
      <circle cx="120" cy="202" r="19" fill="none" stroke={spec.rim} strokeWidth="1.3" opacity=".32" />
      <g transform="translate(120 202) scale(1.5)" opacity=".95">
        <SigilEmblem mark={spec.mark} tint={spec.emblem} />
      </g>

      <rect width="240" height="240" fill="url(#sigil-vignette)" />
    </svg>
  );
}

export function NpcPortrait({
  portrait,
  label,
  className,
}: {
  portrait: PortraitKey;
  label: string;
  className?: string;
}) {
  if (portrait === "elder-maren") return <MarenArt label={label} className={className} />;
  if (portrait === "warden-cael") return <CaelArt label={label} className={className} />;
  const spec = SIGIL_SPECS[portrait];
  if (!spec) return null;
  return <SigilArt spec={spec} label={label} className={className} />;
}
