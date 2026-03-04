'use strict';
// ── SPAWN ─────────────────────────────────────────────────────────────────────
function mkAnchor(x, y, ti) {
    const t = AT[ti];
    const [sfMin, sfMax] = t.speedRange;
    const speedFactor = sfMin + rng() * (sfMax - sfMin);
    return { x, y, r: t.r, grabR: t.grabR, bonusMult: t.bonusMult,
        attachBonus: t.attachBonus, speedFactor,
        hex: t.hex, rgb: t.rgb, name: t.name, ti, used: false };
}
function pickTypeIdx() {
    // [small, medium, large] weights grow more balanced at higher difficulty
    const w = runTime < 15 ? [5, 80, 15]
        : runTime < 45 ? [25, 50, 25]
            : [35, 35, 30];
    let r = rng() * (w[0] + w[1] + w[2]);
    for (let i = 0; i < 3; i++) {
        r -= w[i];
        if (r <= 0)
            return i;
    }
    return 1;
}
// Spawn one anchor from a single stream, respecting visual non-overlap.
function spawnFromStream(def, stream) {
    const H = canvas.height;
    const dx = CFG.anchorDxMin + rng() * (CFG.anchorDxMax - CFG.anchorDxMin);
    const baseX = stream.lastSpawnX + dx;
    const ti = pickTypeIdx();
    const newR = AT[ti].r;
    // Try up to 10 positions to avoid visual overlap with existing anchors.
    let chosenX = baseX, chosenY = 0;
    let placed = false;
    for (let attempt = 0; attempt < 10; attempt++) {
        const cx = baseX + (attempt === 0 ? 0 : (rng() - 0.5) * 90);
        const rawY = def.yBias * H + (rng() - 0.5) * 2.0 * def.yRange * H;
        const cy = Math.max(H * CFG.anchorYMin, Math.min(H * CFG.anchorYMax, rawY));
        const overlaps = anchors.some(a => {
            const ex = cx - a.x, ey = cy - a.y;
            return Math.sqrt(ex * ex + ey * ey) < a.r + newR + CFG.minAnchorSep;
        });
        if (!overlaps) {
            chosenX = cx;
            chosenY = cy;
            placed = true;
            break;
        }
    }
    if (!placed) {
        // Fall back: place at baseX with stream bias, ignoring overlap (rare)
        chosenX = baseX;
        chosenY = Math.max(H * CFG.anchorYMin, Math.min(H * CFG.anchorYMax, def.yBias * H + (rng() - 0.5) * 60));
    }
    anchors.push(mkAnchor(chosenX, chosenY, ti));
    stream.lastSpawnX = chosenX;
}
function maintainAnchors() {
    // Cull anchors well off the left edge (never cull the currently-orbited anchor)
    const cullX = cameraX - 280;
    anchors = anchors.filter(a => a === player.orbitAnchor || a.x > cullX);
    // Each stream spawns independently until it has anchors far enough ahead
    const aheadX = cameraX + canvas.width + 620;
    STREAM_DEFS.forEach((def, i) => {
        while (streams[i].lastSpawnX < aheadX)
            spawnFromStream(def, streams[i]);
    });
}
// ── PHYSICS ──────────────────────────────────────────────────────────────────
function initRun() {
    rng = mkRng(Date.now() ^ (Math.random() * 0xFFFFFFFF | 0));
    scrollSpeed = CFG.scrollSpeedInit;
    _speedKmh = 120;
    _speedUpdateTimer = 0;
    runTime = score = crashTimer = 0;
    lastColorName = null;
    colorComboCount = 0;
    comboMultiplier = 1.0;
    maxComboReached = 0;
    bestBonusTaken = 1.0;
    comboPulseTimer = playerBurstTimer = 0;
    hasDetached = false;
    redFlashTimer = 0;
    detachFlashTimer = 0;
    explosionCoreTimer = 0;
    inGameHintTimer = 0;
    inGameHintAlpha = 1;
    obActive = true;
    obAttachCount = 0;
    obTimer = 0;
    obPulseAlpha = 1;
    youAlpha = 1;
    youTimer = 0;
    youDismissed = false;
    youInputReady = false;
    attachHintAnchor = null;
    attachHintTimer = 0;
    attachHintAlpha = 0;
    attachHintCount = 0;
    crashZoom = 1;
    crashFade = 0;
    shakeX = shakeY = 0;
    trail = [];
    particles = [];
    floatingTexts = [];
    _dangerActive = false;
    _dangerExiting = false;
    _dangerTimer = 0;
    _dangerCooldown = 0;
    _dangerInZone = false;
    const W = canvas.width, H = canvas.height;
    player = {
        x: 0, y: H * 0.5,
        vx: CFG.scrollSpeedInit, vy: 0,
        orbiting: false, orbitAnchor: null, orbitAngle: 0,
    };
    cameraX = player.x - W * CFG.playerScreenXRatio;
    // Stagger stream spawn cursors so anchors are naturally spread out
    streams = STREAM_DEFS.map((_, i) => ({
        lastSpawnX: player.x - 80 + i * 110,
    }));
    // Guaranteed starter anchor — blue, vertically centred, always reachable at run start
    const st = AT[1];
    anchors = [{
            x: player.x + 230, y: player.y,
            r: st.r, grabR: st.grabR, bonusMult: st.bonusMult,
            attachBonus: st.attachBonus, speedFactor: 1.0,
            hex: st.hex, rgb: st.rgb, name: st.name, ti: 1, used: false,
        }];
    maintainAnchors();
}
function toSX(wx) { return wx - cameraX; } // world X → screen X
function physics(dt) {
    // Base survival score — always accrues regardless of orbit state
    score += scrollSpeed * dt;
    // Variable-speed anchors: each anchor has a speedFactor that offsets its world position
    // relative to the camera, making green anchors appear faster, red ones slower.
    for (const a of anchors) {
        a.x += (1 - a.speedFactor) * scrollSpeed * dt;
    }
    if (player.orbiting) {
        // Clockwise orbit: angle increases in y-down screen coords
        player.orbitAngle += CFG.omega * dt;
        const a = player.orbitAnchor;
        // Player follows anchor's (possibly moving) world position
        player.x = a.x + CFG.orbitRadius * Math.cos(player.orbitAngle);
        player.y = a.y + CFG.orbitRadius * Math.sin(player.orbitAngle);
        // Camera still scrolls — orbiting pushes player toward left edge intentionally
        if (!inputHeld)
            detach();
        // Orbital scoring: green/blue add bonus; red drains score (tactical survival, not reward)
        if (a.ti === 2) {
            score -= CFG.redOrbitDrain * dt;
        }
        else {
            score += scrollSpeed * dt * a.bonusMult * comboMultiplier;
        }
    }
    else {
        // Free flight
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        if (inputHeld)
            tryAttach();
        // X: decay toward driftTarget = scrollSpeed × (1 − driftRatio)
        // Equilibrium screen vx = −scrollSpeed × driftRatio (scales with difficulty)
        const driftTarget = scrollSpeed * (1 - CFG.driftRatio);
        const xDecay = Math.exp(-CFG.velDamping * dt);
        player.vx = driftTarget + (player.vx - driftTarget) * xDecay;
        // Y: slower decay than X + subtle gravity (only after first detach — never at game start)
        const yDecay = Math.exp(-CFG.velDampingY * dt);
        player.vy = player.vy * yDecay + (hasDetached ? CFG.gravity * dt : 0);
    }
    // World scroll (independent of player movement)
    cameraX += scrollSpeed * dt;
    scrollSpeed = Math.min(CFG.scrollSpeedMax, scrollSpeed + CFG.scrollAccel * dt);
    // Speed display — throttled value update (~12/s), never decreases
    _speedUpdateTimer -= dt;
    if (_speedUpdateTimer <= 0) {
        _speedUpdateTimer = 1 / 12;
        const target = Math.round(1.477 * scrollSpeed - 108.9);
        if (target > _speedKmh)
            _speedKmh = target;
    }
    if (comboPulseTimer > 0)
        comboPulseTimer -= dt;
    if (playerBurstTimer > 0)
        playerBurstTimer -= dt;
    if (redFlashTimer > 0)
        redFlashTimer -= dt;
    if (detachFlashTimer > 0)
        detachFlashTimer -= dt;
    // In-game hint: show for 2.5s then fade out over 0.4s
    const HINT_SHOW = 2.5, HINT_FADE = 0.4;
    if (inGameHintTimer <= HINT_SHOW + HINT_FADE) {
        inGameHintTimer += dt;
        inGameHintAlpha = inGameHintTimer < HINT_SHOW
            ? 1
            : Math.max(0, 1 - (inGameHintTimer - HINT_SHOW) / HINT_FADE);
    }
    // ── ONBOARDING ─────────────────────────────────────────────────────────────
    // Component 1: "YOU" marker — display 2-3s, fade on first deliberate in-game input
    // youInputReady gates the dismiss so the keypress that launched the run is ignored
    if (!youInputReady && !inputHeld)
        youInputReady = true;
    if (youAlpha > 0) {
        youTimer += dt;
        if (youInputReady && !youDismissed && inputHeld)
            youDismissed = true;
        if (youDismissed || youTimer >= 2.5)
            youAlpha = Math.max(0, youAlpha - dt / 0.5);
    }
    // Onboarding phase completion (3 attaches OR 10 seconds)
    if (obActive) {
        obTimer += dt;
        if (obAttachCount >= 3 || obTimer >= 10)
            obActive = false;
    }
    // obPulseAlpha intentionally kept at 1 — pulse runs for the entire game session
    // Component 2: contextual ATTACH hint
    if (!player.orbiting) {
        // Tick current hint; remove when expired or anchor out of range
        if (attachHintAnchor) {
            attachHintTimer += dt;
            const dx = player.x - attachHintAnchor.x, dy = player.y - attachHintAnchor.y;
            const inRange = (dx * dx + dy * dy) <= attachHintAnchor.grabR * attachHintAnchor.grabR;
            if (!inRange || attachHintTimer >= 1.5 || attachHintAnchor.used) {
                attachHintAlpha = Math.max(0, attachHintAlpha - dt * 5);
                if (attachHintAlpha <= 0)
                    attachHintAnchor = null;
            }
            else {
                attachHintAlpha = Math.min(1, attachHintAlpha + dt * 6);
            }
        }
        // Find a new anchor to hint if budget remains
        if (!attachHintAnchor && obActive && attachHintCount < 3) {
            for (const a of anchors) {
                if (a.used || a.wasHinted)
                    continue;
                const dx = player.x - a.x, dy = player.y - a.y;
                if (dx * dx + dy * dy <= a.grabR * a.grabR) {
                    attachHintAnchor = a;
                    a.wasHinted = true;
                    attachHintTimer = 0;
                    attachHintAlpha = 0;
                    attachHintCount++;
                    break;
                }
            }
        }
    }
    else {
        // Orbiting — fade hint away quickly
        if (attachHintAlpha > 0)
            attachHintAlpha = Math.max(0, attachHintAlpha - dt * 8);
        if (attachHintAlpha <= 0)
            attachHintAnchor = null;
    }
    // Floating texts: drift upward and fade
    for (const ft of floatingTexts) {
        ft.wy -= 50 * dt;
        ft.life -= 1.7 * dt;
    }
    floatingTexts = floatingTexts.filter(ft => ft.life > 0);
    // Trail
    trail.push({ x: player.x, y: player.y });
    if (trail.length > CFG.trailMax)
        trail.shift();
    // Danger zone crackle audio (SAFE → DANGER edge trigger)
    updateDangerAudio(dt);
    // Death conditions
    if (toSX(player.x) < 0) {
        die();
        return;
    }
    if (player.y < -120 || player.y > canvas.height + 120) {
        die();
        return;
    }
    maintainAnchors();
}
// Grab the closest unused anchor within its individual grabR
function tryAttach() {
    const px = player.x, py = player.y;
    let best = null, bestD2 = Infinity;
    for (const a of anchors) {
        if (a.used)
            continue;
        const dx = px - a.x, dy = py - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= a.grabR * a.grabR && d2 < bestD2) {
            best = a;
            bestD2 = d2;
        }
    }
    if (best)
        attach(best);
}
function attach(a) {
    const dx = player.x - a.x, dy = player.y - a.y;
    player.orbitAngle = Math.atan2(dy, dx);
    player.orbiting = true;
    player.orbitAnchor = a;
    // Snap to orbit circle
    player.x = a.x + CFG.orbitRadius * Math.cos(player.orbitAngle);
    player.y = a.y + CFG.orbitRadius * Math.sin(player.orbitAngle);
    // ── Color combo ──────────────────────────────────────────────────────────
    const prevCount = colorComboCount;
    colorComboCount = (a.name === lastColorName) ? colorComboCount + 1 : 1;
    lastColorName = a.name;
    comboMultiplier = Math.min(CFG.comboMax, 1 + (colorComboCount - 1) * CFG.comboStep);
    if (colorComboCount > maxComboReached)
        maxComboReached = colorComboCount;
    if (a.bonusMult > bestBonusTaken)
        bestBonusTaken = a.bonusMult;
    if (colorComboCount > prevCount || prevCount === 0) {
        comboPulseTimer = 0.38;
        playerBurstTimer = 0.30;
    }
    // Instant attach bonus — combo-scaled for green/blue, flat penalty for red
    const scaledBonus = (a.ti === 2)
        ? a.attachBonus // red: -1000 (penalty, no combo)
        : a.attachBonus * colorComboCount; // green/blue: base × comboCount
    score += scaledBonus;
    // Floating attach value (anchored to the anchor, drifts up)
    floatingTexts.push({
        wx: a.x, wy: a.y - a.r - 14,
        text: a.ti === 2 ? fmt(a.attachBonus) : `+${fmt(scaledBonus)}`,
        color: a.hex, life: 1.0,
    });
    // Combo milestone float (large, near player) — green/blue chain ≥ 2
    if (a.ti !== 2 && colorComboCount >= 2) {
        floatingTexts.push({
            wx: player.x, wy: player.y - 32,
            text: `COMBO ×${colorComboCount}`,
            color: a.hex, life: 1.4, large: true,
        });
    }
    // Red anchor penalty: brief screen flash
    if (a.ti === 2)
        redFlashTimer = 0.35;
    // Onboarding: count attachment; dismiss active ATTACH hint immediately
    if (obActive)
        obAttachCount++;
    attachHintAnchor = null;
    attachHintAlpha = 0;
}
function detach() {
    hasDetached = true; // unlock gravity for curved free-flight trajectories
    const θ = player.orbitAngle;
    const tx = -Math.sin(θ); // clockwise tangent X (unit vector)
    const ty = Math.cos(θ); // clockwise tangent Y (unit vector)
    // Launch: scroll base + full tangent velocity + boost along tangent direction.
    // Boost is direction-aware — detach early = forward, detach late = backward.
    const launchSpeed = CFG.orbitSpeed + CFG.surgeBoost;
    player.vx = scrollSpeed + tx * launchSpeed;
    player.vy = ty * launchSpeed;
    // Soft clamp on backward screen-relative speed to prevent instant left-edge death
    player.vx = Math.max(scrollSpeed - CFG.maxBackwardScreenV, player.vx);
    player.orbitAnchor.used = true;
    player.orbiting = false;
    player.orbitAnchor = null;
    // Detach sound — reset position to allow rapid replays without overlap buildup
    try {
        swooshAudio.currentTime = 0;
        swooshAudio.play();
    }
    catch (_) { /* blocked by browser autoplay policy — silent fail */ }
    // White flash feedback on detach
    detachFlashTimer = 0.12;
}
// ── DEATH / CRASH ─────────────────────────────────────────────────────────────
function die() {
    if (STATE === 'crash')
        return;
    STATE = 'crash';
    musicFadeOut();
    // Stop danger crackle immediately so it doesn't overlap the death sound
    crackleAudio.pause();
    crackleAudio.currentTime = 0;
    _dangerActive = false;
    _dangerExiting = false;
    try {
        deathAudio.currentTime = 0;
        deathAudio.play();
    }
    catch (_) { /* autoplay blocked */ }
    goScore = score;
    goMaxCombo = maxComboReached;
    goBestBonus = bestBonusTaken;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('ob_hs', String(Math.floor(highScore)));
    }
    crashTimer = 0;
    crashZoom = 1;
    crashFade = 0;
    shakeX = shakeY = CFG.shakeAmplitude;
    explosionCoreTimer = 0.55; // bright flash lasts half a second
    const SHARD_COLORS = ['#00ccff', '#ffffff', '#39ff6a', '#00ffff', '#cc44ff', '#ff6600', '#00d4ff', '#ff00aa'];
    particles = [];
    for (let i = 0; i < CFG.particleCount; i++) {
        const a = rng() * Math.PI * 2;
        const col = SHARD_COLORS[Math.floor(rng() * SHARD_COLORS.length)];
        const tier = rng();
        let spd, decay, r;
        if (tier < 0.35) {
            // Tier 1 — fast shards: rocket to viewport edges, fade over 2–4s
            spd = 220 + rng() * 560;
            decay = 0.18 + rng() * 0.25; // life ~2.5–5.5s
            r = 1.5 + rng() * 3.5;
        }
        else if (tier < 0.70) {
            // Tier 2 — medium drifters: linger in mid-field, fat glowing blobs
            spd = 50 + rng() * 180;
            decay = 0.10 + rng() * 0.12; // life ~5–10s (outlast the 5s window)
            r = 4 + rng() * 8;
        }
        else {
            // Tier 3 — slow lingering glows: huge orbs that bloom near the centre
            spd = 10 + rng() * 55;
            decay = 0.07 + rng() * 0.08; // life ~7–14s — still alive at 5s cutoff
            r = 8 + rng() * 14;
        }
        particles.push({
            x: player.x, y: player.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            life: 1.0, decay, r, color: col,
        });
    }
}
function updateCrash(dt) {
    crashTimer += dt;
    const t = Math.min(1, crashTimer / CFG.crashDuration);
    // Zoom peaks quickly then holds
    crashZoom = 1 + (CFG.zoomTarget - 1) * Math.min(1, t * 3);
    // Dark fade starts at 85% (4.25s) — full 4s of unobstructed explosion
    const fadeT = Math.max(0, (t - 0.85) / 0.15);
    crashFade = fadeT * 0.92;
    shakeX *= Math.exp(-CFG.shakeDecay * dt);
    shakeY *= Math.exp(-CFG.shakeDecay * dt);
    if (explosionCoreTimer > 0)
        explosionCoreTimer -= dt;
    // Particles run real-time (not slow-mo) for energetic explosion feel
    for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 18 * dt; // very gentle gravity — lets fast shards reach the viewport edges
        p.life -= p.decay * dt;
    }
    if (crashTimer >= CFG.crashDuration) {
        STATE = 'gameover';
        particles = [];
        shakeX = shakeY = 0;
        gameOverMusicStart();
    }
}
