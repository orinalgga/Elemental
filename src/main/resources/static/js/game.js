// 원소 난투 3단계 클라이언트: 판정은 서버(WebSocket 게임 룸)가 하고, 여기서는 입력을 보내고 받은 상태를 그린다.
(() => {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const HUD_H = 92;
    const ARENA = { x: 20, y: 20, w: W - 40, h: H - HUD_H - 32 };

    const ELEMENTS = {
        FIRE: { name: '불', color: '#ff6b3d' },
        WATER: { name: '물', color: '#3da5ff' },
        WIND: { name: '바람', color: '#5fd38d' },
        EARTH: { name: '땅', color: '#c8954a' },
    };

    let CHARACTERS = [
        { id: 'hwarang', name: '화랑', element: 'FIRE', role: '원거리 폭발형', maxHp: 90, maxMp: 100, moveSpeed: 200, color: '#ff6b3d', skills: ['화염구', '세 갈래 화염', '불기둥', '대폭발'] },
        { id: 'sua', name: '수아', element: 'WATER', role: '회복과 방해', maxHp: 100, maxMp: 110, moveSpeed: 200, color: '#3da5ff', skills: ['물방울', '치유의 샘', '물결', '해일'] },
        { id: 'punghu', name: '풍후', element: 'WIND', role: '빠른 근접형', maxHp: 80, maxMp: 100, moveSpeed: 250, color: '#5fd38d', skills: ['바람 베기', '질풍 돌진', '회오리', '연속 순간 베기'] },
        { id: 'gangdol', name: '강돌', element: 'EARTH', role: '탱커', maxHp: 130, maxMp: 90, moveSpeed: 165, color: '#c8954a', skills: ['바위 주먹', '돌 던지기', '바위 갑옷', '대지 강타'] },
    ];
    fetch('api/characters').then(r => (r.ok ? r.json() : null)).then(c => { if (c) CHARACTERS = c; }).catch(() => {});
    const specOf = id => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

    // 재사용 대기(초)와 마나. 서버 Skills.COST 와 같은 값 (표시용)
    const COST = {
        hwarang: { atk: [0.35, 0], q: [4, 20], e: [6, 30] },
        sua: { atk: [0.35, 0], q: [7, 25], e: [5, 25] },
        punghu: { atk: [0.3, 0], q: [4, 20], e: [6, 30] },
        gangdol: { atk: [0.5, 0], q: [4, 20], e: [9, 25] },
    };

    // ---------- 입력 ----------
    const keys = new Set();
    const pressed = new Set();
    const mouse = { x: W / 2, y: H / 2, down: false, clicked: false };
    addEventListener('keydown', e => {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
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

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const now = () => performance.now() / 1000;

    // ---------- 상태 ----------
    let scene = 'select';          // select → join → connecting → play
    let hoverCard = -1;
    let chosen = null;
    let ws = null;
    let myId = null;
    let roomCode = '';
    let snap = null;               // 서버가 보낸 최신 상태
    let errorText = '';
    const view = new Map();        // id → 화면에 그리는 위치 (부드럽게 따라감)
    let fx = [], floats = [], banner = null;
    let t = now();
    let lastSend = 0;

    // ---------- 방 입장 화면 (HTML) ----------
    const form = document.getElementById('join');
    const nameInput = document.getElementById('join-name');
    const roomInput = document.getElementById('join-room');
    const joinChar = document.getElementById('join-char');
    try { nameInput.value = localStorage.getItem('eb-name') || ''; } catch (e) { /* 저장소 없음 */ }
    roomInput.value = new URLSearchParams(location.search).get('room') || 'LOBBY';
    document.getElementById('join-back').addEventListener('click', () => { form.hidden = true; scene = 'select'; });
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim() || chosen.name;
        try { localStorage.setItem('eb-name', name); } catch (err) { /* 무시 */ }
        connect(name, roomInput.value.trim() || 'LOBBY');
    });

    function openJoin(spec) {
        chosen = spec;
        joinChar.textContent = `${spec.name} (${ELEMENTS[spec.element].name})`;
        form.hidden = false;
        scene = 'join';
        errorText = '';
        setTimeout(() => nameInput.focus(), 0);
    }

    // ---------- 서버 연결 ----------
    function connect(name, room) {
        form.hidden = true;
        scene = 'connecting';
        snap = null; myId = null; view.clear(); fx = []; floats = []; banner = null;
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name, room, character: chosen.id }));
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.type === 'welcome') { myId = m.id; roomCode = m.room; scene = 'play'; history.replaceState(null, '', `?room=${encodeURIComponent(m.room)}`); }
            else if (m.type === 'state') onState(m);
            else if (m.type === 'error') { errorText = m.message; leave(); }
        };
        ws.onclose = () => { if (scene === 'play' || scene === 'connecting') { errorText = errorText || '서버와 연결이 끊겼어요'; scene = 'select'; } };
    }

    function leave() {
        if (ws) { ws.onclose = null; ws.close(); ws = null; }
        scene = 'select';
    }

    function send(extra) {
        if (!ws || ws.readyState !== 1 || !snap) return;
        const me = meView();
        const aim = me ? Math.atan2(mouse.y - me.y, mouse.x - me.x) : 0;
        const dist = me ? Math.hypot(mouse.x - me.x, mouse.y - me.y) : 0;
        ws.send(JSON.stringify({
            type: 'input', up: keys.has('KeyW'), down: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'),
            fire: mouse.down, aim, dist, ...extra,
        }));
    }

    function onState(m) {
        snap = m;
        const seen = new Set();
        for (const u of [...m.players, ...m.dummies, ...m.projectiles, ...m.areas]) {
            const key = `${u.id}`;
            seen.add(key);
            const v = view.get(key);
            if (!v || Math.hypot(v.x - u.x, v.y - u.y) > 120) view.set(key, { x: u.x, y: u.y, walk: v ? v.walk : 0 });
        }
        for (const k of view.keys()) if (!seen.has(k)) view.delete(k);
        for (const e of m.events) {
            if (e.k === 'float') { if (!e.only || e.only === myId) floats.push({ ...e, born: t }); }
            else if (e.k === 'ring' || e.k === 'slash') fx.push({ ...e, born: t, life: e.k === 'ring' ? 0.35 : 0.18 });
            else if (e.k === 'banner') banner = { text: e.text, born: t };
        }
    }

    const me = () => snap && snap.players.find(p => p.id === myId);
    const meView = () => view.get(`${myId}`);

    // ---------- 갱신 ----------
    function update(dt) {
        if (pressed.has('Escape')) { leave(); return; }
        if (!snap) return;
        // 화면 위치를 서버 위치로 부드럽게 맞춤
        const k = 1 - Math.exp(-dt * 18);
        for (const u of [...snap.players, ...snap.dummies, ...snap.projectiles, ...snap.areas]) {
            const v = view.get(`${u.id}`);
            if (!v) continue;
            v.x += (u.x - v.x) * k;
            v.y += (u.y - v.y) * k;
            if (u.moving) v.walk += dt * 14;
        }
        for (const [code, slot] of [['KeyQ', 'q'], ['KeyE', 'e'], ['KeyR', 'r']]) {
            if (pressed.has(code)) send({ cast: slot });
        }
        if (t - lastSend > 0.05) { send(); lastSend = t; }
        fx = fx.filter(f => t - f.born < f.life);
        floats = floats.filter(f => t - f.born < 0.9);
        if (banner && t - banner.born > 1.8) banner = null;
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
        const v = view.get(`${u.id}`) || u;
        const x = v.x, y = v.y;
        const isMe = u.id === myId;
        const color = ELEMENTS[u.el].color;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x, y + 21, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
        let facing = u.facing, dir = u.dir;
        if (isMe) {
            const aim = Math.atan2(mouse.y - y, mouse.x - x);
            facing = Math.cos(aim) >= 0 ? 1 : -1;
            dir = Math.sin(aim) > 0.6 ? 'down' : Math.sin(aim) < -0.6 ? 'up' : 'side';
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
            ctx.beginPath(); ctx.ellipse(x, y + 21, 21, 8, 0, 0, Math.PI * 2); ctx.stroke();
            const ax = x + Math.cos(aim) * 27, ay = y + 21 + Math.sin(aim) * 11;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(ax + Math.cos(aim) * 6, ay + Math.sin(aim) * 3);
            ctx.lineTo(ax + Math.cos(aim + 2.3) * 5, ay + Math.sin(aim + 2.3) * 2.5);
            ctx.lineTo(ax + Math.cos(aim - 2.3) * 5, ay + Math.sin(aim - 2.3) * 2.5);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
        }
        if (isPlayer) {
            Sprites.drawCharacter(ctx, x, y, { kind: u.ch, facing, dir, walk: v.walk || 0, moving: u.moving, time: t, hurt: u.hurt });
        } else {
            Sprites.drawCharacter(ctx, x, y, { kind: `dummy-${u.el.toLowerCase()}`, color, time: t, hurt: u.hurt, facing: u.facing });
        }
        if (u.shield) { ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, u.r + 7, 0, Math.PI * 2); ctx.stroke(); }
        if (u.slow) { ctx.strokeStyle = 'rgba(120,190,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, u.r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (u.stun) { ctx.fillStyle = '#ffd84a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ 기절', x, y - 66); }
        ctx.textAlign = 'center';
        ctx.font = isMe ? 'bold 12px sans-serif' : '12px sans-serif';
        ctx.fillStyle = isMe ? '#ffffff' : '#d6d9e4';
        const label = isPlayer ? u.name : `${ELEMENTS[u.el].name} 허수아비`;
        ctx.fillText(label, x, y - 50);
        const bw = 44;
        ctx.fillStyle = '#11131a'; ctx.fillRect(x - bw / 2, y + 30, bw, 5);
        ctx.fillStyle = isMe ? '#6fdc7a' : isPlayer ? '#ff7a7a' : '#6fdc7a';
        ctx.fillRect(x - bw / 2, y + 30, bw * (u.hp / u.maxHp), 5);
    }

    function drawWorld() {
        drawFloor();
        for (const a of snap.areas) {
            const v = view.get(`${a.id}`) || a;
            ctx.fillStyle = a.color + '22';
            ctx.beginPath(); ctx.arc(v.x, v.y, a.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = a.color + '55';
            ctx.beginPath(); ctx.arc(v.x, v.y, a.r * a.k, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = a.color; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(v.x, v.y, a.r, 0, Math.PI * 2); ctx.stroke();
        }
        const units = snap.dummies.map(d => [d, false]);
        for (const p of snap.players) if (p.hp > 0) units.push([p, true]);
        units.sort((a, b) => (view.get(`${a[0].id}`) || a[0]).y - (view.get(`${b[0].id}`) || b[0]).y)
            .forEach(([u, isPlayer]) => drawUnit(u, isPlayer));
        for (const b of snap.projectiles) {
            const v = view.get(`${b.id}`) || b;
            ctx.fillStyle = b.color;
            ctx.beginPath(); ctx.arc(v.x, v.y, b.r, 0, Math.PI * 2); ctx.fill();
            if (b.enemy) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 2; ctx.stroke(); }
        }
        for (const f of fx) {
            const k = (t - f.born) / f.life;
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = f.color; ctx.lineWidth = 3;
            ctx.beginPath();
            if (f.k === 'ring') ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
            else ctx.arc(f.x, f.y, f.r, f.ang - f.arc / 2, f.ang + f.arc / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        for (const f of floats) {
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
        const p = me();
        const y0 = H - HUD_H;
        ctx.fillStyle = '#171a22'; ctx.fillRect(0, y0, W, HUD_H);
        if (!p) return;
        const spec = specOf(p.ch);
        const color = ELEMENTS[p.el].color;
        ctx.fillStyle = color + '44'; ctx.beginPath(); ctx.arc(46, y0 + 46, 30, 0, Math.PI * 2); ctx.fill();
        Sprites.drawCharacter(ctx, 46, y0 + 50, { kind: p.ch, size: 0.88, time: t, hurt: p.hurt });
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(p.name, 82, y0 + 26);
        ctx.fillStyle = '#9aa0b4'; ctx.font = '12px sans-serif';
        ctx.fillText(`${spec.name} · ${ELEMENTS[p.el].name} · ${spec.role}`, 82 + ctx.measureText(p.name).width + 50, y0 + 26);
        bar(82, y0 + 36, 260, 14, p.hp / p.maxHp, '#e0525a', `체력 ${Math.ceil(p.hp)} / ${p.maxHp}`);
        bar(82, y0 + 56, 260, 14, p.mp / p.maxMp, '#4f86f7', `마나 ${Math.floor(p.mp)} / ${p.maxMp}`);

        const cost = COST[p.ch];
        const left = { atk: p.readyAtk, q: p.readyQ, e: p.readyE };
        [['atk', '좌클릭'], ['q', 'Q'], ['e', 'E'], ['r', 'R']].forEach(([slot, key], i) => {
            const x = 380 + i * 132, y = y0 + 14, w = 120, h = 64;
            let frac = 1, note = '', usable = true;
            if (slot === 'r') { frac = p.ult / 100; note = p.ult >= 100 ? '준비됨' : `${Math.floor(p.ult)}%`; usable = p.ult >= 100; }
            else {
                const [cd, mp] = cost[slot];
                frac = left[slot] > 0 ? 1 - left[slot] / cd : 1;
                note = left[slot] > 0 ? `${left[slot].toFixed(1)}초` : mp ? `마나 ${mp}` : '';
                usable = frac >= 1 && p.mp >= mp;
            }
            ctx.fillStyle = '#20242f'; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = (slot === 'r' ? '#ffd84a' : color) + (usable ? '55' : '22');
            ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
            ctx.strokeStyle = usable ? color : '#3a4156'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(key, x + 8, y + 18);
            ctx.font = '13px sans-serif';
            ctx.fillText(spec.skills[i], x + 8, y + 38);
            ctx.fillStyle = '#9aa0b4'; ctx.font = '11px sans-serif';
            ctx.fillText(note, x + 8, y + 56);
        });
    }

    function drawScoreboard() {
        ctx.textAlign = 'right'; ctx.font = '12px sans-serif';
        let y = 40;
        ctx.fillStyle = '#9aa0b4';
        ctx.fillText(`방 ${roomCode} · ${snap.players.length}/4명`, W - 28, y);
        for (const p of snap.players) {
            y += 18;
            ctx.fillStyle = p.id === myId ? '#ffffff' : p.hp > 0 ? '#c3c7d6' : '#6b7186';
            ctx.fillText(`${p.hp > 0 ? '' : '✕ '}${p.name} (${specOf(p.ch).name})  승 ${p.wins} · 처치 ${p.kills}`, W - 28, y);
        }
    }

    function drawOverlay() {
        const p = me();
        ctx.textAlign = 'center';
        if (snap.phase === 'practice') {
            ctx.fillStyle = 'rgba(15,17,23,0.7)'; ctx.fillRect(W / 2 - 300, 28, 600, 44);
            ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 14px sans-serif';
            ctx.fillText('연습 모드', W / 2, 46);
            ctx.fillStyle = '#c3c7d6'; ctx.font = '12px sans-serif';
            ctx.fillText(`다른 사람이 방 코드 ${roomCode} 로 들어오면 대전이 시작돼요`, W / 2, 64);
        }
        if (snap.phase === 'ended') {
            ctx.fillStyle = 'rgba(10,11,15,0.6)'; ctx.fillRect(0, H / 2 - 70, W, 110);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px sans-serif';
            ctx.fillText(snap.winner ? `${snap.winner} 승리!` : '무승부', W / 2, H / 2 - 18);
            ctx.font = '15px sans-serif'; ctx.fillStyle = '#c3c7d6';
            ctx.fillText(`${snap.endsIn}초 후 다음 판`, W / 2, H / 2 + 16);
        } else if (p && p.hp <= 0) {
            ctx.fillStyle = 'rgba(10,11,15,0.5)'; ctx.fillRect(0, H / 2 - 50, W, 70);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px sans-serif';
            ctx.fillText('쓰러졌어요', W / 2, H / 2 - 16);
            ctx.font = '14px sans-serif'; ctx.fillStyle = '#c3c7d6';
            ctx.fillText(snap.phase === 'practice' ? `${Math.ceil(p.respawnIn)}초 후 다시 나와요` : '다른 사람들의 대결을 지켜보세요', W / 2, H / 2 + 8);
        } else if (banner) {
            const k = (t - banner.born) / 1.8;
            ctx.globalAlpha = Math.min(1, 2 - 2 * k);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px sans-serif';
            ctx.fillText(banner.text, W / 2, H / 2 - 120);
            ctx.globalAlpha = 1;
        }
    }

    function cardRect(i) { const w = 200, h = 300, gap = 22, x0 = (W - (w * 4 + gap * 3)) / 2; return { x: x0 + i * (w + gap), y: 190, w, h }; }

    function updateSelect() {
        hoverCard = -1;
        for (let i = 0; i < 4; i++) {
            const r = cardRect(i);
            if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) hoverCard = i;
        }
        if (mouse.clicked && hoverCard >= 0) openJoin(CHARACTERS[hoverCard]);
        for (let i = 0; i < 4; i++) if (pressed.has(`Digit${i + 1}`)) openJoin(CHARACTERS[i]);
    }

    function drawSelect() {
        drawFloor();
        ctx.fillStyle = 'rgba(15,17,23,0.75)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px sans-serif';
        ctx.fillText('원소 난투', W / 2, 92);
        ctx.font = '15px sans-serif'; ctx.fillStyle = '#9aa0b4';
        ctx.fillText('캐릭터를 고르세요 (클릭 또는 1~4)', W / 2, 126);
        ctx.fillText('상성: 물 → 불 → 바람 → 땅 → 물', W / 2, 150);
        if (errorText) { ctx.fillStyle = '#ff7a7a'; ctx.fillText(errorText, W / 2, 174); }
        CHARACTERS.forEach((c, i) => {
            const r = cardRect(i), hover = i === hoverCard;
            ctx.fillStyle = hover ? '#2a2f3d' : '#20242f'; ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.strokeStyle = hover ? c.color : '#3a4156'; ctx.lineWidth = hover ? 3 : 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
            ctx.fillStyle = c.color + '33'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + 116, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
            Sprites.drawCharacter(ctx, r.x + r.w / 2, r.y + 86, { kind: c.id, size: 1.46, time: t + i, moving: hover, walk: t * 10 });
            ctx.textAlign = 'center';
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

    function drawConnecting() {
        drawFloor();
        ctx.fillStyle = '#c3c7d6'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('서버에 연결하는 중…', W / 2, H / 2);
    }

    // ---------- 루프 ----------
    function frame() {
        const nt = now();
        const dt = Math.min(0.05, nt - t);
        t = nt;
        if (scene === 'select') { updateSelect(); drawSelect(); }
        else if (scene === 'join') drawSelect();
        else if (scene === 'connecting') drawConnecting();
        else {
            update(dt);
            if (scene === 'play' && snap) { drawWorld(); drawHud(); drawScoreboard(); drawOverlay(); }
            else if (scene === 'play') drawConnecting();
            else drawSelect();
        }
        pressed.clear();
        mouse.clicked = false;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // 브라우저 콘솔과 자동 테스트용
    window.__brawl = {
        get scene() { return scene; }, get state() { return snap; }, get me() { return me(); },
        join: (i, name, room) => { chosen = CHARACTERS[i]; connect(name, room); },
    };
})();
