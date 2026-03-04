'use strict';
// ── INPUT ─────────────────────────────────────────────────────────────────────
function onDown() {
    inputHeld = true;
    if (STATE === 'boot' || STATE === 'gameover') {
        gameOverMusicStop();
        introMusicStop();
        initRun();
        STATE = 'running';
        musicStart();
    }
}
function onUp() { inputHeld = false; }
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        onDown();
        return;
    }
    if (e.code === 'Escape' && STATE !== 'boot') {
        e.preventDefault();
        inputHeld = false;
        musicFadeOut();
        gameOverMusicStop();
        introMusicStop();
        STATE = 'boot';
    }
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space')
    onUp(); });
document.addEventListener('mousedown', (e) => {
    if (e.button !== 0)
        return;
    if (isMuteButtonClick(e.clientX, e.clientY)) {
        setMute(!isMuted);
        return;
    }
    onDown();
});
document.addEventListener('mouseup', (e) => { if (e.button === 0)
    onUp(); });
document.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    if (t && isMuteButtonClick(t.clientX, t.clientY)) {
        setMute(!isMuted);
        return;
    }
    onDown();
}, { passive: false });
document.addEventListener('touchend', (e) => { e.preventDefault(); if (!e.touches.length)
    onUp(); }, { passive: false });
document.addEventListener('touchcancel', () => onUp());
