'use strict';
// ── PERSISTENT STATE ─────────────────────────────────────────────────────────
let highScore = +(localStorage.getItem('ob_hs') || 0);
let inputHeld = false;
// ── GAME STATE ───────────────────────────────────────────────────────────────
// 'boot' | 'running' | 'crash' | 'gameover'
let STATE = 'boot';
let rng;
let player;
let cameraX = 0;
let anchors;
let streams;
let scrollSpeed, runTime, score;
let lastColorName, colorComboCount, comboMultiplier;
let maxComboReached, bestBonusTaken;
let comboPulseTimer, playerBurstTimer;
let trail, particles, floatingTexts;
let crashTimer, crashZoom, crashFade, shakeX, shakeY;
let explosionCoreTimer; // bright core flash at death position
let hasDetached; // gravity is gated on this — no downward pull before first detach
let redFlashTimer; // screen red-tint pulse on red anchor attach
let detachFlashTimer; // brief white flash on detach
let inGameHintTimer = 0; // seconds since run start
let inGameHintAlpha = 0; // 1 = fully visible, fades to 0
// ── ONBOARDING STATE ──────────────────────────────────────────────────────────
let obActive; // true while onboarding phase is running
let obAttachCount; // attach count during onboarding (completes at 3)
let obTimer; // elapsed seconds in onboarding (timeout at 10s)
let obPulseAlpha; // orbiter highlight pulse opacity (1→0 on completion)
let youAlpha; // "YOU" marker opacity
let youTimer; // seconds since run start for YOU marker display
let youDismissed; // true once first in-game input triggered the YOU fade
let youInputReady; // true once inputHeld has gone false after run start (ignores launch keypress)
let attachHintAnchor; // anchor currently showing the ATTACH hint
let attachHintTimer; // seconds current ATTACH hint has been visible
let attachHintAlpha; // ATTACH hint opacity
let attachHintCount; // unique anchors that have triggered the hint this run
// ── SPEED DISPLAY STATE ───────────────────────────────────────────────────────
let _speedKmh = 120; // displayed km/h value — never decreases during a run
let _speedUpdateTimer = 0; // throttle value updates to ~12/s
// ── GAME-OVER SNAPSHOT ────────────────────────────────────────────────────────
let goScore = 0, goMaxCombo = 0, goBestBonus = 1.0;
