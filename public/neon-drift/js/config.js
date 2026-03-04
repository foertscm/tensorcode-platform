'use strict';
// ── ANCHOR TYPES ─────────────────────────────────────────────────────────────
// 0 = Small/Green ×10  1 = Medium/Blue ×3  2 = Large/Red ×1
// attachBonus: instant score on attachment
// speedRange:  [min, max] speedFactor (anchor world-scroll multiplier)
const AT = [
    { r: 9, grabR: 64, bonusMult: 10, attachBonus: 5000, speedRange: [1.05, 1.15], hex: '#39ff6a', rgb: '57,255,106', name: 'GREEN' },
    { r: 13, grabR: 88, bonusMult: 3, attachBonus: 2500, speedRange: [0.95, 1.05], hex: '#00d4ff', rgb: '0,212,255', name: 'BLUE' },
    { r: 19, grabR: 106, bonusMult: 1, attachBonus: -1000, speedRange: [0.90, 1.00], hex: '#ff1a4e', rgb: '255,26,78', name: 'RED' },
];
// ── 3 INDEPENDENT ANCHOR STREAMS ─────────────────────────────────────────────
// Each stream has a soft vertical bias and its own spawn cursor.
const STREAM_DEFS = [
    { yBias: 0.25, yRange: 0.10 }, // top lane
    { yBias: 0.50, yRange: 0.13 }, // middle lane (most reachable from start)
    { yBias: 0.75, yRange: 0.10 }, // bottom lane
];
// ── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
    orbitRadius: 70,
    omega: 3.0, // rad/s, clockwise on screen
    orbitSpeed: 70 * 3.0, // tangent speed = 210 px/s
    scrollSpeedInit: 155,
    scrollSpeedMax: 480,
    scrollAccel: 4.0, // px/s per second
    // Per-stream anchor spacing (3 streams × ~480 ≈ one anchor every ~160 px globally)
    anchorDxMin: 380,
    anchorDxMax: 580,
    // Free-flight physics
    surgeBoost: 220, // px/s added along tangent direction on detach
    maxBackwardScreenV: 250, // clamp: screen-relative vx cannot go below −this (prevents instant left-edge death)
    velDamping: 0.75, // X: vx→driftTarget exponential decay coefficient (half-life ≈ 0.92s → 1.8s crossover)
    velDampingY: 0.9, // Y: slower decay — preserves vertical momentum for curved trajectories
    driftRatio: 0.5, // equilibrium screen vx = −scrollSpeed×driftRatio (scales with difficulty)
    gravity: 8, // px/s² very subtle downward pull — ballistic arcs without forcing downward bias
    redOrbitDrain: 200, // pts/s drained from score while orbiting a red anchor
    playerScreenXRatio: 0.35,
    anchorYMin: 0.16,
    anchorYMax: 0.84,
    minAnchorSep: 42, // minimum centre-to-centre distance (visual non-overlap)
    comboStep: 0.5,
    comboMax: 4.0,
    trailMax: 28,
    playerR: 6,
    playerGlowR: 22,
    crashDuration: 5.0, // full explosion show before game over screen
    crashTimeScale: 0.20, // slow-mo factor for zoom/shake feel (particles run real-time)
    particleCount: 100, // neon explosion shards
    shakeAmplitude: 18, // strong impact shake
    shakeDecay: 2.5, // slow decay — rumble felt for ~2s
    zoomTarget: 1.08,
};
const DANGER_ZONE_WIDTH = 150; // px — controls visual zone width, shake/pulse trigger, and death boundary (player dies at x=0, the left edge of this zone)
