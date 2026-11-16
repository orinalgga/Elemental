// 원소 난투 2단계 프로토타입: 혼자서 허수아비를 상대로 이동, 공격, 스킬, 원소 상성을 확인한다.
// 3단계에서 판정은 서버(WebSocket 게임 룸)로 옮기고, 이 파일은 입력 전송과 그리기만 남긴다.
(() => {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const HUD_H = 92;                 // 아래쪽 정보 막대 높이
    const ARENA = { x: 20, y: 20, w: W - 40, h: H - HUD_H - 32 };

    const ELEMENTS = {
        FIRE: { name: '불', color: '#ff6b3d' },
        WATER: { name: '물', color: '#3da5ff' },
        WIND: { name: '바람', color: '#5fd38d' },
        EARTH: { name: '땅', color: '#c8954a' },
    };

    // 서버(/api/characters, /api/affinity)가 진짜 값. 불러오지 못하면 아래 기본값을 쓴다.
    let CHARACTERS = [
        { id: 'hwarang', name: '화랑', element: 'FIRE', role: '원거리 폭발형', maxHp: 90, maxMp: 100, moveSpeed: 200, color: '#ff6b3d', skills: ['화염구', '세 갈래 화염', '불기둥', '대폭발'] },
        { id: 'sua', name: '수아', element: 'WATER', role: '회복과 방해', maxHp: 100, maxMp: 110, moveSpeed: 200, color: '#3da5ff', skills: ['물방울', '치유의 샘', '물결', '해일'] },
        { id: 'punghu', name: '풍후', element: 'WIND', role: '빠른 근접형', maxHp: 80, maxMp: 100, moveSpeed: 250, color: '#5fd38d', skills: ['바람 베기', '질풍 돌진', '회오리', '연속 순간 베기'] },
        { id: 'gangdol', name: '강돌', element: 'EARTH', role: '탱커', maxHp: 130, maxMp: 90, moveSpeed: 165, color: '#c8954a', skills: ['바위 주먹', '돌 던지기', '바위 갑옷', '대지 강타'] },
    ];
    const BEATS = { WATER: 'FIRE', FIRE: 'WIND', WIND: 'EARTH', EARTH: 'WATER' };
    let AFFINITY = {};
    for (const a of Object.keys(ELEMENTS)) {
        AFFINITY[a] = {};
        for (const d of Object.keys(ELEMENTS)) {
            AFFINITY[a][d] = BEATS[a] === d ? 1.2 : BEATS[d] === a ? 0.8 : 1.0;
        }
    }

    Promise.all([fetch('api/characters'), fetch('api/affinity')])
        .then(([c, a]) => (c.ok && a.ok ? Promise.all([c.json(), a.json()]) : null))
        .then(res => { if (res) { CHARACTERS = res[0]; AFFINITY = res[1]; } })
        .catch(() => { /* 서버 없이 파일만 열어도 동작하도록 기본값 유지 */ });

    // ---------- 입력 ----------
    const keys = new Set();
    const pressed = new Set();
    const mouse = { x: W / 2, y: H / 2, down: false, clicked: false };
    addEventListener('keydown', e => {
        if (!keys.has(e.code)) pressed.add(e.code);
        keys.add(e.code);
        if (['KeyQ', 'KeyE', 'KeyR', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); mouse.down = false; });
    const toCanvas = e => {
        const r = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) * (W / r.width);
        mouse.y = (e.clientY - r.top) * (H / r.height);
    };
    canvas.addEventListener('mousemove', toCanvas);
    canvas.addEventListener('mousedown', e => { toCanvas(e); if (e.button === 0) { mouse.down = true; mouse.clicked = true; } });
    addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ---------- 유틸 ----------
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
    const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const now = () => performance.now() / 1000;

    // ---------- 게임 상태 ----------
    let scene = 'select';
    let hoverCard = -1;
    let state = null;
    let t = now();

    function newGame(spec) {
        const player = {
            spec, name: spec.name, element: spec.element, color: spec.color,
            x: ARENA.x + 140, y: ARENA.y + ARENA.h / 2, r: 18,
            hp: spec.maxHp, maxHp: spec.maxHp, mp: spec.maxMp, maxMp: spec.maxMp,
            speed: spec.moveSpeed, ult: 0, ready: { atk: 0, q: 0, e: 0 },
            lastAttackAt: -10, shieldUntil: 0, slowUntil: 0, stunUntil: 0, dash: null, aim: 0,
            walk: 0, moving: false, facing: 1, hurtAt: -10, blinkSeed: Math.random() * 3,
        };
        const homes = [[0.55, 0.25], [0.82, 0.3], [0.6, 0.72], [0.85, 0.75]];
        const dummies = Object.keys(ELEMENTS).map((el, i) => {
            const hx = ARENA.x + ARENA.w * homes[i][0], hy = ARENA.y + ARENA.h * homes[i][1];
            return {
                name: `${ELEMENTS[el].name} 허수아비`, element: el, color: ELEMENTS[el].color,
                x: hx, y: hy, hx, hy, r: 20, hp: 120, maxHp: 120, alive: true, respawnAt: 0,
                fireAt: t + 1.5 + i * 0.6, wanderAng: Math.random() * 6.28,
                shieldUntil: 0, slowUntil: 0, stunUntil: 0, walk: 0, facing: 1, hurtAt: -10,
            };
        });
        state = { player, dummies, projectiles: [], areas: [], fx: [], floats: [], blinks: [], dead: false, kills: 0 };
        scene = 'play';
    }

    // ---------- 전투 ----------
    function damage(target, amount, element, fromPlayer) {
        if (target.hp <= 0) return;
        let mult = (AFFINITY[element] && AFFINITY[element][target.element]) || 1;
        let dmg = amount * mult;
        if (target.shieldUntil > t) dmg *= 0.5;
        dmg = Math.max(1, Math.round(dmg));
        target.hp = Math.max(0, target.hp - dmg);
        target.hurtAt = t;
        const p = state.player;
        if (fromPlayer) p.ult = Math.min(100, p.ult + dmg * 0.8);
        else if (target === p) p.ult = Math.min(100, p.ult + dmg * 1.2);
        state.floats.push({
            x: target.x + (Math.random() * 16 - 8), y: target.y - target.r - 6, born: t,
            text: mult > 1 ? `${dmg} 상성!` : `${dmg}`,
            color: mult > 1 ? '#ffd84a' : mult < 1 ? '#8a8fa3' : '#ffffff', big: mult > 1,
        });
        if (target.hp <= 0 && target !== p) {
            target.alive = false;
            target.respawnAt = t + 3;
            state.kills++;
            ring(target.x, target.y, 40, target.color, 0.5);
        }
    }

    function aliveDummies() { return state.dummies.filter(d => d.alive); }

    function shoot(from, ang, o) {
        state.projectiles.push({
            x: from.x + Math.cos(ang) * (from.r + 4), y: from.y + Math.sin(ang) * (from.r + 4),
            vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed,
            r: o.r || 7, dmg: o.dmg, element: o.element || from.element, color: o.color || from.color,
            fromPlayer: from === state.player, life: o.life || 1.6, born: t,
            pierce: !!o.pierce, hit: new Set(), slow: o.slow || 0,
        });
    }

    function area(x, y, r, delay, dmg, element, color, extra = {}) {
        state.areas.push({ x, y, r, delay, born: t, dmg, element, color, fromPlayer: true, ...extra });
    }

    function ring(x, y, r, color, life = 0.35) { state.fx.push({ kind: 'ring', x, y, r, color, born: t, life }); }

    function melee(p, range, arc, dmg) {
        for (const d of aliveDummies()) {
            if (dist(p, d) <= range + d.r && angleDiff(p.aim, angleTo(p, d)) <= arc / 2) damage(d, dmg, p.element, true);
        }
        state.fx.push({ kind: 'slash', x: p.x, y: p.y, r: range, ang: p.aim, arc, color: p.color, born: t, life: 0.18 });
    }

    function aimPoint(p, maxRange) {
        const a = p.aim, dd = Math.min(maxRange, dist(p, mouse));
        return {
            x: clamp(p.x + Math.cos(a) * dd, ARENA.x, ARENA.x + ARENA.w),
            y: clamp(p.y + Math.sin(a) * dd, ARENA.y, ARENA.y + ARENA.h),
        };
    }

    // 캐릭터별 기술. cd = 재사용 대기(초), mp = 마나 소모. R은 필살기 게이지 100이 필요하다.
    const KITS = {
        hwarang: {
            atk: { cd: 0.35, use: p => shoot(p, p.aim, { speed: 520, dmg: 8 }) },
            q: { cd: 4, mp: 20, use: p => [-0.25, 0, 0.25].forEach(o => shoot(p, p.aim + o, { speed: 480, dmg: 9 })) },
            e: { cd: 6, mp: 30, use: p => { const a = aimPoint(p, 360); area(a.x, a.y, 60, 0.5, 18, p.element, p.color); } },
            r: { use: p => { const a = aimPoint(p, 380); area(a.x, a.y, 140, 0.6, 40, p.element, p.color); } },
        },
        sua: {
            atk: { cd: 0.35, use: p => shoot(p, p.aim, { speed: 500, dmg: 7 }) },
            q: { cd: 7, mp: 25, use: p => heal(p, 22) },
            e: { cd: 5, mp: 25, use: p => shoot(p, p.aim, { speed: 380, dmg: 10, r: 22, pierce: true, slow: 2, life: 1.3 }) },
            r: { use: p => { heal(p, 40); area(p.x, p.y, 200, 0.2, 20, p.element, p.color, { slow: 3 }); } },
        },
        punghu: {
            atk: { cd: 0.3, use: p => melee(p, 75, 1.4, 9) },
            q: { cd: 4, mp: 20, use: p => { p.dash = { vx: Math.cos(p.aim) * 1150, vy: Math.sin(p.aim) * 1150, until: t + 0.15, hit: new Set(), dmg: 12 }; } },
            e: { cd: 6, mp: 30, use: p => area(p.x, p.y, 95, 0, 14, p.element, p.color, { follow: true }) },
            r: {
                use: p => {
                    const targets = aliveDummies().filter(d => dist(p, d) < 480).sort((a, b) => dist(p, a) - dist(p, b)).slice(0, 3);
                    targets.forEach((d, i) => state.blinks.push({ at: t + i * 0.18, target: d }));
                },
            },
        },
        gangdol: {
            atk: { cd: 0.5, use: p => melee(p, 85, 1.6, 12) },
            q: { cd: 4, mp: 20, use: p => shoot(p, p.aim, { speed: 420, dmg: 15, r: 12 }) },
            e: { cd: 9, mp: 25, use: p => { p.shieldUntil = t + 3; ring(p.x, p.y, 34, p.color); } },
            r: { use: p => area(p.x, p.y, 160, 0.35, 30, p.element, p.color, { stun: 1.5, follow: true }) },
        },
    };

    function heal(p, amount) {
        const before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + amount);
        state.floats.push({ x: p.x, y: p.y - p.r - 6, born: t, text: `+${Math.round(p.hp - before)}`, color: '#7dff9b' });
        ring(p.x, p.y, 36, '#7dff9b');
    }

    function tryUse(slot) {
        const p = state.player;
        const kit = KITS[p.spec.id];
        if (!kit || p.stunUntil > t) return;
        const s = kit[slot];
        if (slot === 'r') {
            if (p.ult < 100) return;
            p.ult = 0;
        } else {
            if (t < p.ready[slot]) return;
            if (s.mp && p.mp < s.mp) {
                state.floats.push({ x: p.x, y: p.y - p.r - 6, born: t, text: '마나 부족', color: '#8fb7ff' });
                p.ready[slot] = t + 0.4;
                return;
            }
            p.mp -= s.mp || 0;
            p.ready[slot] = t + s.cd;
        }
        p.lastAttackAt = t;
        s.use(p);
    }

    // ---------- 갱신 ----------
    function update(dt) {
        const p = state.player;
        if (pressed.has('Escape')) { scene = 'select'; return; }
        if (state.dead) { if (pressed.has('Enter')) newGame(p.spec); return; }

        p.aim = angleTo(p, mouse);
        p.facing = Math.cos(p.aim) >= 0 ? 1 : -1;
        p.dir = Math.sin(p.aim) > 0.6 ? 'down' : Math.sin(p.aim) < -0.6 ? 'up' : 'side';
        p.moving = !!p.dash;

        // 이동
        if (p.dash) {
            p.x += p.dash.vx * dt; p.y += p.dash.vy * dt;
            for (const d of aliveDummies()) {
                if (!p.dash.hit.has(d) && dist(p, d) < p.r + d.r + 6) { p.dash.hit.add(d); damage(d, p.dash.dmg, p.element, true); }
            }
            if (t >= p.dash.until) p.dash = null;
        } else if (p.stunUntil <= t) {
            let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
            let my = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
            const len = Math.hypot(mx, my);
            if (len > 0) {
                const sp = p.speed * (p.slowUntil > t ? 0.6 : 1);
                p.x += (mx / len) * sp * dt; p.y += (my / len) * sp * dt;
                p.moving = true;
                p.walk += dt * 14 * (sp / 200);
            }
        }
        p.x = clamp(p.x, ARENA.x + p.r, ARENA.x + ARENA.w - p.r);
        p.y = clamp(p.y, ARENA.y + p.r, ARENA.y + ARENA.h - p.r);

        // 공격과 스킬
        if (mouse.down) tryUse('atk');
        if (pressed.has('KeyQ')) tryUse('q');
        if (pressed.has('KeyE')) tryUse('e');
        if (pressed.has('KeyR')) tryUse('r');

        // 마나: 기본 초당 6, 2초 동안 공격하지 않으면 초당 18
        p.mp = Math.min(p.maxMp, p.mp + (t - p.lastAttackAt > 2 ? 18 : 6) * dt);

        // 풍후 필살기 순간이동
        state.blinks = state.blinks.filter(b => {
            if (t < b.at) return true;
            if (b.target.alive) {
                const a = angleTo(b.target, p);
                p.x = b.target.x + Math.cos(a) * (b.target.r + p.r + 4);
                p.y = b.target.y + Math.sin(a) * (b.target.r + p.r + 4);
                state.fx.push({ kind: 'slash', x: b.target.x, y: b.target.y, r: 40, ang: a + Math.PI, arc: 6.28, color: p.color, born: t, life: 0.2 });
                damage(b.target, 20, p.element, true);
            }
            return false;
        });

        // 허수아비
        for (const d of state.dummies) {
            if (!d.alive) {
                if (t >= d.respawnAt) { d.alive = true; d.hp = d.maxHp; d.x = d.hx; d.y = d.hy; d.fireAt = t + 1.5; ring(d.x, d.y, 30, d.color); }
                continue;
            }
            if (d.stunUntil > t) continue;
            d.wanderAng += (Math.random() - 0.5) * 2 * dt;
            const sp = 40 * (d.slowUntil > t ? 0.4 : 1);
            d.x += Math.cos(d.wanderAng) * sp * dt; d.y += Math.sin(d.wanderAng) * sp * dt;
            d.walk += dt * 6;
            if (Math.abs(Math.cos(d.wanderAng)) > 0.3) d.facing = Math.cos(d.wanderAng) > 0 ? 1 : -1;
            if (Math.hypot(d.x - d.hx, d.y - d.hy) > 60) d.wanderAng = Math.atan2(d.hy - d.y, d.hx - d.x);
            if (t >= d.fireAt) {
                d.fireAt = t + 2.5 * (d.slowUntil > t ? 1.6 : 1);
                if (dist(d, p) < 460) shoot(d, angleTo(d, p), { speed: 230, dmg: 6, r: 8, life: 2.2 });
            }
        }

        // 투사체
        state.projectiles = state.projectiles.filter(b => {
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (t - b.born > b.life) return false;
            if (b.x < ARENA.x || b.x > ARENA.x + ARENA.w || b.y < ARENA.y || b.y > ARENA.y + ARENA.h) return false;
            const targets = b.fromPlayer ? aliveDummies() : [p];
            for (const target of targets) {
                if (b.hit.has(target) || dist(b, target) > b.r + target.r) continue;
                damage(target, b.dmg, b.element, b.fromPlayer);
                if (b.slow) target.slowUntil = t + b.slow;
                if (!b.pierce) { ring(b.x, b.y, 14, b.color, 0.2); return false; }
                b.hit.add(target);
            }
            return true;
        });

        // 지연 범위 공격
        state.areas = state.areas.filter(a => {
            if (a.follow) { a.x = p.x; a.y = p.y; }
            if (t - a.born < a.delay) return true;
            for (const d of aliveDummies()) {
                if (dist(a, d) <= a.r + d.r) {
                    damage(d, a.dmg, a.element, true);
                    if (a.slow) d.slowUntil = t + a.slow;
                    if (a.stun) d.stunUntil = t + a.stun;
                }
            }
            ring(a.x, a.y, a.r, a.color, 0.4);
            return false;
        });

        state.fx = state.fx.filter(f => t - f.born < f.life);
        state.floats = state.floats.filter(f => t - f.born < 0.9);

        if (p.hp <= 0) state.dead = true;
    }

    // ---------- 그리기 ----------
    function drawFloor() {
        ctx.fillStyle = '#1d2029';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#232734';
        ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
        ctx.strokeStyle = '#2b3040';
        ctx.lineWidth = 1;
        for (let x = ARENA.x; x <= ARENA.x + ARENA.w; x += 48) { ctx.beginPath(); ctx.moveTo(x, ARENA.y); ctx.lineTo(x, ARENA.y + ARENA.h); ctx.stroke(); }
        for (let y = ARENA.y; y <= ARENA.y + ARENA.h; y += 48) { ctx.beginPath(); ctx.moveTo(ARENA.x, y); ctx.lineTo(ARENA.x + ARENA.w, y); ctx.stroke(); }
        ctx.strokeStyle = '#3a4156';
        ctx.lineWidth = 3;
        ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    }

    function drawUnit(u, isPlayer) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 21, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
        if (isPlayer) {
            // 발밑 조준 고리
            ctx.strokeStyle = u.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.ellipse(u.x, u.y + 21, 21, 8, 0, 0, Math.PI * 2); ctx.stroke();
            const ax = u.x + Math.cos(u.aim) * 27, ay = u.y + 21 + Math.sin(u.aim) * 11;
            ctx.fillStyle = u.color;
            ctx.beginPath();
            ctx.moveTo(ax + Math.cos(u.aim) * 6, ay + Math.sin(u.aim) * 3);
            ctx.lineTo(ax + Math.cos(u.aim + 2.3) * 5, ay + Math.sin(u.aim + 2.3) * 2.5);
            ctx.lineTo(ax + Math.cos(u.aim - 2.3) * 5, ay + Math.sin(u.aim - 2.3) * 2.5);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
        }
        const hurt = t - u.hurtAt < 0.25;
        if (isPlayer) {
            const blink = ((t + u.blinkSeed) % 3.2) < 0.13;
            Sprites.drawCharacter(ctx, u.x, u.y, { kind: u.spec.id, facing: u.facing, dir: u.dir, walk: u.walk, moving: u.moving, time: t, blink, hurt });
        } else {
            Sprites.drawCharacter(ctx, u.x, u.y, { kind: 'dummy', color: u.color, time: t, hurt, facing: u.facing, moving: true, walk: u.walk });
        }
        if (u.shieldUntil > t) { ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 7, 0, Math.PI * 2); ctx.stroke(); }
        if (u.slowUntil > t) { ctx.strokeStyle = 'rgba(120,190,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (u.stunUntil > t) { ctx.fillStyle = '#ffd84a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ 기절', u.x, u.y - 78); }
        // 이름과 체력 막대
        ctx.textAlign = 'center';
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#d6d9e4';
        ctx.fillText(u.name, u.x, u.y - (isPlayer ? 58 : 64));
        const bw = 44;
        ctx.fillStyle = '#11131a'; ctx.fillRect(u.x - bw / 2, u.y + 30, bw, 5);
        ctx.fillStyle = u.hp / u.maxHp > 0.35 ? '#6fdc7a' : '#ff5d5d';
        ctx.fillRect(u.x - bw / 2, u.y + 30, bw * (u.hp / u.maxHp), 5);
    }

    function drawWorld() {
        drawFloor();
        for (const a of state.areas) {
            const k = a.delay > 0 ? clamp((t - a.born) / a.delay, 0, 1) : 1;
            ctx.fillStyle = a.color + '22';
            ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = a.color + '55';
            ctx.beginPath(); ctx.arc(a.x, a.y, a.r * k, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = a.color; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.stroke();
        }
        // 아래쪽에 있는 캐릭터가 앞에 보이도록 y 순서로 그린다
        const units = state.dummies.filter(d => d.alive).map(d => [d, false]);
        units.push([state.player, true]);
        units.sort((a, b) => a[0].y - b[0].y).forEach(([u, isPlayer]) => drawUnit(u, isPlayer));
        for (const b of state.projectiles) {
            ctx.fillStyle = b.color;
            ctx.globalAlpha = b.fromPlayer ? 1 : 0.85;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
            if (!b.fromPlayer) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2; ctx.stroke(); }
            ctx.globalAlpha = 1;
        }
        for (const f of state.fx) {
            const k = (t - f.born) / f.life;
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = f.color; ctx.lineWidth = 3;
            ctx.beginPath();
            if (f.kind === 'ring') ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
            else ctx.arc(f.x, f.y, f.r, f.ang - f.arc / 2, f.ang + f.arc / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        for (const f of state.floats) {
            const k = (t - f.born) / 0.9;
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = f.color;
            ctx.font = `${f.big ? 'bold 17px' : 'bold 14px'} sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(f.text, f.x, f.y - k * 26);
            ctx.globalAlpha = 1;
        }
    }

    function bar(x, y, w, h, frac, color, label) {
        ctx.fillStyle = '#11131a'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
        ctx.fillStyle = '#ffffff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(label, x + 6, y + h - 3);
    }

    function drawHud() {
        const p = state.player, y0 = H - HUD_H;
        ctx.fillStyle = '#171a22'; ctx.fillRect(0, y0, W, HUD_H);
        ctx.fillStyle = p.color + '44'; ctx.beginPath(); ctx.arc(46, y0 + 46, 30, 0, Math.PI * 2); ctx.fill();
        Sprites.drawCharacter(ctx, 46, y0 + 50, { kind: p.spec.id, size: 0.88, time: t, hurt: t - p.hurtAt < 0.25 });
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`${p.name}`, 82, y0 + 26);
        ctx.fillStyle = '#9aa0b4'; ctx.font = '12px sans-serif';
        ctx.fillText(`${ELEMENTS[p.element].name} 원소 · ${p.spec.role}`, 128, y0 + 26);
        bar(82, y0 + 36, 260, 14, p.hp / p.maxHp, '#e0525a', `체력 ${Math.ceil(p.hp)} / ${p.maxHp}`);
        bar(82, y0 + 56, 260, 14, p.mp / p.maxMp, '#4f86f7', `마나 ${Math.floor(p.mp)} / ${p.maxMp}`);

        const kit = KITS[p.spec.id];
        const slots = [['atk', '좌클릭'], ['q', 'Q'], ['e', 'E'], ['r', 'R']];
        slots.forEach(([slot, key], i) => {
            const x = 380 + i * 132, y = y0 + 14, w = 120, h = 64;
            const s = kit[slot];
            let frac = 1, note = '';
            if (slot === 'r') { frac = p.ult / 100; note = p.ult >= 100 ? '준비됨' : `${Math.floor(p.ult)}%`; }
            else {
                const left = p.ready[slot] - t;
                frac = left > 0 ? 1 - left / s.cd : 1;
                note = left > 0 ? `${left.toFixed(1)}초` : s.mp ? `마나 ${s.mp}` : '';
            }
            const usable = frac >= 1 && (!s.mp || p.mp >= s.mp);
            ctx.fillStyle = '#20242f'; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = (slot === 'r' ? '#ffd84a' : p.color) + (usable ? '55' : '22');
            ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
            ctx.strokeStyle = usable ? p.color : '#3a4156'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(key, x + 8, y + 18);
            ctx.font = '13px sans-serif';
            ctx.fillText(p.spec.skills[i], x + 8, y + 38);
            ctx.fillStyle = '#9aa0b4'; ctx.font = '11px sans-serif';
            ctx.fillText(note, x + 8, y + 56);
        });

        ctx.textAlign = 'right'; ctx.font = '12px sans-serif'; ctx.fillStyle = '#9aa0b4';
        ctx.fillText(`쓰러뜨린 허수아비 ${state.kills}`, W - 24, 38);
        ctx.fillText('상성: 물 → 불 → 바람 → 땅 → 물 (유리 +20%, 불리 -20%)', W - 24, 56);

        if (state.dead) {
            ctx.fillStyle = 'rgba(10,11,15,0.7)'; ctx.fillRect(0, 0, W, H);
            ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif';
            ctx.fillText('쓰러졌습니다', W / 2, H / 2 - 10);
            ctx.font = '15px sans-serif'; ctx.fillStyle = '#c3c7d6';
            ctx.fillText('Enter 다시 시작 · Esc 캐릭터 다시 고르기', W / 2, H / 2 + 24);
        }
    }

    function cardRect(i) { const w = 200, h = 300, gap = 22, x0 = (W - (w * 4 + gap * 3)) / 2; return { x: x0 + i * (w + gap), y: 190, w, h }; }

    function updateSelect() {
        hoverCard = -1;
        for (let i = 0; i < 4; i++) {
            const r = cardRect(i);
            if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) hoverCard = i;
        }
        if (mouse.clicked && hoverCard >= 0) newGame(CHARACTERS[hoverCard]);
        for (let i = 0; i < 4; i++) if (pressed.has(`Digit${i + 1}`)) newGame(CHARACTERS[i]);
    }

    function drawSelect() {
        drawFloor();
        ctx.fillStyle = 'rgba(15,17,23,0.75)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px sans-serif';
        ctx.fillText('원소 난투', W / 2, 92);
        ctx.font = '15px sans-serif'; ctx.fillStyle = '#9aa0b4';
        ctx.fillText('캐릭터를 고르세요 (클릭 또는 1~4)', W / 2, 126);
        ctx.fillText('상성: 물 → 불 → 바람 → 땅 → 물', W / 2, 150);
        CHARACTERS.forEach((c, i) => {
            const r = cardRect(i), hover = i === hoverCard;
            ctx.fillStyle = hover ? '#2a2f3d' : '#20242f'; ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = hover ? c.color : '#3a4156'; ctx.lineWidth = hover ? 3 : 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = c.color + '33'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + 116, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
            Sprites.drawCharacter(ctx, r.x + r.w / 2, r.y + 86, { kind: c.id, size: 1.46, time: t + i, moving: hover, walk: t * 10, blink: ((t + i) % 3.2) < 0.13 });
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText(c.name, r.x + r.w / 2, r.y + 146);
            ctx.font = '13px sans-serif'; ctx.fillStyle = c.color;
            ctx.fillText(`${ELEMENTS[c.element].name} · ${c.role}`, r.x + r.w / 2, r.y + 166);
            ctx.fillStyle = '#c3c7d6';
            ctx.fillText(`체력 ${c.maxHp} · 속도 ${c.moveSpeed}`, r.x + r.w / 2, r.y + 188);
            ctx.textAlign = 'left'; ctx.fillStyle = '#9aa0b4'; ctx.font = '12px sans-serif';
            ['좌클릭', 'Q', 'E', 'R'].forEach((k, j) => ctx.fillText(`${k}  ${c.skills[j]}`, r.x + 22, r.y + 214 + j * 19));
            ctx.textAlign = 'center';
            ctx.fillStyle = '#6b7186'; ctx.fillText(`${i + 1}`, r.x + r.w / 2, r.y + r.h - 12);
        });
    }

    // ---------- 루프 ----------
    function frame() {
        const nt = now();
        const dt = Math.min(0.05, nt - t);
        t = nt;
        if (scene === 'select') { updateSelect(); drawSelect(); }
        else { update(dt); if (scene === 'play') { drawWorld(); drawHud(); } else drawSelect(); }
        pressed.clear();
        mouse.clicked = false;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // 브라우저 콘솔과 자동 테스트에서 상태를 볼 수 있게 열어 둔다.
    window.__brawl = { get state() { return state; }, get scene() { return scene; }, newGame: i => newGame(CHARACTERS[i]) };
})();
