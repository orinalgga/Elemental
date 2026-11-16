// 원소 난투 캐릭터 그림. 이미지 파일 없이 Canvas 도형으로 SD(큰 머리) 캐릭터를 그린다.
// (x, y)는 캐릭터 몸통 중심이고, 판정 반지름(약 18)과 맞춰져 있다.
(() => {
    'use strict';

    const SKIN = '#ffe3cc';
    const LINE = '#3d2b2b';

    const LOOKS = {
        hwarang: { hair: '#e8452c', hairDark: '#b32d1a', outfit: '#ff7a45', outfitDark: '#c94f22', accent: '#ffc53d', size: 1 },
        sua: { hair: '#2f7fe0', hairDark: '#1f5bb0', outfit: '#9fd4ff', outfitDark: '#5aa6e8', accent: '#e9f6ff', size: 1 },
        punghu: { hair: '#3fae6a', hairDark: '#2a7f4b', outfit: '#7fe0a4', outfitDark: '#45b673', accent: '#f4fff7', size: 0.95 },
        gangdol: { hair: '#7a4d2a', hairDark: '#573418', outfit: '#d39b5a', outfitDark: '#a26f35', accent: '#8d8d99', size: 1.1 },
    };

    function ellipse(ctx, cx, cy, rx, ry, fill, stroke, lw = 1.5) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
    }

    // 앞머리가 물결 모양으로 내려오는 기본 머리
    function hairCap(ctx, hx, hy, r, color) {
        ctx.beginPath();
        ctx.moveTo(hx - r, hy + 1);
        ctx.arc(hx, hy, r, Math.PI, 0);
        ctx.lineTo(hx + r, hy + 3);
        const n = 5, step = (2 * r) / n;
        for (let i = 0; i < n; i++) {
            const x0 = hx + r - i * step;
            ctx.quadraticCurveTo(x0 - step / 2, hy + 7, x0 - step, hy + 1);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function face(ctx, hx, hy, o) {
        const ex = 5.5, ey = hy + 3, fx = 2; // fx: 바라보는 쪽으로 살짝 치우침
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        if (o.hurt) {
            for (const s of [-1, 1]) {
                const cx = fx + s * ex;
                ctx.beginPath();
                ctx.moveTo(cx - 2.5 * s, ey - 2.5); ctx.lineTo(cx + 2 * s, ey); ctx.lineTo(cx - 2.5 * s, ey + 2.5);
                ctx.stroke();
            }
        } else if (o.blink) {
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(fx + s * ex - 2.5, ey); ctx.lineTo(fx + s * ex + 2.5, ey); ctx.stroke(); }
        } else {
            for (const s of [-1, 1]) {
                ellipse(ctx, fx + s * ex, ey, 2.4, 3.2, '#2a1d1d');
                ellipse(ctx, fx + s * ex + 0.8, ey - 1.2, 0.9, 0.9, '#ffffff');
            }
        }
        // 볼터치
        ctx.globalAlpha = 0.55;
        ellipse(ctx, fx - 9, hy + 7.5, 2.8, 1.7, '#ff8fa3');
        ellipse(ctx, fx + 9, hy + 7.5, 2.8, 1.7, '#ff8fa3');
        ctx.globalAlpha = 1;
        // 입
        ctx.beginPath();
        if (o.hurt) { ellipse(ctx, fx, hy + 10, 1.8, 2.2, '#7a2b2b'); }
        else { ctx.arc(fx, hy + 8.5, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 1.5; ctx.stroke(); }
    }

    /**
     * o = { kind, scale, facing(1|-1), walk(위상), moving, time, blink, hurt }
     */
    function drawChibi(ctx, x, y, o) {
        const L = LOOKS[o.kind] || LOOKS.hwarang;
        const s = (o.scale || 1) * L.size;
        const time = o.time || 0;
        const ph = o.walk || 0;
        const bob = o.moving ? -Math.abs(Math.sin(ph)) * 2.2 : Math.sin(time * 2.4) * 0.7;
        const swing = o.moving ? Math.sin(ph) * 3 : 0;
        const hx = 0, hy = -15 + bob, hr = 15;
        const bodyTop = 0 + bob;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale((o.facing || 1) * s, s);
        ctx.lineJoin = 'round';

        // ---- 뒤쪽 장식 ----
        if (o.kind === 'sua') {
            // 긴 머리 뒷부분
            roundRect(ctx, -16, hy - 4, 32, 26, 12, L.hairDark, LINE);
        }
        if (o.kind === 'punghu') {
            // 바람에 날리는 목도리
            const wv = Math.sin(time * 8) * 2.5;
            ctx.beginPath();
            ctx.moveTo(-4, bodyTop + 2);
            ctx.quadraticCurveTo(-14, bodyTop - 2 + wv, -24, bodyTop + 2 - wv);
            ctx.lineTo(-23, bodyTop + 7 - wv);
            ctx.quadraticCurveTo(-13, bodyTop + 5 + wv, -3, bodyTop + 6);
            ctx.closePath();
            ctx.fillStyle = L.accent; ctx.fill();
            ctx.strokeStyle = LINE; ctx.lineWidth = 1.3; ctx.stroke();
        }

        // ---- 발 ----
        ellipse(ctx, -5 + swing, 15, 4.6, 3.2, '#5a4038', LINE, 1.2);
        ellipse(ctx, 5 - swing, 15, 4.6, 3.2, '#5a4038', LINE, 1.2);

        // ---- 몸통 ----
        if (o.kind === 'sua') {
            ctx.beginPath();
            ctx.moveTo(-7, bodyTop); ctx.lineTo(7, bodyTop); ctx.lineTo(11, bodyTop + 14); ctx.lineTo(-11, bodyTop + 14);
            ctx.closePath();
            ctx.fillStyle = L.outfit; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(-10, bodyTop + 11); ctx.lineTo(10, bodyTop + 11); ctx.stroke();
        } else {
            roundRect(ctx, -9, bodyTop, 18, 14, 6, L.outfit, LINE);
            if (o.kind === 'gangdol') {
                ctx.fillStyle = L.outfitDark; ctx.fillRect(-9, bodyTop + 8, 18, 3);
                ellipse(ctx, 0, bodyTop + 9.5, 2.2, 2.2, '#ffd36b', LINE, 1);
            }
            if (o.kind === 'hwarang') {
                ctx.fillStyle = L.accent; ctx.fillRect(-1.2, bodyTop + 2, 2.4, 10);
            }
        }
        // 팔
        ellipse(ctx, -10.5, bodyTop + 7 - swing * 0.4, 3.4, 3.4, SKIN, LINE, 1.2);
        ellipse(ctx, 10.5, bodyTop + 7 + swing * 0.4, 3.4, 3.4, SKIN, LINE, 1.2);

        // ---- 머리 ----
        ellipse(ctx, hx, hy, hr, hr * 0.95, SKIN, LINE);

        if (o.kind === 'gangdol') {
            // 둥근 투구와 바위 장식
            ctx.beginPath();
            ctx.moveTo(hx - hr - 1.5, hy + 1);
            ctx.arc(hx, hy, hr + 1.5, Math.PI, 0);
            ctx.closePath();
            ctx.fillStyle = '#b07a43'; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
            roundRect(ctx, hx - hr - 3, hy - 1, 2 * hr + 6, 5, 2.5, '#8a5a2b', LINE);
            ctx.beginPath();
            ctx.moveTo(hx - 4, hy - 9); ctx.lineTo(hx + 1, hy - 14); ctx.lineTo(hx + 6, hy - 10); ctx.lineTo(hx + 4, hy - 4); ctx.lineTo(hx - 3, hy - 4);
            ctx.closePath();
            ctx.fillStyle = L.accent; ctx.fill(); ctx.stroke();
        } else {
            hairCap(ctx, hx, hy, hr + 0.5, L.hair);
        }

        face(ctx, hx, hy, o);

        // ---- 앞쪽 장식 ----
        if (o.kind === 'hwarang') {
            // 머리 위에서 일렁이는 불꽃
            const fl = Math.sin(time * 12) * 1.5;
            const top = hy - hr + 2;
            ctx.beginPath();
            ctx.moveTo(hx - 6, top);
            ctx.quadraticCurveTo(hx - 9, top - 8, hx - 1, top - 15 - fl);
            ctx.quadraticCurveTo(hx + 1, top - 8, hx + 4, top - 10 + fl);
            ctx.quadraticCurveTo(hx + 9, top - 5, hx + 6, top);
            ctx.closePath();
            ctx.fillStyle = L.accent; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.3; ctx.stroke();
            ellipse(ctx, hx, top - 4, 2.5, 3.5 + fl * 0.3, '#ff6b3d');
        }
        if (o.kind === 'sua') {
            // 물방울 머리핀
            const cx = hx - 10, cy = hy - 7;
            ctx.beginPath();
            ctx.moveTo(cx, cy - 6);
            ctx.quadraticCurveTo(cx + 5, cy + 1, cx, cy + 3);
            ctx.quadraticCurveTo(cx - 5, cy + 1, cx, cy - 6);
            ctx.fillStyle = L.accent; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.2; ctx.stroke();
            ellipse(ctx, cx - 1, cy, 0.9, 1.3, '#ffffff');
        }
        if (o.kind === 'punghu') {
            // 흔들리는 새싹
            const sw = Math.sin(time * 4) * 3;
            const top = hy - hr;
            ctx.strokeStyle = '#2a7f4b'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(hx, top + 1); ctx.quadraticCurveTo(hx + sw * 0.5, top - 4, hx + sw, top - 7); ctx.stroke();
            ctx.save();
            ctx.translate(hx + sw, top - 7);
            ctx.rotate(-0.6 + sw * 0.05);
            ellipse(ctx, 4, 0, 5, 2.6, '#9ef0b8', LINE, 1.1);
            ctx.restore();
            ctx.save();
            ctx.translate(hx + sw, top - 7);
            ctx.rotate(Math.PI + 0.6 + sw * 0.05);
            ellipse(ctx, 3.5, 0, 4, 2.2, '#9ef0b8', LINE, 1.1);
            ctx.restore();
        }

        ctx.restore();
    }

    /** 원소 색 고깔모자를 쓴 허수아비. o = { color, scale, time, hurt, facing } */
    function drawScarecrow(ctx, x, y, o) {
        const time = o.time || 0;
        const wob = o.hurt ? Math.sin(time * 60) * 0.12 : Math.sin(time * 1.6) * 0.04;
        const sc = o.scale || 1;
        ctx.save();
        ctx.translate(x, y + 16 * sc);
        ctx.rotate(wob);
        ctx.translate(0, -16 * sc);
        ctx.scale((o.facing || 1) * sc, sc);
        ctx.lineJoin = 'round';

        // 막대와 팔
        roundRect(ctx, -2.2, -2, 4.4, 20, 2, '#a0703f', LINE);
        roundRect(ctx, -17, 2, 34, 4.5, 2, '#a0703f', LINE);
        ellipse(ctx, -17, 4.2, 2.5, 3, '#e6c37a', LINE, 1);
        ellipse(ctx, 17, 4.2, 2.5, 3, '#e6c37a', LINE, 1);
        // 자루 몸통
        roundRect(ctx, -9, -1, 18, 14, 5, '#d9b77e', LINE);
        ctx.strokeStyle = '#a07a45'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12); ctx.stroke(); ctx.setLineDash([]);
        // 자루 머리
        const hy = -14;
        ellipse(ctx, 0, hy, 13, 12, '#ecd5a3', LINE);
        ctx.strokeStyle = LINE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        if (o.hurt) {
            for (const cx of [-4.5, 4.5]) {
                ctx.beginPath(); ctx.moveTo(cx - 2, hy - 2); ctx.lineTo(cx + 2, hy + 2); ctx.moveTo(cx + 2, hy - 2); ctx.lineTo(cx - 2, hy + 2); ctx.stroke();
            }
        } else {
            ellipse(ctx, -4.5, hy, 1.9, 1.9, '#2a1d1d');
            ellipse(ctx, 4.5, hy, 1.9, 1.9, '#2a1d1d');
        }
        // 꿰맨 입
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-5, hy + 5); ctx.quadraticCurveTo(0, hy + 8, 5, hy + 5); ctx.stroke();
        for (const sx of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(sx, hy + 4.5); ctx.lineTo(sx, hy + 8); ctx.stroke(); }
        // 고깔모자
        ctx.beginPath();
        ctx.moveTo(-11, hy - 6);
        ctx.quadraticCurveTo(-2, hy - 16, 2, hy - 30);
        ctx.quadraticCurveTo(6, hy - 22, 11, hy - 6);
        ctx.closePath();
        ctx.fillStyle = o.color; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
        ellipse(ctx, 0, hy - 6, 16, 3.6, o.color, LINE);
        ellipse(ctx, 2, hy - 30, 2.4, 2.4, '#fff4c2', LINE, 1);

        ctx.restore();
    }

    // ---------- PNG 스프라이트 시트 ----------
    // assets/characters/manifest.json 에 등록된 캐릭터는 그림 파일로, 없으면 위의 도형 그림으로 그린다.
    // 형식은 assets/characters/manifest.example.json 과 README 를 참고.
    const sheets = {};
    fetch('assets/characters/manifest.json')
        .then(r => (r.ok ? r.json() : {}))
        .then(manifest => {
            for (const [kind, def] of Object.entries(manifest)) {
                if (kind.startsWith('_')) continue;
                const img = new Image();
                img.onload = () => { sheets[kind] = { ...def, img }; };
                img.onerror = () => console.warn(`[sprites] ${kind}: ${def.src} 를 불러오지 못해 기본 그림을 씁니다.`);
                img.src = `assets/characters/${def.src}`;
            }
        })
        .catch(() => { /* manifest 가 없으면 기본 그림 */ });

    function pickAnim(sheet, o) {
        const a = sheet.anims || {};
        if (o.hurt && a.hurt) return a.hurt;
        if (o.moving && a.walk) return a.walk;
        return a.idle || a.walk || { row: 0, frames: 1 };
    }

    function drawSheet(ctx, sheet, x, y, o, size) {
        const anim = pickAnim(sheet, o);
        const fw = sheet.frameWidth, fh = sheet.frameHeight;
        // frames: 칸 수(숫자) 또는 칸 번호 순서([1, 0, 2, 0] 같은 걷기 순환)
        const seq = Array.isArray(anim.frames) ? anim.frames : null;
        const count = seq ? seq.length : (anim.frames || 1);
        const fps = anim.fps == null ? 8 : anim.fps;
        const idx = fps === 0 ? 0 : Math.floor((o.time || 0) * fps) % count;
        const col = seq ? seq[idx] : (anim.col || 0) + idx;
        // directions: 방향별 줄 번호 { down, side, up }. 있으면 anim.row 대신 쓴다.
        const dir = o.dir || 'down';
        const row = sheet.directions ? (sheet.directions[dir] ?? 0) : (anim.row || 0);
        const dh = (sheet.displayHeight || 72) * size;
        const dw = dh * (fw / fh);
        const feetY = y + 21 * size;                       // 그림자 위치와 맞춤
        const anchorY = sheet.anchorY == null ? 1 : sheet.anchorY;  // 프레임 안에서 발이 닿는 높이 (0 위, 1 아래)
        const sideways = !sheet.directions || dir === 'side';
        const flip = sideways && (o.facing || 1) * (sheet.facesRight === false ? -1 : 1) < 0;
        ctx.save();
        ctx.translate(x, feetY);
        if (flip) ctx.scale(-1, 1);
        ctx.imageSmoothingEnabled = sheet.pixelArt ? false : true;
        ctx.drawImage(sheet.img, col * fw, row * fh, fw, fh, -dw / 2, -dh * anchorY, dw, dh);
        if (o.hurt && !(sheet.anims && sheet.anims.hurt)) {
            // 피격 프레임이 없으면 붉게 번쩍
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = '#ff4d4d';
            ctx.fillRect(-dw / 2, -dh * anchorY, dw, dh);
        }
        ctx.restore();
    }

    /** 캐릭터 그리기. o.size = 1 이 게임 화면 크기. 시트가 있으면 시트, 없으면 도형 그림. */
    function drawCharacter(ctx, x, y, o) {
        const size = o.size || 1;
        const sheet = sheets[o.kind];
        if (sheet) return drawSheet(ctx, sheet, x, y, o, size);
        if (o.kind === 'dummy') return drawScarecrow(ctx, x, y, { ...o, scale: 1.25 * size });
        return drawChibi(ctx, x, y, { ...o, scale: 1.3 * size });
    }

    window.Sprites = { drawCharacter, drawChibi, drawScarecrow, sheets };
})();
