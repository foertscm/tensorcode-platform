'use strict';
// ── CANVAS ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
// ── NUMBER FORMATTING ─────────────────────────────────────────────────────────
// Single reusable formatter — no garbage objects created per frame
const FMT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
function fmt(n) { return FMT.format(Math.floor(n)); }
// Cached live-score string — score changes every frame so we cache to avoid
// repeated Intl formatting on identical integer values within the same frame
let _fmtScoreLast = -1, _fmtScoreStr = '0';
function fmtScore(n) {
    const i = Math.floor(n);
    if (i !== _fmtScoreLast) {
        _fmtScoreLast = i;
        _fmtScoreStr = FMT.format(i);
    }
    return _fmtScoreStr;
}
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);
// ── SEEDED RNG (Mulberry32) ──────────────────────────────────────────────────
function mkRng(seed) {
    let s = (seed ^ 0xDEADBEEF) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}
// ── GAME LOOP ─────────────────────────────────────────────────────────────────
let prevTs = 0;
function loop(ts) {
    const dt = Math.min((ts - prevTs) / 1000, 0.05);
    prevTs = ts;
    if (dt > 0) {
        if (STATE === 'running') {
            runTime += dt;
            physics(dt);
        }
        else if (STATE === 'crash')
            updateCrash(dt);
    }
    render();
    requestAnimationFrame(loop);
}
requestAnimationFrame(ts => { prevTs = ts; requestAnimationFrame(loop); });
