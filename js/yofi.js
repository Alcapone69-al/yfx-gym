// Yofi — a coruja vigia da YFX. yofi(pose, size) devolve um SVG em string.
// Poses: "ola" (acena), "alerta" (olhos semicerrados, a vigiar), "celebra" (asas no ar), "normal".
(function () {
  let n = 0;
  function yofi(pose = "normal", size = 96) {
    const id = "yf" + (++n);
    const eyes = {
      normal: `<circle cx="46" cy="50" r="12.5" fill="#f3f6fc"/><circle cx="74" cy="50" r="12.5" fill="#f3f6fc"/>
        <circle cx="47" cy="51" r="6.5" fill="#060d1f"/><circle cx="73" cy="51" r="6.5" fill="#060d1f"/>
        <circle cx="49" cy="48.5" r="2.2" fill="#fff"/><circle cx="75" cy="48.5" r="2.2" fill="#fff"/>`,
      alerta: `<circle cx="46" cy="50" r="12.5" fill="#f3f6fc"/><circle cx="74" cy="50" r="12.5" fill="#f3f6fc"/>
        <circle cx="50" cy="53" r="6" fill="#060d1f"/><circle cx="78" cy="53" r="6" fill="#060d1f"/>
        <path d="M33 46 Q46 38 59 46 L59 37 L33 37 Z" fill="url(#${id}b)"/><path d="M61 46 Q74 38 87 46 L87 37 L61 37 Z" fill="url(#${id}b)"/>
        <path d="M33.5 46 Q46 39.5 58.5 46" stroke="#0b1630" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M61.5 46 Q74 39.5 86.5 46" stroke="#0b1630" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
      celebra: `<circle cx="46" cy="50" r="12.5" fill="#f3f6fc"/><circle cx="74" cy="50" r="12.5" fill="#f3f6fc"/>
        <path d="M39 53 Q46 44 53 53" stroke="#060d1f" stroke-width="3.6" fill="none" stroke-linecap="round"/>
        <path d="M67 53 Q74 44 81 53" stroke="#060d1f" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    };
    eyes.ola = eyes.normal;
    const wingL = {
      normal: `<path d="M24 66 Q14 86 28 104 Q34 88 33 70 Z" fill="url(#${id}w)"/>`,
      ola: `<path d="M24 66 Q14 86 28 104 Q34 88 33 70 Z" fill="url(#${id}w)"/>`,
      alerta: `<path d="M24 66 Q14 86 28 104 Q34 88 33 70 Z" fill="url(#${id}w)"/>`,
      celebra: `<path d="M27 68 Q6 56 8 32 Q22 44 34 64 Z" fill="url(#${id}w)"/>`,
    };
    const wingR = {
      normal: `<path d="M96 66 Q106 86 92 104 Q86 88 87 70 Z" fill="url(#${id}w)"/>`,
      alerta: `<path d="M96 66 Q106 86 92 104 Q86 88 87 70 Z" fill="url(#${id}w)"/>`,
      ola: `<g class="yofi-wave" style="transform-origin:90px 68px"><path d="M93 68 Q114 56 112 32 Q98 44 86 64 Z" fill="url(#${id}w)"/></g>`,
      celebra: `<path d="M93 68 Q114 56 112 32 Q98 44 86 64 Z" fill="url(#${id}w)"/>`,
    };
    const p = eyes[pose] ? pose : "normal";
    return `<svg class="yofi yofi-${p}" viewBox="0 0 120 124" width="${size}" height="${size * 124 / 120}" role="img" aria-label="Yofi, a coruja vigia da YFX">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>
    <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
    <linearGradient id="${id}ya" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F4FB0"/><stop offset="1" stop-color="#3B82F6"/></linearGradient>
    <linearGradient id="${id}yb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>
    <linearGradient id="${id}yc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/></linearGradient>
  </defs>
  ${wingL[p]}${wingR[p]}
  <path d="M30 22 L40 34 L36 38 Z" fill="url(#${id}b)"/><path d="M90 22 L80 34 L84 38 Z" fill="url(#${id}b)"/>
  <path d="M60 18 C86 18 96 40 96 66 C96 94 80 112 60 112 C40 112 24 94 24 66 C24 40 34 18 60 18 Z" fill="url(#${id}b)"/>
  <path d="M60 36 C52 30 32 30 31 50 C31 64 44 68 52 64 C56 62 58 60 60 62 C62 60 64 62 68 64 C76 68 89 64 89 50 C88 30 68 30 60 36 Z" fill="url(#${id}f)" opacity=".95"/>
  ${eyes[p]}
  <path d="M55 60 L65 60 L60 69 Z" fill="#22d3ee" stroke="#0b1630" stroke-width="1.5" stroke-linejoin="round"/>
  <ellipse cx="60" cy="91" rx="21" ry="17" fill="#0b1630"/>
  <g transform="translate(48.5 79.5) scale(.36)">
    <polygon points="4,6 30,6 32,30 20,34" fill="url(#${id}ya)"/><polygon points="34,6 60,6 44,34 32,30" fill="url(#${id}yb)"/>
    <polygon points="20,34 32,30 44,34 38,58 26,58" fill="url(#${id}yc)"/><polygon points="30,6 34,6 32,30" fill="#243E94"/>
  </g>
  <path d="M47 110 q-4 6 2 7 q3 0 4-5 M73 110 q4 6 -2 7 q-3 0 -4-5" fill="#22d3ee"/>
</svg>`;
  }
  window.yofi = yofi;
})();
