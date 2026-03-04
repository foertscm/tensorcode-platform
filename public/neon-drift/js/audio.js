'use strict';
// ── AUDIO ELEMENTS ────────────────────────────────────────────────────────────
// Reusable audio — created once to avoid memory leaks and browser policy issues
const swooshAudio = new Audio('assets/audio/swoosh.wav');
swooshAudio.volume = 0.5;
const deathAudio = new Audio('assets/audio/death.mp3');
deathAudio.volume = 0.7;
const musicAudio = new Audio('assets/audio/music.mp3');
musicAudio.loop = true;
musicAudio.volume = 0.5;
const gameOverAudio = new Audio('assets/audio/game-over.mp3');
gameOverAudio.loop = true;
gameOverAudio.volume = 0.45;
const introAudio = new Audio('assets/audio/intro.mp3');
introAudio.loop = true;
introAudio.volume = 0.5;
let introPlaying = false;
const crackleAudio = new Audio('assets/audio/crackle.mp3');
crackleAudio.volume = 0.45; // ~65 % of death sound — audible but below music
// ── DANGER-ZONE CRACKLE STATE ─────────────────────────────────────────────────
let _dangerInZone = false; // was player in zone last frame
let _dangerActive = false; // crackle sequence is currently running
let _dangerExiting = false; // letting current play finish, then stopping
let _dangerTimer = 0; // seconds the sequence has been active (max 3)
let _dangerCooldown = 0; // seconds remaining before restart is allowed
let _dangerNextPlay = 0; // performance.now() ms when next crackle should fire
// ── MUTE SYSTEM ───────────────────────────────────────────────────────────────
let isMuted = localStorage.getItem('ob_mute') === '1';
const MUTE_BTN = { x: 0, y: 0, size: 0 }; // updated each render frame for click detection
function setMute(b) {
    isMuted = b;
    localStorage.setItem('ob_mute', b ? '1' : '0');
    swooshAudio.volume = b ? 0 : 0.5;
    deathAudio.volume = b ? 0 : 0.7;
    musicAudio.volume = b ? 0 : 0.5;
    gameOverAudio.volume = b ? 0 : 0.45;
    introAudio.volume = b ? 0 : 0.5;
    crackleAudio.volume = b ? 0 : 0.45;
}
// Apply persisted mute preference immediately on load
if (isMuted)
    setMute(true);
function isMuteButtonClick(x, y) {
    return x >= MUTE_BTN.x && x <= MUTE_BTN.x + MUTE_BTN.size &&
        y >= MUTE_BTN.y && y <= MUTE_BTN.y + MUTE_BTN.size;
}
function gameOverMusicStart() {
    if (!gameOverAudio.paused)
        return; // already running — don't stack
    gameOverAudio.currentTime = 0;
    gameOverAudio.volume = isMuted ? 0 : 0.45;
    try {
        gameOverAudio.play();
    }
    catch (_) { /* autoplay blocked — silent fail */ }
}
function gameOverMusicStop() {
    gameOverAudio.pause();
    gameOverAudio.currentTime = 0;
}
function introMusicStart() {
    if (introPlaying)
        return;
    introAudio.currentTime = 0;
    introAudio.volume = isMuted ? 0 : 0.5;
    introPlaying = true; // optimistic — prevents double-play if key pressed before Promise resolves
    try {
        const p = introAudio.play();
        if (p instanceof Promise)
            p.catch(() => { introPlaying = false; }); // reset on block
    }
    catch (_) {
        introPlaying = false; /* autoplay blocked — silent fail */
    }
}
function introMusicStop() {
    introPlaying = false;
    try {
        introAudio.pause();
        introAudio.currentTime = 0;
    }
    catch (_) { }
}
let musicFadeInterval = null;
function musicStart() {
    gameOverMusicStop(); // stop game-over track before gameplay music begins
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
        musicFadeInterval = null;
    }
    musicAudio.volume = isMuted ? 0 : 0.5;
    if (musicAudio.paused) {
        try {
            musicAudio.play();
        }
        catch (_) { /* autoplay blocked — silent fail */ }
    }
}
function musicFadeOut() {
    if (musicFadeInterval) {
        clearInterval(musicFadeInterval);
    }
    // Fade from current volume to 0 over ~2.5s (step every 40ms, 62 steps × 0.008 ≈ 2480ms)
    musicFadeInterval = setInterval(() => {
        if (musicAudio.volume > 0.006) {
            musicAudio.volume = Math.max(0, musicAudio.volume - 0.008);
        }
        else {
            musicAudio.volume = 0;
            musicAudio.pause();
            musicAudio.currentTime = 0;
            clearInterval(musicFadeInterval);
            musicFadeInterval = null;
        }
    }, 40);
}
// ── DANGER AUDIO ──────────────────────────────────────────────────────────────
function updateDangerAudio(dt) {
    if (_dangerCooldown > 0)
        _dangerCooldown = Math.max(0, _dangerCooldown - dt);
    const inZone = toSX(player.x) < DANGER_ZONE_WIDTH;
    if (_dangerActive) {
        if (!inZone && !_dangerExiting) {
            // Player just left the zone — let the current play finish, then stop
            _dangerExiting = true;
        }
        if (_dangerExiting) {
            // Crackle finishes naturally; when silent, clean up
            if (crackleAudio.paused || crackleAudio.ended) {
                _dangerActive = false;
                _dangerExiting = false;
                _dangerCooldown = 0.5;
            }
        }
        else {
            _dangerTimer += dt;
            if (_dangerTimer >= 3.0) {
                // Max 3-second limit reached — hard stop
                crackleAudio.pause();
                crackleAudio.currentTime = 0;
                _dangerActive = false;
                _dangerCooldown = 0.5;
            }
            else {
                // Fire next crackle when the previous one has ended and gap has elapsed
                const nowMs = performance.now();
                if (nowMs >= _dangerNextPlay && (crackleAudio.paused || crackleAudio.ended)) {
                    crackleAudio.currentTime = 0;
                    try {
                        crackleAudio.play();
                    }
                    catch (_) { /* autoplay blocked */ }
                    _dangerNextPlay = nowMs + 630; // ~0.5 s play + 130 ms gap
                }
            }
        }
    }
    else if (inZone && !_dangerInZone && _dangerCooldown <= 0) {
        // Transition SAFE → DANGER: start crackle sequence
        _dangerActive = true;
        _dangerExiting = false;
        _dangerTimer = 0;
        _dangerNextPlay = 0; // play immediately on next check
        crackleAudio.volume = isMuted ? 0 : 0.45;
    }
    _dangerInZone = inZone;
}
