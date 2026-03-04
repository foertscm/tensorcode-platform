'use strict';
// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (STATE === 'boot') {
        renderBoot(W, H);
        renderMuteButton(W, H);
        return;
    }
    if (STATE === 'gameover') {
        renderGameOver(W, H);
        renderMuteButton(W, H);
        return;
    }
    renderBackground(W, H);
    // Danger zone: drawn after background, before world elements (correct z-order)
    renderDangerZone(W, H);
    ctx.save();
    if (STATE === 'crash') {
        const px = toSX(player.x), py = player.y;
        const ox = (Math.random() - 0.5) * 2 * shakeX;
        const oy = (Math.random() - 0.5) * 2 * shakeY;
        ctx.translate(px + ox, py + oy);
        ctx.scale(crashZoom, crashZoom);
        ctx.translate(-px, -py);
    }
    else if (STATE === 'running' && toSX(player.x) < DANGER_ZONE_WIDTH) {
        // Very subtle world-shake when orbiter enters danger zone
        const depth = Math.max(0, (DANGER_ZONE_WIDTH - toSX(player.x)) / DANGER_ZONE_WIDTH);
        const dShake = depth * Math.sin(performance.now() / 1000 * 15);
        ctx.translate(dShake, dShake * 0.5);
    }
    renderAnchors(W, H);
    renderAttachHint();
    renderTrail();
    renderPlayer();
    renderYouMarker();
    renderParticles();
    renderFloatingTexts();
    ctx.restore();
    if (STATE === 'crash' && crashFade > 0) {
        ctx.fillStyle = `rgba(7,7,15,${crashFade})`;
        ctx.fillRect(0, 0, W, H);
    }
    // Explosion core flash — expands to fill most of the viewport
    if (STATE === 'crash' && explosionCoreTimer > 0) {
        const t = Math.max(0, explosionCoreTimer / 0.55);
        const cx = toSX(player.x), cy = player.y;
        // Expands from 40px up to 55% of the smaller viewport dimension
        const rMax = Math.min(W, H) * 0.55;
        const r = 40 + (1 - t) * rMax;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,255,255,${t * 0.98})`);
        g.addColorStop(0.15, `rgba(160,240,255,${t * 0.85})`);
        g.addColorStop(0.40, `rgba(0,160,255,${t * 0.55})`);
        g.addColorStop(0.70, `rgba(80,0,200,${t * 0.25})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // White flash on detach — tactile surge feedback
    if (detachFlashTimer > 0) {
        const alpha = (detachFlashTimer / 0.12) * 0.18;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }
    // Red anchor attach flash — brief crimson screen tint
    if (redFlashTimer > 0) {
        const alpha = (redFlashTimer / 0.35) * 0.10;
        ctx.fillStyle = `rgba(255,20,20,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }
    renderHUD(W, H);
    renderSpeedDisplay(W, H);
    renderOffScreenIndicator(W, H);
    if (inGameHintAlpha > 0)
        renderInGameHint(W, H);
    renderLegend(W, H);
    renderMuteButton(W, H);
}
// ── BOOT SCREEN ───────────────────────────────────────────────────────────────
// Draw the boot-demo orbiter at (px, py) with radius r and optional alpha
function _drawBootOrbiter(px, py, r, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, r * 2.6);
    pg.addColorStop(0, 'rgba(120,255,255,0.50)');
    pg.addColorStop(1, 'rgba(0,200,255,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#bbffff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(120,255,255,0.70)';
    ctx.beginPath();
    ctx.arc(px, py, r * 0.50, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
// Draw the [SPACE / CLICK] input hint capsule centred at (W/2, y)
function _drawInputCapsule(W, y, alpha) {
    if (alpha <= 0.01)
        return;
    const hs = Math.min(W * 0.021, 13);
    const label = '[ SPACE / CLICK / TAP ]';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${hs}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width;
    const padX = hs * 0.9, padY = hs * 0.45;
    const bw = tw + padX * 2, bh = hs + padY * 2;
    const bx = W / 2 - bw / 2, by = y - bh / 2;
    ctx.fillStyle = 'rgba(0,20,40,0.80)';
    ctx.strokeStyle = 'rgba(0,180,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (ctx.roundRect)
        ctx.roundRect(bx, by, bw, bh, bh / 2);
    else
        ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#88ddff';
    ctx.fillText(label, W / 2, y);
    ctx.restore();
}
// 3-phase boot demo: approach → magnetic capture → orbit → release  (~7.5 s loop)
function renderBootDemoAnimation(W, H, centerY) {
    const LOOP = 7.5;
    const P1_END = 1.6; // approach phase ends (orbiter reaches anchor vicinity)
    const TRANS_END = 2.2; // magnetic capture transition ends (0.6 s window)
    const P2_END = 4.4; // orbit phase ends (2.2 s of orbit)
    const P3_END = 6.2; // drift exits frame; 6.2–7.5 is silent pause
    const FADE = 0.28; // label fade-in / fade-out duration (seconds)
    const t = (performance.now() / 1000) % LOOP;
    const now = performance.now() / 1000;
    const anchorR = Math.min(W * 0.022, 16);
    const orbitR = anchorR * 3.4;
    const grabR = orbitR * 1.28; // attach-radius ring (slightly wider than orbit)
    const playerR = Math.max(4, anchorR * 0.46);
    const cx = W / 2, cy = centerY;
    const pulse = 0.88 + 0.12 * Math.sin(now * Math.PI * 3.5);
    // ── ANCHOR GLOW BOOST ────────────────────────────────────────────────────
    // Ramps up through transition, holds during orbit, fades at detach
    let glowBoost = 0;
    if (t >= P1_END && t < TRANS_END) {
        glowBoost = (t - P1_END) / (TRANS_END - P1_END);
    }
    else if (t >= TRANS_END && t < P2_END) {
        glowBoost = 1;
    }
    else if (t >= P2_END && t < P3_END) {
        glowBoost = Math.max(0, 1 - (t - P2_END) / 0.35);
    }
    else if (t < P1_END) {
        // slight pre-glow once orbiter enters grab radius
        const p = t / P1_END;
        const eased = p * (2 - p);
        const px = (cx - orbitR * 4.2) + (cx - orbitR * 1.1 - (cx - orbitR * 4.2)) * eased;
        if (px >= cx - grabR)
            glowBoost = Math.min(0.35, (px - (cx - grabR)) / grabR);
    }
    // ── ANCHOR ────────────────────────────────────────────────────────────────
    ctx.save();
    const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, anchorR * 2.4);
    haloG.addColorStop(0, `rgba(0,200,255,${0.25 + glowBoost * 0.30})`);
    haloG.addColorStop(1, 'rgba(0,100,200,0)');
    ctx.fillStyle = haloG;
    ctx.beginPath();
    ctx.arc(cx, cy, anchorR * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 30 + glowBoost * 24;
    const ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, anchorR);
    ag.addColorStop(0, '#bbf0ff');
    ag.addColorStop(0.4, '#33bbff');
    ag.addColorStop(1, '#006ecc');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(cx, cy, anchorR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#88ddff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, anchorR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, anchorR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ── PHASE 1 — APPROACH ───────────────────────────────────────────────────
    if (t < P1_END) {
        const p = t / P1_END;
        const eased = p * (2 - p); // ease-out: fast entry, decelerates near anchor
        const startX = cx - orbitR * 4.2;
        const endX = cx - orbitR * 1.1; // just outside orbit radius on the left
        const px = startX + (endX - startX) * eased;
        const py = cy;
        // Attach-radius ring fades in when orbiter is ~50 % of the way in
        const ringP = Math.max(0, Math.min(1, (p - 0.50) / 0.28));
        if (ringP > 0) {
            ctx.save();
            ctx.globalAlpha = ringP * 0.55;
            ctx.strokeStyle = '#00eeff';
            ctx.lineWidth = 1.4;
            ctx.shadowColor = '#00eeff';
            ctx.shadowBlur = 10;
            ctx.setLineDash([5, 9]);
            ctx.beginPath();
            ctx.arc(cx, cy, grabR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        // Anchor highlight when orbiter enters the grab zone
        if (px >= cx - grabR) {
            const ent = Math.min(1, (px - (cx - grabR)) / (grabR * 0.5));
            ctx.save();
            ctx.globalAlpha = ent * 0.35;
            ctx.fillStyle = 'rgba(0,180,255,0.5)';
            ctx.shadowColor = '#00eeff';
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(cx, cy, anchorR * 1.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        _drawBootOrbiter(px, py, playerR * pulse);
    }
    // ── TRANSITION — MAGNETIC CAPTURE ────────────────────────────────────────
    if (t >= P1_END && t < TRANS_END) {
        const p = (t - P1_END) / (TRANS_END - P1_END); // 0 → 1
        const ep = p * p * (3 - 2 * p); // smoothstep
        // Quadratic bezier: approach-end → orbit-start (top), curves up and inward
        const bStartX = cx - orbitR * 1.1, bStartY = cy;
        const bCtrlX = cx - orbitR * 0.25, bCtrlY = cy - orbitR * 0.9;
        const bEndX = cx, bEndY = cy - orbitR;
        const bx = (1 - ep) * (1 - ep) * bStartX + 2 * (1 - ep) * ep * bCtrlX + ep * ep * bEndX;
        const by = (1 - ep) * (1 - ep) * bStartY + 2 * (1 - ep) * ep * bCtrlY + ep * ep * bEndY;
        // Energy line: orbiter → anchor, visible first 45 % of transition then fades
        const lineA = Math.max(0, (0.45 - p) / 0.45) * 0.65;
        if (lineA > 0.01) {
            ctx.save();
            ctx.strokeStyle = `rgba(0,220,255,${lineA.toFixed(2)})`;
            ctx.lineWidth = 1.2;
            ctx.shadowColor = '#00eeff';
            ctx.shadowBlur = 10;
            ctx.setLineDash([3, 6]);
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(cx, cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }
        // Anchor pulse ring — expands outward once during capture
        const ringR = anchorR + p * anchorR * 4.5;
        const ringA = (1 - p) * 0.50;
        ctx.save();
        ctx.strokeStyle = `rgba(0,220,255,${ringA.toFixed(2)})`;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = '#00eeff';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        _drawBootOrbiter(bx, by, playerR * pulse);
    }
    // ── PHASE 2 — ORBIT ──────────────────────────────────────────────────────
    if (t >= TRANS_END && t < P2_END) {
        const p = (t - TRANS_END) / (P2_END - TRANS_END);
        const angle = -Math.PI / 2 + p * Math.PI * 2.2; // top → clockwise, 2.2π sweep
        const px = cx + orbitR * Math.cos(angle);
        const py = cy + orbitR * Math.sin(angle);
        // Dashed orbit guide ring
        ctx.save();
        ctx.strokeStyle = 'rgba(0,200,255,0.28)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        _drawBootOrbiter(px, py, playerR * pulse);
        // Input capsule fades in quickly, holds through full orbit
        const capsAlpha = Math.min(1, p / 0.18);
        _drawInputCapsule(W, cy + orbitR + anchorR * 5.0, capsAlpha);
    }
    // ── PHASE 3 — DETACH & DRIFT ─────────────────────────────────────────────
    if (t >= P2_END && t < P3_END) {
        const p = (t - P2_END) / (P3_END - P2_END);
        const endAngle = -Math.PI / 2 + Math.PI * 2.2;
        const sx = cx + orbitR * Math.cos(endAngle);
        const sy = cy + orbitR * Math.sin(endAngle);
        // Tangent at end of orbit, biased forward (rightward)
        const tanX = -Math.sin(endAngle);
        const tanY = Math.cos(endAngle);
        const rawX = tanX * 0.55 + 0.75;
        const rawY = tanY * 0.55 + 0.25;
        const len = Math.sqrt(rawX * rawX + rawY * rawY);
        const ndx = rawX / len, ndy = rawY / len;
        const speed = orbitR * 5.0;
        const eased = p * (2 - p);
        const driftX = sx + ndx * speed * eased;
        const driftY = sy + ndy * speed * eased;
        const alpha = Math.max(0, 1 - Math.max(0, p - 0.65) / 0.35);
        // Motion streaks behind the orbiter
        for (let i = 5; i >= 1; i--) {
            const tp = Math.max(0, p - i * 0.04);
            const te = tp * (2 - tp);
            const trX = sx + ndx * speed * te;
            const trY = sy + ndy * speed * te;
            ctx.save();
            ctx.globalAlpha = (1 - i / 6) * 0.60 * (1 - p * 0.55);
            ctx.fillStyle = '#55eeff';
            ctx.beginPath();
            ctx.arc(trX, trY, playerR * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        _drawBootOrbiter(driftX, driftY, playerR, alpha);
        // Input capsule dims immediately on release
        const capsAlpha = Math.max(0, 1 - p / 0.28);
        _drawInputCapsule(W, cy + orbitR + anchorR * 5.0, capsAlpha);
    }
    // ── PHASE TEXT LABELS ─────────────────────────────────────────────────────
    const hs = Math.min(W * 0.026, 17);
    const textY = cy + orbitR + hs * 1.8;
    function drawPhaseLabel(label, localT, duration) {
        let a;
        if (localT < FADE)
            a = localT / FADE;
        else if (localT < duration - FADE)
            a = 1;
        else
            a = (duration - localT) / FADE;
        a = Math.max(0, Math.min(1, a));
        if (a < 0.01)
            return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.shadowColor = '#00aaff';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#66ddff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${hs}px monospace`;
        ctx.fillText(label, W / 2, textY);
        ctx.restore();
    }
    // Phase 1 label spans approach + transition (same narrative: "get close")
    if (t < TRANS_END)
        drawPhaseLabel('APPROACH AN ANCHOR', t, TRANS_END);
    else if (t < P2_END)
        drawPhaseLabel('HOLD TO ORBIT', t - TRANS_END, P2_END - TRANS_END);
    else if (t < P3_END)
        drawPhaseLabel('RELEASE TO LAUNCH', t - P2_END, P3_END - P2_END);
    // t ∈ [P3_END, LOOP): silent pause before next loop — no label
    ctx.textBaseline = 'alphabetic';
}
function renderBoot(W, H) {
    renderBackground(W, H);
    const ts = Math.min(W * 0.07, 56);
    const ss = Math.min(W * 0.026, 17);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Layered neon title — outer bloom, mid colour, bright core
    ctx.font = `bold ${ts}px monospace`;
    ctx.shadowColor = '#0066cc';
    ctx.shadowBlur = 52;
    ctx.fillStyle = '#003366';
    ctx.fillText('NEON DRIFT', W / 2, H * 0.38);
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('NEON DRIFT', W / 2, H * 0.38);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NEON DRIFT', W / 2, H * 0.38);
    ctx.shadowBlur = 0;
    // Demo animation — includes dynamic instructional text tied to animation state
    renderBootDemoAnimation(W, H, H * 0.62);
    // Best score
    if (highScore > 0) {
        ctx.fillStyle = '#1a3040';
        ctx.font = `${ss}px monospace`;
        ctx.fillText(`Best: ${fmt(highScore)}`, W / 2, H * 0.91);
    }
    ctx.textBaseline = 'alphabetic';
}
// ── ONBOARDING: "YOU" MARKER ──────────────────────────────────────────────────
function renderYouMarker() {
    if (youAlpha <= 0)
        return;
    const px = toSX(player.x), py = player.y;
    const now = performance.now() / 1000;
    const bob = Math.sin(now * 3.5) * 2.5; // ±2.5 px vertical float
    // One-shot entrance scale pulse: 1.0 → 1.10 → 1.0 over first 0.5 s
    const scalePulse = 1 + 0.10 * Math.max(0, Math.sin(Math.PI * Math.min(1, youTimer * 2.0)));
    const fs = Math.min(canvas.width * 0.034, 28); // ~2× larger than before
    const textY = py - 62 - bob; // higher to clear larger text + player glow
    const arrowTip = py - 16;
    const arrowBase = textY + 6;
    ctx.save();
    ctx.globalAlpha = youAlpha;
    // Vertical connector line
    ctx.strokeStyle = 'rgba(0,210,255,0.80)';
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px, arrowBase);
    ctx.lineTo(px, arrowTip + 6);
    ctx.stroke();
    // Downward arrowhead — proportionally larger
    ctx.fillStyle = '#00ddff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(px, arrowTip);
    ctx.lineTo(px - 5, arrowTip + 9);
    ctx.lineTo(px + 5, arrowTip + 9);
    ctx.closePath();
    ctx.fill();
    // "YOU" label — large, bold, with scale pulse and layered neon glow
    ctx.font = `bold ${fs}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Apply scale pulse centred on text position
    ctx.translate(px, textY);
    ctx.scale(scalePulse, scalePulse);
    ctx.translate(-px, -textY);
    // Outer glow layer — cyan bloom
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#00ddff';
    ctx.fillText('YOU', px, textY);
    // Bright white core
    ctx.shadowColor = '#aaeeff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('YOU', px, textY);
    // Subtle cyan stroke outline for crispness
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#00eeff';
    ctx.lineWidth = 0.8;
    ctx.strokeText('YOU', px, textY);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
// ── ONBOARDING: CONTEXTUAL ATTACH HINT ────────────────────────────────────────
function renderAttachHint() {
    if (!attachHintAnchor || attachHintAlpha <= 0 || player.orbiting)
        return;
    const ax = toSX(attachHintAnchor.x);
    const ay = attachHintAnchor.y;
    const hintY = ay - attachHintAnchor.r - 18;
    ctx.save();
    ctx.globalAlpha = attachHintAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.min(canvas.width * 0.015, 12);
    const text = 'INTERACT TO ATTACH';
    ctx.font = `bold ${fs}px monospace`;
    const tw = ctx.measureText(text).width;
    const padX = 7, padY = 4;
    // Semi-transparent background pill
    ctx.fillStyle = 'rgba(0,16,36,0.80)';
    ctx.beginPath();
    if (ctx.roundRect)
        ctx.roundRect(ax - tw / 2 - padX, hintY - fs / 2 - padY, tw + padX * 2, fs + padY * 2, 4);
    else
        ctx.rect(ax - tw / 2 - padX, hintY - fs / 2 - padY, tw + padX * 2, fs + padY * 2);
    ctx.fill();
    // Cyan label
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#66ddff';
    ctx.fillText(text, ax, hintY);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
// ── IN-GAME HINT OVERLAY ──────────────────────────────────────────────────────
function renderInGameHint(W, H) {
    if (inGameHintAlpha <= 0)
        return;
    const hs = Math.min(W * 0.036, 24);
    ctx.save();
    ctx.globalAlpha = inGameHintAlpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineH = hs * 1.55;
    const cy = H * 0.88;
    // Subtle dark pill background for readability over gameplay
    const padX = Math.min(W * 0.38, 280), padY = lineH * 0.5;
    ctx.fillStyle = 'rgba(4,10,20,0.62)';
    const rx = W / 2 - padX, ry = cy - lineH - padY;
    const rw = padX * 2, rh = lineH * 2 + padY * 2;
    const rad = 10;
    ctx.beginPath();
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + rw - rad, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
    ctx.lineTo(rx + rw, ry + rh - rad);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
    ctx.lineTo(rx + rad, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
    ctx.lineTo(rx, ry + rad);
    ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
    ctx.closePath();
    ctx.fill();
    ctx.font = `bold ${hs}px monospace`;
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#55ccff';
    ctx.fillText('HOLD SPACE / TAP / CLICK TO ORBIT', W / 2, cy - lineH * 0.5);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#2299bb';
    ctx.fillText('RELEASE TO DRIFT', W / 2, cy + lineH * 0.5);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
// ── GAME OVER SCREEN ──────────────────────────────────────────────────────────
function renderGameOver(W, H) {
    ctx.fillStyle = 'rgba(7,7,15,0.97)';
    ctx.fillRect(0, 0, W, H);
    // Slow pulsing vignette — distinguishes this state visually, breathes with the music
    const vigPulse = 0.5 + 0.5 * Math.sin(performance.now() / 1800);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,20,${0.28 + vigPulse * 0.14})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // ── GAME OVER title ──────────────────────────────────────────────────────
    const ts = Math.min(W * 0.075, 58);
    ctx.shadowColor = '#ee3333';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ff5555';
    ctx.font = `bold ${ts}px monospace`;
    ctx.fillText('GAME OVER', W / 2, H * 0.17);
    ctx.shadowBlur = 0;
    // ── Dominant score number ────────────────────────────────────────────────
    const scoreFs = Math.min(W * 0.19, 148);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
    const glowBlur = 30 + pulse * 26;
    // Small "FINAL SCORE" label above the number
    const labelFs = Math.min(W * 0.026, 19);
    ctx.fillStyle = '#3a5070';
    ctx.font = `${labelFs}px monospace`;
    ctx.fillText('FINAL SCORE', W / 2, H * 0.40 - scoreFs * 0.56);
    ctx.shadowColor = '#44aaff';
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${scoreFs}px monospace`;
    ctx.fillText(fmt(goScore), W / 2, H * 0.42);
    ctx.shadowBlur = 0;
    // ── Stats row ────────────────────────────────────────────────────────────
    const ss = Math.min(W * 0.030, 21);
    const lineH = ss * 1.75;
    const startY = H * 0.64;
    const stats = [
        ['Best Score', fmt(highScore)],
        ['Max Combo', `×${goMaxCombo}`],
    ];
    stats.forEach(([label, val], i) => {
        const y = startY + i * lineH;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#3d5265';
        ctx.font = `${ss * 0.82}px monospace`;
        ctx.fillText(label + ':', W / 2 - 8, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#c8ddf0';
        ctx.font = `bold ${ss * 0.82}px monospace`;
        ctx.fillText(val, W / 2 + 8, y);
    });
    // ── Restart prompt ───────────────────────────────────────────────────────
    const blink = (performance.now() % 950) < 580;
    ctx.textAlign = 'center';
    ctx.fillStyle = blink ? '#99aacc' : '#2a3a4a';
    ctx.font = `${Math.min(W * 0.026, 19)}px monospace`;
    ctx.fillText('SPACE  ·  CLICK  ·  TAP  to restart', W / 2, H * 0.84);
    ctx.textBaseline = 'alphabetic';
}
// ── CYBERPUNK BACKGROUND ──────────────────────────────────────────────────────
function renderBackground(W, H) {
    // Clear canvas — background video shows through the transparent canvas
    ctx.clearRect(0, 0, W, H);
    // Grid lines — vertical scroll with camera, horizontal static
    const sp = 90;
    const cam = cameraX || 0;
    const ox = -((cam % sp + sp) % sp);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(0,180,255,0.045)';
    for (let gx = ox; gx < W + sp; gx += sp) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
    }
    for (let gy = sp; gy < H; gy += sp) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
    }
    // Scanline overlay
    ctx.fillStyle = 'rgba(0,0,0,0.028)';
    for (let sy = 0; sy < H; sy += 5) {
        ctx.fillRect(0, sy, W, 2);
    }
}
// ── DANGER ZONE ───────────────────────────────────────────────────────────────
function renderDangerZone(W, H) {
    const now = performance.now() / 1000;
    const playerSX = toSX(player.x);
    const inZone = playerSX < DANGER_ZONE_WIDTH;
    // Opacity: base 0.5, smooth pulse to 0.7 when player enters zone
    const baseA = inZone
        ? 0.60 + 0.10 * Math.sin(now * 10) // 0.5 ↔ 0.7 smooth pulse
        : 0.50;
    // Gradient strip: full opacity at left edge, fades to transparent at DANGER_ZONE_WIDTH px
    const grad = ctx.createLinearGradient(0, 0, DANGER_ZONE_WIDTH, 0);
    grad.addColorStop(0, `rgba(220,0,0,${baseA})`);
    grad.addColorStop(1, 'rgba(220,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, DANGER_ZONE_WIDTH, H);
    // Red screen vignette when orbiter is inside the zone
    if (inZone) {
        const vigA = 0.07 + 0.04 * Math.sin(now * 10);
        const vg = ctx.createRadialGradient(W * 0.1, H / 2, 0, W / 2, H / 2, W * 0.65);
        vg.addColorStop(0, `rgba(180,0,0,${vigA})`);
        vg.addColorStop(1, 'rgba(180,0,0,0)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
    }
}
// ── ANCHORS ───────────────────────────────────────────────────────────────────
function renderAnchors(W, H) {
    const now = performance.now() / 1000;
    // Primary highlight target: nearest upcoming unused anchor by world X
    let primaryAnchor = null, primaryDx = Infinity;
    for (const a of anchors) {
        if (!a.used && a.x > player.x) {
            const dx = a.x - player.x;
            if (dx < primaryDx) {
                primaryDx = dx;
                primaryAnchor = a;
            }
        }
    }
    for (const a of anchors) {
        const asx = toSX(a.x);
        if (asx < -190 || asx > W + 190)
            continue;
        const asy = a.y;
        const isPrimary = a === primaryAnchor;
        const isOrbit = player.orbiting && player.orbitAnchor === a;
        // Per-anchor phase offset so they pulse out of sync
        const phaseOff = (a.x * 0.019 + a.y * 0.013) % (Math.PI * 2);
        const pulse = 0.5 + 0.5 * Math.sin(now * 2.6 + phaseOff);
        // Faint orbit ring while attached
        if (isOrbit) {
            ctx.strokeStyle = `rgba(${a.rgb},0.10)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(asx, asy, CFG.orbitRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (!a.used) {
            // ── Layer 1: Outer Glow (additive blend) ──────────────────────────────
            let gr, ga;
            if (isPrimary) {
                const dist = Math.sqrt((a.x - player.x) ** 2 + (a.y - player.y) ** 2);
                const hf = Math.max(0, 1 - dist / (W * 0.55));
                gr = 30 + hf * 30 + pulse * 14;
                ga = 0.20 + hf * 0.35;
            }
            else {
                gr = 22 + pulse * 8;
                ga = 0.14 + pulse * 0.09;
            }
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const gg = ctx.createRadialGradient(asx, asy, 0, asx, asy, gr);
            gg.addColorStop(0, `rgba(${a.rgb},${ga})`);
            gg.addColorStop(1, `rgba(${a.rgb},0)`);
            ctx.fillStyle = gg;
            ctx.beginPath();
            ctx.arc(asx, asy, gr, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            // ── Layer 2: Rotating Energy Ring ─────────────────────────────────────
            const rotSpeed = a.ti === 0 ? 2.4 : a.ti === 1 ? 1.4 : 0.9;
            // Primary ring — rotates clockwise
            ctx.save();
            ctx.translate(asx, asy);
            ctx.rotate(now * rotSpeed + phaseOff);
            ctx.setLineDash([4, 7]);
            ctx.strokeStyle = `rgba(${a.rgb},${0.28 + pulse * 0.42})`;
            ctx.lineWidth = 1.3;
            ctx.shadowColor = a.hex;
            ctx.shadowBlur = 3 + pulse * 7;
            ctx.beginPath();
            ctx.arc(0, 0, a.r + 3 + pulse * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            ctx.restore();
            // Counter-rotating outer ring — only on primary anchor for extra flair
            if (isPrimary) {
                ctx.save();
                ctx.translate(asx, asy);
                ctx.rotate(-(now * rotSpeed * 0.55) + phaseOff);
                ctx.setLineDash([2, 11]);
                ctx.strokeStyle = `rgba(${a.rgb},${0.12 + pulse * 0.16})`;
                ctx.lineWidth = 0.8;
                ctx.shadowColor = a.hex;
                ctx.shadowBlur = 2;
                ctx.beginPath();
                ctx.arc(0, 0, a.r + 8 + pulse * 4, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.shadowBlur = 0;
                ctx.restore();
            }
            // ── Layer 3: Core Gradient (centre→bright, mid→saturated, edge→dark) ──
            const hx = asx - a.r * 0.28;
            const hy = asy - a.r * 0.28;
            const coreG = ctx.createRadialGradient(hx, hy, 0, asx, asy, a.r);
            if (a.ti === 0) {
                // Neon lime — vibrant, high-risk
                coreG.addColorStop(0, '#d0ffe8');
                coreG.addColorStop(0.28, '#39ff6a');
                coreG.addColorStop(0.65, '#0c7028');
                coreG.addColorStop(1, '#030f06');
            }
            else if (a.ti === 1) {
                // Electric cyan — standard
                coreG.addColorStop(0, '#d0f6ff');
                coreG.addColorStop(0.28, '#00d4ff');
                coreG.addColorStop(0.65, '#004e70');
                coreG.addColorStop(1, '#00090e');
            }
            else {
                // Neon crimson — safe but heavy
                coreG.addColorStop(0, '#ffd0dc');
                coreG.addColorStop(0.28, '#ff1a4e');
                coreG.addColorStop(0.65, '#6e001a');
                coreG.addColorStop(1, '#0f0003');
            }
            ctx.fillStyle = coreG;
            ctx.beginPath();
            ctx.arc(asx, asy, a.r, 0, Math.PI * 2);
            ctx.fill();
            // Subtle pulsing centre highlight (very slight brightness breath)
            const cf = ctx.createRadialGradient(asx, asy, 0, asx, asy, a.r * 0.55);
            cf.addColorStop(0, `rgba(255,255,255,${0.04 + pulse * 0.13})`);
            cf.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = cf;
            ctx.beginPath();
            ctx.arc(asx, asy, a.r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            // ── Inner Spark Particles ──────────────────────────────────────────────
            ctx.shadowColor = a.hex;
            ctx.shadowBlur = 5;
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            const sc = a.ti === 0 ? 2 : a.ti === 1 ? 3 : 4;
            for (let s = 0; s < sc; s++) {
                const sa = now * 4.2 * (s % 2 === 0 ? 1 : -1.4) + (s * Math.PI * 2 / sc) + phaseOff;
                const sr = a.r * (0.22 + 0.14 * Math.sin(now * 3.1 + s * 1.9));
                ctx.beginPath();
                ctx.arc(asx + Math.cos(sa) * sr, asy + Math.sin(sa) * sr, 0.9, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }
        else {
            // ── Used / spent anchor ────────────────────────────────────────────────
            const ug = ctx.createRadialGradient(asx, asy, 0, asx, asy, 14);
            ug.addColorStop(0, 'rgba(55,55,90,0.06)');
            ug.addColorStop(1, 'rgba(55,55,90,0)');
            ctx.fillStyle = ug;
            ctx.beginPath();
            ctx.arc(asx, asy, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0c0c1a';
            ctx.beginPath();
            ctx.arc(asx, asy, a.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
// ── TRAIL ─────────────────────────────────────────────────────────────────────
function renderTrail() {
    if (trail.length < 2)
        return;
    for (let i = 1; i < trail.length; i++) {
        const p = i / trail.length;
        ctx.strokeStyle = `rgba(0,210,255,${p * 0.55})`;
        ctx.lineWidth = p * 2.8;
        ctx.beginPath();
        ctx.moveTo(toSX(trail[i - 1].x), trail[i - 1].y);
        ctx.lineTo(toSX(trail[i].x), trail[i].y);
        ctx.stroke();
    }
}
// ── PLAYER ────────────────────────────────────────────────────────────────────
function renderPlayer() {
    if (STATE === 'crash')
        return; // orbiter has shattered — explosion takes over
    const px = toSX(player.x), py = player.y;
    // Onboarding highlight pulse — soft expanding ring, active during onboarding phase
    if (obPulseAlpha > 0) {
        const now = performance.now() / 1000;
        const pt = (now % 1.2) / 1.2; // 0→1 per 1.2s period
        const pR = CFG.playerGlowR * (1.2 + pt * 3.2); // expands outward
        const pA = (1 - pt) * 0.55 * obPulseAlpha; // fades as it expands
        if (pA > 0.005) {
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pR);
            pg.addColorStop(0, `rgba(0,220,255,0)`);
            pg.addColorStop(0.5, `rgba(0,220,255,${pA * 0.5})`);
            pg.addColorStop(1, `rgba(0,180,255,0)`);
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(px, py, pR, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Combo burst ring — expands outward on combo gain
    if (playerBurstTimer > 0) {
        const t = playerBurstTimer / 0.30;
        const bR = CFG.playerGlowR + (1 - t) * 40;
        const col = lastColorName === 'GREEN' ? '57,255,106'
            : lastColorName === 'RED' ? '255,26,78'
                : '0,212,255';
        const bg = ctx.createRadialGradient(px, py, 0, px, py, bR);
        bg.addColorStop(0, `rgba(${col},${t * 0.45})`);
        bg.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(px, py, bR, 0, Math.PI * 2);
        ctx.fill();
    }
    // Outer wide energy aura — slightly boosted while "YOU" marker is visible
    const _youB = 1 + 0.10 * youAlpha;
    const aura = ctx.createRadialGradient(px, py, 0, px, py, CFG.playerGlowR * 2.2);
    aura.addColorStop(0, `rgba(0,200,255,${(0.20 * _youB).toFixed(2)})`);
    aura.addColorStop(0.5, `rgba(0,140,220,${(0.08 * _youB).toFixed(2)})`);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(px, py, CFG.playerGlowR * 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Inner core glow
    const g = ctx.createRadialGradient(px, py, 0, px, py, CFG.playerGlowR);
    g.addColorStop(0, 'rgba(130,235,255,0.90)');
    g.addColorStop(0.38, 'rgba(60,185,255,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, CFG.playerGlowR, 0, Math.PI * 2);
    ctx.fill();
    // Core dot with neon shadow
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, CFG.playerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}
// ── PARTICLES ─────────────────────────────────────────────────────────────────
function renderParticles() {
    if (particles.length === 0)
        return;
    // Additive blending during explosion — neon shards bloom against the dark
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
        if (p.life <= 0)
            continue;
        const a = Math.max(0, p.life);
        ctx.globalAlpha = a * a; // quadratic fade — bright mid-life, sharp fade-out
        ctx.shadowColor = p.color || '#ffffff';
        ctx.shadowBlur = 12;
        ctx.fillStyle = p.color || `hsl(${p.hue ?? 30},100%,70%)`;
        ctx.beginPath();
        ctx.arc(toSX(p.x), p.y, Math.max(0.4, p.r * (0.4 + p.life * 0.6)), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
}
// ── FLOATING TEXTS ────────────────────────────────────────────────────────────
function renderFloatingTexts() {
    const fsNorm = Math.min(canvas.width * 0.028, 17);
    const fsLarge = Math.min(canvas.width * 0.044, 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of floatingTexts) {
        if (ft.life <= 0)
            continue;
        const fs = ft.large ? fsLarge : fsNorm;
        ctx.globalAlpha = Math.min(1, ft.life * 1.8);
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = ft.large ? 14 : 7;
        ctx.fillStyle = ft.color;
        ctx.font = `bold ${fs}px monospace`;
        ctx.fillText(ft.text, toSX(ft.wx), ft.wy);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
}
// ── SPEED DISPLAY ─────────────────────────────────────────────────────────────
function renderSpeedDisplay(W, H) {
    const now = performance.now() / 1000;
    const inZone = toSX(player.x) < DANGER_ZONE_WIDTH;
    // Danger zone flicker — brief brightness spike, stops the moment player leaves
    const flickerPhase = Math.floor(now * 19); // ~19 Hz flicker clock
    const isFlicker = inZone && (flickerPhase % 7 === 0 || flickerPhase % 13 === 0);
    // Escalation: color and glow shift as speed climbs
    let col, glowCol, glowAmt;
    if (_speedKmh >= 700) {
        col = '#ffcc99'; // shift toward white-orange
        glowCol = '#ff8844';
        glowAmt = 14 + Math.sin(now * 7) * 5;
    }
    else if (_speedKmh >= 500) {
        col = '#ff9966'; // warm orange
        glowCol = '#ff5511';
        glowAmt = 10 + Math.sin(now * 5) * 3;
    }
    else if (_speedKmh >= 300) {
        col = '#ff5500'; // classic neon orange-red
        glowCol = '#cc2200';
        glowAmt = 6 + Math.sin(now * 6) * 3; // pulsing glow
    }
    else {
        col = '#ff4400';
        glowCol = '#cc2200';
        glowAmt = 5;
    }
    // Danger flicker: brightness spike
    if (isFlicker) {
        glowAmt *= 2.2;
        col = '#ffffff';
    }
    ctx.save();
    // 700+ km/h: subtle sine-wave vibration
    if (_speedKmh >= 700) {
        ctx.translate(Math.sin(now * 29) * 1.2, Math.sin(now * 23) * 0.7);
    }
    const size = Math.min(W * 0.032, 26);
    const px = W + 120;
    const py = 40;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = `bold ${size}px monospace`;
    // Subtle dark panel background
    const text = `${_speedKmh} km/h`;
    const tw = ctx.measureText(text).width;
    const pad = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(px - tw - pad, py - size - pad, tw + pad * 2, size + pad * 2);
    // LED digit rendering
    ctx.shadowColor = glowCol;
    ctx.shadowBlur = glowAmt;
    ctx.fillStyle = col;
    ctx.fillText(text, px / 2, py);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
}
// ── HUD ───────────────────────────────────────────────────────────────────────
function renderHUD(W, H) {
    const f = Math.min(W * 0.04, 25);
    ctx.textBaseline = 'top';
    // Score (top-left) — holographic glow always; stronger tint when orbiting
    ctx.textAlign = 'left';
    const orbiting = player.orbiting;
    const scoreCol = orbiting ? player.orbitAnchor.hex : '#a0d8f0';
    ctx.shadowColor = orbiting ? player.orbitAnchor.hex : '#00aacc';
    ctx.shadowBlur = orbiting ? 14 : 6;
    ctx.fillStyle = scoreCol;
    ctx.font = `bold ${f}px monospace`;
    ctx.fillText(fmtScore(score), 16, 14);
    ctx.shadowBlur = 0;
    // Color combo (top-right) — only shown when count ≥ 2
    ctx.textAlign = 'right';
    if (colorComboCount >= 2) {
        const comboCol = lastColorName === 'GREEN' ? '#39ff6a'
            : lastColorName === 'RED' ? '#ff1a4e'
                : '#00d4ff';
        const pulse = comboPulseTimer > 0 ? comboPulseTimer / 0.38 : 0;
        if (pulse > 0) {
            ctx.shadowColor = comboCol;
            ctx.shadowBlur = 8 + pulse * 18;
        }
        ctx.fillStyle = comboCol;
        ctx.font = `bold ${f}px monospace`;
        ctx.fillText(`COMBO: ${lastColorName} ×${colorComboCount}`, W - 16, 14);
        ctx.shadowBlur = 0;
    }
    // Best score (smaller, below combo)
    if (highScore > 0) {
        ctx.fillStyle = '#1a3040';
        ctx.font = `${f * 0.6}px monospace`;
        ctx.fillText(`Best ${fmt(highScore)}`, W - 16, f + 22);
    }
    ctx.textBaseline = 'alphabetic';
}
// ── OFF-SCREEN INDICATOR (right / top / bottom edges) ────────────────────────
// Base shape: right-pointing triangle with tip at origin.
// ctx.rotate() orients it for each edge without duplicating draw code.
//   angle =       0  → tip points →  (right edge)
//   angle = -PI/2    → tip points ↓  (top edge, into screen)
//   angle = +PI/2    → tip points ↑  (bottom edge, into screen)
// Priority: right > top > bottom  (horizontal exit shown exclusively if both apply)
function renderOffScreenIndicator(W, H) {
    if (STATE !== 'running')
        return;
    const px = toSX(player.x);
    const py = player.y;
    const PAD = 14;
    const MGN = 20;
    let arrowX, arrowY, angle, dist;
    if (px > W) {
        // Player exited right
        dist = px - W;
        arrowX = W - MGN;
        arrowY = Math.max(PAD, Math.min(H - PAD, py));
        angle = 0;
    }
    else if (py < 0) {
        // Player exited top — arrow at top edge pointing ↓ into screen
        dist = -py;
        arrowX = Math.max(PAD, Math.min(W - PAD, px));
        arrowY = MGN;
        angle = -Math.PI / 2;
    }
    else if (py > H) {
        // Player exited bottom — arrow at bottom edge pointing ↑ into screen
        dist = py - H;
        arrowX = Math.max(PAD, Math.min(W - PAD, px));
        arrowY = H - MGN;
        angle = Math.PI / 2;
    }
    else {
        return; // on-screen (or off left = death zone, no indicator)
    }
    const fadeIn = Math.min(1, dist / 60);
    const pulse = 1 + 0.05 * Math.sin(runTime * 5.5);
    const distScale = 1 + Math.min(dist / 900, 0.25);
    const size = 12 * pulse * distScale;
    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(angle);
    // Soft aura — sits between tip and base in local space
    ctx.globalAlpha = 0.22 * fadeIn;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.arc(-size * 0.5, 0, size * 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Arrow triangle — tip at local origin, base extends in −X direction
    ctx.globalAlpha = 0.88 * fadeIn;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.moveTo(0, 0); // tip
    ctx.lineTo(-size * 1.6, -size * 0.85); // base top corner
    ctx.lineTo(-size * 1.6, size * 0.85); // base bottom corner
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
// ── ANCHOR LEGEND (bottom-right) ──────────────────────────────────────────────
function renderLegend(W, H) {
    ctx.save();
    // Explicit reset — legend colours must never inherit state from HUD or other draw calls
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    const ITEMS = [
        { hex: '#39ff6a', rgb: '57,255,106', label: 'High Risk', mult: '×10' },
        { hex: '#00d4ff', rgb: '0,212,255', label: 'Standard', mult: '×3' },
        { hex: '#ff1a4e', rgb: '255,26,78', label: 'Penalty', mult: '×1' },
    ];
    const fs = Math.min(W * 0.029, 21);
    const padX = 16, padY = 13;
    const rowH = fs * 1.75;
    const boxW = Math.min(W * 0.23, 210);
    const boxH = padY * 2 + fs * 1.5 + rowH * 3;
    const bx = W - boxW - 14;
    const by = H - boxH - 14;
    // Semi-transparent panel
    ctx.fillStyle = 'rgba(2,10,26,0.72)';
    ctx.strokeStyle = 'rgba(0,180,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect)
        ctx.roundRect(bx, by, boxW, boxH, 4);
    else
        ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    // "ANCHORS" header
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,190,255,0.42)';
    ctx.font = `${fs * 0.80}px monospace`;
    ctx.fillText('ANCHORS', bx + padX, by + padY);
    ITEMS.forEach((item, i) => {
        const ry = by + padY + fs * 1.5 + i * rowH;
        // Coloured dot with stronger glow
        ctx.shadowColor = item.hex;
        ctx.shadowBlur = 8;
        ctx.fillStyle = item.hex;
        ctx.beginPath();
        ctx.arc(bx + padX + fs * 0.55, ry + fs * 0.52, fs * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Label
        ctx.fillStyle = 'rgba(165,205,230,0.65)';
        ctx.font = `${fs}px monospace`;
        ctx.fillText(item.label, bx + padX + fs * 1.45, ry);
        // Multiplier right-aligned, coloured
        ctx.shadowColor = item.hex;
        ctx.shadowBlur = 5;
        ctx.fillStyle = item.hex;
        ctx.textAlign = 'right';
        ctx.fillText(item.mult, bx + boxW - padX, ry);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
    });
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
// ── MUTE BUTTON ───────────────────────────────────────────────────────────────
function renderMuteButton(W, H) {
    const size = Math.min(W * 0.04, 28);
    const bx = size;
    const by = H - 50;
    MUTE_BTN.x = bx;
    MUTE_BTN.y = by;
    MUTE_BTN.size = size;
    ctx.save();
    // Button background
    ctx.fillStyle = isMuted ? 'rgba(70,0,0,0.70)' : 'rgba(0,15,42,0.60)';
    ctx.strokeStyle = isMuted ? 'rgba(255,60,60,0.55)' : 'rgba(0,160,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect)
        ctx.roundRect(bx, by, size, size, 5);
    else
        ctx.rect(bx, by, size, size);
    ctx.fill();
    ctx.stroke();
    // Glow ring
    ctx.shadowColor = isMuted ? '#ff3333' : '#3399ff';
    ctx.shadowBlur = isMuted ? 10 : 4;
    // Icon
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isMuted ? '#ff7777' : '#88ccff';
    ctx.font = `${Math.floor(size * 0.66)}px serif`;
    ctx.fillText(isMuted ? '🔇' : '🔊', bx + size * 0.5, by + size * 0.5);
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
}
