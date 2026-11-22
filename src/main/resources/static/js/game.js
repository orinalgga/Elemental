// 원소 난투 클라이언트: 판정은 서버(WebSocket 게임 룸)가 하고, 여기서는 입력을 보내고 받은 상태를 그린다.
(() => {
    'use strict';

    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const HUD_H = 92;
    let ARENA = { x: 20, y: 20, w: 920, h: 536 };
    let rocks = [];

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

    const ITEM_LOOK = {
        HEAL: { icon: '+', name: '회복' },
        MANA: { icon: 'M', name: '마나' },
        HASTE: { icon: '»', name: '신속' },
        POWER: { icon: '!', name: '강화' },
        SHIELD: { icon: '◆', name: '보호막' },
        ULT: { icon: '★', name: '필살' },
    };

    // ---------- 입력 ----------
    const keys = new Set();
    const pressed = new Set();
    const mouse = { x: W / 2, y: H / 2, down: false, clicked: false };
    const typing = () => document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
    addEventListener('keydown', e => {
        if (typing()) return;
        if (!keys.has(e.code)) pressed.add(e.code);
        keys.add(e.code);
        if (['KeyQ', 'KeyE', 'KeyR', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
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
    const rand = (a, b) => a + Math.random() * (b - a);

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
    let fx = [], floats = [], parts = [], feed = [], banner = null, bigText = null;
    let shake = 0, hurtFlash = 0;
    let lastPhase = null;
    let t = now();
    let lastSend = 0;

    // ---------- 계정 (HTML) ----------
    const $ = id => document.getElementById(id);
    let auth = null;   // { token, username, wins, ... }
    try { const s = localStorage.getItem('eb-auth'); if (s) auth = JSON.parse(s); } catch (e) { auth = null; }

    function saveAuth(a) {
        auth = a;
        try { if (a) localStorage.setItem('eb-auth', JSON.stringify(a)); else localStorage.removeItem('eb-auth'); } catch (e) { /* 무시 */ }
        renderAuth();
    }
    function renderAuth() {
        $('auth-btn').textContent = auth ? `${auth.username} (승 ${auth.wins})` : '로그인';
        $('join-guest').hidden = !!auth;
        $('join-account').hidden = !auth;
        $('join-account-name').textContent = auth ? auth.username : '';
        $('auth-forms').hidden = !!auth;
        $('auth-profile').hidden = !auth;
        if (auth) {
            $('auth-profile-name').textContent = auth.username;
            $('auth-profile-stats').textContent = `${auth.games}판 · 승 ${auth.wins} · 처치 ${auth.kills} · 쓰러짐 ${auth.deaths}`;
        }
    }
    function refreshMe() {
        if (!auth) return;
        fetch('api/auth/me', { headers: { Authorization: `Bearer ${auth.token}` } })
            .then(r => (r.ok ? r.json() : r.status === 401 ? 'out' : null))
            .then(m => { if (m === 'out') saveAuth(null); else if (m) saveAuth({ ...m, token: auth.token }); })
            .catch(() => {});
    }
    async function submitAuth(kind) {
        const username = $('auth-user').value.trim(), password = $('auth-pass').value;
        $('auth-error').textContent = '';
        try {
            const r = await fetch(`api/auth/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
            const m = await r.json().catch(() => ({}));
            if (!r.ok) { $('auth-error').textContent = m.error || '잠시 후 다시 해 주세요'; return; }
            saveAuth(m);
            $('auth-pass').value = '';
            closeModal('auth-modal');
        } catch (e) { $('auth-error').textContent = '서버에 연결할 수 없어요'; }
    }
    function openModal(id) { $(id).hidden = false; }
    function closeModal(id) { $(id).hidden = true; }
    $('auth-btn').addEventListener('click', () => { refreshMe(); renderAuth(); openModal('auth-modal'); setTimeout(() => !auth && $('auth-user').focus(), 0); });
    $('auth-login').addEventListener('click', e => { e.preventDefault(); submitAuth('login'); });
    $('auth-signup').addEventListener('click', e => { e.preventDefault(); submitAuth('signup'); });
    $('auth-logout').addEventListener('click', () => {
        if (auth) fetch('api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => {});
        saveAuth(null);
    });
    $('join-login').addEventListener('click', e => { e.preventDefault(); openModal('auth-modal'); setTimeout(() => $('auth-user').focus(), 0); });
    $('rank-btn').addEventListener('click', () => { loadRanking(); openModal('rank-modal'); });
    $('mute-btn').addEventListener('click', () => { Sfx.toggle(); renderMute(); });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m) m.hidden = true; }));
    function renderMute() { $('mute-btn').textContent = Sfx.muted ? '소리 꺼짐' : '소리 켜짐'; }
    renderMute();

    function loadRanking() {
        const body = $('rank-body');
        body.innerHTML = '<tr><td colspan="6">불러오는 중…</td></tr>';
        fetch('api/leaderboard').then(r => r.json()).then(list => {
            body.innerHTML = '';
            if (!list.length) { body.innerHTML = '<tr><td colspan="6">아직 기록이 없어요. 친구와 대전해서 1등을 차지하세요!</td></tr>'; return; }
            for (const a of list) {
                const tr = document.createElement('tr');
                if (auth && a.username === auth.username) tr.className = 'me';
                const kd = a.deaths ? (a.kills / a.deaths).toFixed(1) : a.kills.toFixed(1);
                for (const v of [a.rank, a.username, a.wins, a.games, a.kills, kd]) {
                    const td = document.createElement('td');
                    td.textContent = v;
                    tr.appendChild(td);
                }
                body.appendChild(tr);
            }
        }).catch(() => { body.innerHTML = '<tr><td colspan="6">불러오지 못했어요</td></tr>'; });
    }
    renderAuth();
    refreshMe();

    // ---------- 방 입장 화면 (HTML) ----------
    const form = $('join');
    const nameInput = $('join-name');
    const roomInput = $('join-room');
    try { nameInput.value = localStorage.getItem('eb-name') || ''; } catch (e) { /* 저장소 없음 */ }
    roomInput.value = new URLSearchParams(location.search).get('room') || 'LOBBY';
    $('join-back').addEventListener('click', () => { form.hidden = true; scene = 'select'; });
    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = nameInput.value.trim() || chosen.name;
        try { localStorage.setItem('eb-name', name); } catch (err) { /* 무시 */ }
        connect(name, roomInput.value.trim() || 'LOBBY');
    });
    function loadRooms() {
        fetch('api/rooms').then(r => r.json()).then(list => {
            const box = $('join-rooms');
            box.innerHTML = '';
            list.filter(r => r.players > 0).slice(0, 6).forEach(r => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'chip';
                b.textContent = `${r.code} ${r.players}/${r.max}`;
                b.addEventListener('click', () => { roomInput.value = r.code; });
                box.appendChild(b);
            });
        }).catch(() => {});
    }

    function openJoin(spec) {
        chosen = spec;
        $('join-char').textContent = `${spec.name} (${ELEMENTS[spec.element].name})`;
        form.hidden = false;
        scene = 'join';
        errorText = '';
        Sfx.play('ui');
        loadRooms();
        setTimeout(() => (auth ? roomInput : nameInput).focus(), 0);
    }

    // ---------- 서버 연결 ----------
    function connect(name, room) {
        form.hidden = true;
        scene = 'connecting';
        snap = null; myId = null; view.clear(); fx = []; floats = []; parts = []; feed = []; banner = null; bigText = null; lastPhase = null;
        ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name, room, character: chosen.id, token: auth ? auth.token : undefined }));
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.type === 'welcome') {
                myId = m.id; roomCode = m.room; scene = 'play';
                if (m.rocks) rocks = m.rocks;
                if (m.arena) ARENA = m.arena;
                floorCache = null;
                history.replaceState(null, '', `?room=${encodeURIComponent(m.room)}`);
            } else if (m.type === 'state') onState(m);
            else if (m.type === 'error') { errorText = m.message; leave(); }
        };
        ws.onclose = () => { if (scene === 'play' || scene === 'connecting') { errorText = errorText || '서버와 연결이 끊겼어요'; scene = 'select'; } };
    }

    function leave() {
        if (ws) { ws.onclose = null; ws.close(); ws = null; }
        scene = 'select';
        refreshMe();
    }

    function send(extra) {
        if (!ws || ws.readyState !== 1 || !snap) return;
        const mv = meView();
        const aim = mv ? Math.atan2(mouse.y - mv.y, mouse.x - mv.x) : 0;
        const dist = mv ? Math.hypot(mouse.x - mv.x, mouse.y - mv.y) : 0;
        ws.send(JSON.stringify({
            type: 'input', up: keys.has('KeyW'), down: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'),
            fire: mouse.down, aim, dist, ...extra,
        }));
    }

    function burstParts(x, y, color, n, speed = 160, size = 3, life = 0.6) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, s = rand(0.3, 1) * speed;
            parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, color, size: rand(size * 0.6, size * 1.4), born: t, life: rand(life * 0.6, life) });
        }
    }

    const nameOf = id => { const p = snap && snap.players.find(q => q.id === id); return p ? p.name : ''; };
    const elOf = id => { const p = snap && snap.players.find(q => q.id === id); return p ? p.el : null; };

    function onState(m) {
        const prev = snap;
        snap = m;
        const seen = new Set();
        for (const u of [...m.players, ...m.projectiles, ...m.areas, ...m.items]) {
            const key = `${u.id}`;
            seen.add(key);
            const v = view.get(key);
            if (!v || Math.hypot(v.x - u.x, v.y - u.y) > 120) view.set(key, { x: u.x, y: u.y, walk: v ? v.walk : 0, born: v ? v.born : t, trail: [] });
        }
        for (const k of view.keys()) if (!seen.has(k)) view.delete(k);

        for (const e of m.events) {
            if (e.k === 'float') {
                if (!e.only || e.only === myId) floats.push({ ...e, born: t });
                if (e.dmg) {
                    burstParts(e.x, e.y + 14, e.color === '#c06bff' ? '#c06bff' : '#ffffff', e.big ? 10 : 5, 120, 2.5, 0.35);
                    if (e.to === myId) { shake = Math.min(14, shake + 3 + e.dmg * 0.25); hurtFlash = Math.min(1, hurtFlash + 0.35 + e.dmg * 0.02); Sfx.play('hurt'); }
                    else if (e.from === myId) { Sfx.play(e.big ? 'crit' : 'hit', { vol: 1 }); shake = Math.min(14, shake + 1); }
                    else Sfx.play('hit', { vol: 0.3 });
                }
            } else if (e.k === 'ring' || e.k === 'slash') fx.push({ ...e, born: t, life: e.k === 'ring' ? 0.35 : 0.18 });
            else if (e.k === 'boom') {
                fx.push({ k: 'flash', x: e.x, y: e.y, r: e.r, color: e.color, born: t, life: 0.3 });
                burstParts(e.x, e.y, e.color, Math.min(40, e.r / 3), e.r * 2.4, 4, 0.7);
                if (e.r >= 100) { shake = Math.min(18, shake + e.r / 12); Sfx.play('boom'); }
                else Sfx.play('boom', { vol: 0.35 });
            } else if (e.k === 'banner') banner = { text: e.text, born: t };
            else if (e.k === 'kill') {
                feed.unshift({ ...e, born: t });
                feed = feed.slice(0, 5);
                burstParts(e.x, e.y, e.vColor, 36, 260, 4, 1.0);
                fx.push({ k: 'ring', x: e.x, y: e.y, r: 70, color: e.vColor, born: t, life: 0.5 });
                if (e.killerId === myId) { bigText = { text: '처치!', color: '#ffd84a', born: t }; Sfx.play('kill'); shake = Math.min(18, shake + 6); }
                else if (e.id === myId) { bigText = { text: '쓰러졌어요', color: '#ff7a7a', born: t }; Sfx.play('die'); }
            } else if (e.k === 'pickup') {
                burstParts(e.x, e.y, e.color, 16, 140, 3, 0.5);
                if (e.who === myId) Sfx.play('pickup');
            } else if (e.k === 'rock') {
                burstParts(e.x, e.y, '#8d8676', 6, 110, 2.5, 0.4);
                Sfx.play('rock', { vol: 0.5 });
            } else if (e.k === 'sfx') {
                if (e.s === 'shot') Sfx.play('shot', { el: elOf(e.who), vol: e.who === myId ? 1 : 0.35 });
                else if (e.s === 'swing') Sfx.play('swing', { vol: e.who === myId ? 1 : 0.35 });
                else if (e.s === 'start') Sfx.play('start');
            }
        }
        if (prev && prev.phase !== m.phase && m.phase === 'ended') {
            const mine = m.winnerId === myId;
            bigText = null;
            Sfx.play(mine ? 'win' : 'lose');
            if (mine) for (let i = 0; i < 6; i++) setTimeout(() => burstParts(rand(200, 760), rand(120, 300), ['#ffd84a', '#ff6b3d', '#3da5ff', '#5fd38d'][i % 4], 40, 300, 4, 1.2), i * 180);
        }
        if (prev && prev.zone == null && m.zone) Sfx.play('zone');
        // 내 필살기가 꽉 차면 알려 줌
        const mp = me(), pp = prev && prev.players.find(p => p.id === myId);
        if (mp && pp && pp.ult < 100 && mp.ult >= 100) { Sfx.play('ult'); floats.push({ x: mp.x, y: mp.y - 40, text: 'R 필살기 준비!', color: '#ffd84a', big: true, born: t }); }
        lastPhase = m.phase;
    }

    const me = () => snap && snap.players.find(p => p.id === myId);
    const meView = () => view.get(`${myId}`);

    // ---------- 갱신 ----------
    function update(dt) {
        if (pressed.has('Escape')) { leave(); return; }
        if (pressed.has('KeyM')) { Sfx.toggle(); renderMute(); }
        if (!snap) return;
        // 화면 위치를 서버 위치로 부드럽게 맞춤
        const k = 1 - Math.exp(-dt * 18);
        for (const u of [...snap.players, ...snap.areas, ...snap.items]) {
            const v = view.get(`${u.id}`);
            if (!v) continue;
            v.x += (u.x - v.x) * k;
            v.y += (u.y - v.y) * k;
            if (u.moving) v.walk += dt * 14;
            if (u.haste > 0 && u.moving && Math.random() < 0.5) parts.push({ x: v.x + rand(-8, 8), y: v.y + 18, vx: 0, vy: -20, color: '#5ff0e0', size: 2.5, born: t, life: 0.35 });
        }
        for (const b of snap.projectiles) {
            const v = view.get(`${b.id}`);
            if (!v) continue;
            // 탄은 속도대로 미리 움직이고 서버 위치로 살짝 당김
            v.x += b.vx * dt; v.y += b.vy * dt;
            v.x += (b.x - v.x) * k * 0.4; v.y += (b.y - v.y) * k * 0.4;
            v.trail.push({ x: v.x, y: v.y });
            if (v.trail.length > 7) v.trail.shift();
        }
        for (const [code, slot] of [['KeyQ', 'q'], ['KeyE', 'e'], ['KeyR', 'r']]) {
            if (pressed.has(code)) send({ cast: slot });
        }
        if (pressed.has('Space')) send({ cast: 'r' });
        if (t - lastSend > 0.05) { send(); lastSend = t; }
        fx = fx.filter(f => t - f.born < f.life);
        floats = floats.filter(f => t - f.born < 0.9);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy = p.vy * 0.92 + 200 * dt; }
        parts = parts.filter(p => t - p.born < p.life);
        if (parts.length > 600) parts.splice(0, parts.length - 600);
        feed = feed.filter(f => t - f.born < 6);
        if (banner && t - banner.born > 1.8) banner = null;
        if (bigText && t - bigText.born > 1.1) bigText = null;
        shake = Math.max(0, shake - dt * 40);
        hurtFlash = Math.max(0, hurtFlash - dt * 2.2);
    }

    // ---------- 그리기 ----------
    let floorCache = null;
    function buildFloor() {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#15171f'; g.fillRect(0, 0, W, H);
        // 돌 타일
        const T = 46;
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let y = ARENA.y; y < ARENA.y + ARENA.h; y += T) {
            for (let x = ARENA.x; x < ARENA.x + ARENA.w; x += T) {
                const l = 30 + Math.floor(rnd() * 7);
                g.fillStyle = `rgb(${l},${l + 3},${l + 12})`;
                g.fillRect(x, y, Math.min(T, ARENA.x + ARENA.w - x), Math.min(T, ARENA.y + ARENA.h - y));
                g.fillStyle = 'rgba(255,255,255,0.025)';
                g.fillRect(x, y, Math.min(T, ARENA.x + ARENA.w - x), 2);
                g.fillStyle = 'rgba(0,0,0,0.18)';
                g.fillRect(x, y + T - 2, Math.min(T, ARENA.x + ARENA.w - x), 2);
                if (rnd() < 0.18) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + rnd() * 30, y + rnd() * 30, 6 + rnd() * 8, 2); }
            }
        }
        // 가운데 원소 문양
        const cx = ARENA.x + ARENA.w / 2, cy = ARENA.y + ARENA.h / 2;
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,0.05)';
        g.beginPath(); g.arc(cx, cy, 150, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx, cy, 110, 0, Math.PI * 2); g.stroke();
        ['WATER', 'FIRE', 'WIND', 'EARTH'].forEach((el, i) => {
            const a = -Math.PI / 2 + i * Math.PI / 2;
            g.fillStyle = ELEMENTS[el].color + '30';
            g.beginPath(); g.arc(cx + Math.cos(a) * 130, cy + Math.sin(a) * 130, 12, 0, Math.PI * 2); g.fill();
        });
        // 구석 원소 빛
        [['FIRE', 0, 0], ['WATER', 1, 0], ['WIND', 0, 1], ['EARTH', 1, 1]].forEach(([el, ix, iy]) => {
            const x = ARENA.x + ix * ARENA.w, y = ARENA.y + iy * ARENA.h;
            const gr = g.createRadialGradient(x, y, 0, x, y, 220);
            gr.addColorStop(0, ELEMENTS[el].color + '22'); gr.addColorStop(1, ELEMENTS[el].color + '00');
            g.fillStyle = gr; g.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
        });
        g.strokeStyle = '#4a4f66'; g.lineWidth = 4;
        g.strokeRect(ARENA.x - 2, ARENA.y - 2, ARENA.w + 4, ARENA.h + 4);
        g.strokeStyle = '#0c0d12'; g.lineWidth = 2;
        g.strokeRect(ARENA.x - 5, ARENA.y - 5, ARENA.w + 10, ARENA.h + 10);
        return c;
    }
    function drawFloor() {
        if (!floorCache) floorCache = buildFloor();
        ctx.drawImage(floorCache, 0, 0);
    }

    function drawRock(k) {
        const { x, y, r } = k;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.55, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        const top = y - r * 0.55;
        // 몸통
        ctx.fillStyle = '#5b5868';
        ctx.beginPath();
        ctx.moveTo(x - r, y + r * 0.35);
        ctx.lineTo(x - r * 0.95, top + r * 0.1);
        ctx.lineTo(x - r * 0.55, top - r * 0.45);
        ctx.lineTo(x + r * 0.3, top - r * 0.55);
        ctx.lineTo(x + r * 0.95, top - r * 0.05);
        ctx.lineTo(x + r, y + r * 0.35);
        ctx.quadraticCurveTo(x, y + r * 0.75, x - r, y + r * 0.35);
        ctx.fill();
        // 윗면
        ctx.fillStyle = '#7a7788';
        ctx.beginPath();
        ctx.moveTo(x - r * 0.95, top + r * 0.1);
        ctx.lineTo(x - r * 0.55, top - r * 0.45);
        ctx.lineTo(x + r * 0.3, top - r * 0.55);
        ctx.lineTo(x + r * 0.95, top - r * 0.05);
        ctx.lineTo(x + r * 0.35, top + r * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x - r * 0.4, top - r * 0.3, r * 0.5, 3);
        ctx.strokeStyle = '#2b2933'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - r * 0.1, top + r * 0.3); ctx.lineTo(x + r * 0.15, y + r * 0.2); ctx.stroke();
        // 이끼
        ctx.fillStyle = 'rgba(95,211,141,0.35)';
        ctx.fillRect(x + r * 0.2, top - r * 0.2, r * 0.35, 3);
    }

    function drawItem(it) {
        const v = view.get(it.id) || it;
        const look = ITEM_LOOK[it.kind] || { icon: '?' };
        const age = t - (v.born || t);
        const pop = Math.min(1, age * 4);
        const bob = Math.sin(t * 4 + it.x) * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(v.x, v.y + 12, 11, 4, 0, 0, Math.PI * 2); ctx.fill();
        const gr = ctx.createRadialGradient(v.x, v.y + bob - 6, 0, v.x, v.y + bob - 6, 26);
        gr.addColorStop(0, it.color + '88'); gr.addColorStop(1, it.color + '00');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(v.x, v.y + bob - 6, 26, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(v.x, v.y + bob - 6);
        ctx.scale(pop, pop);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#1a1c25'; ctx.fillRect(-11, -11, 22, 22);
        ctx.fillStyle = it.color; ctx.fillRect(-9, -9, 18, 18);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-9, -9, 18, 5);
        ctx.restore();
        ctx.fillStyle = '#14161d'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(look.icon, v.x, v.y + bob - 1.5);
    }

    function drawUnit(u) {
        const v = view.get(`${u.id}`) || u;
        const x = v.x, y = v.y;
        const isMe = u.id === myId;
        const color = ELEMENTS[u.el].color;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x, y + 21, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
        let facing = u.facing, dir = u.dir;
        if (u.power > 0) {
            const gr = ctx.createRadialGradient(x, y, 4, x, y, 40);
            gr.addColorStop(0, 'rgba(255,138,61,0.35)'); gr.addColorStop(1, 'rgba(255,138,61,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
        }
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
        Sprites.drawCharacter(ctx, x, y, { kind: u.ch, facing, dir, walk: v.walk || 0, moving: u.moving, time: t, hurt: u.hurt });
        if (u.shield) {
            ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * 10) * 0.25;
            ctx.beginPath(); ctx.arc(x, y - 6, u.r + 12, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (u.slow) { ctx.strokeStyle = 'rgba(120,190,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, u.r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        if (u.stun) { ctx.fillStyle = '#ffd84a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★ 기절', x, y - 66); }
        ctx.textAlign = 'center';
        ctx.font = isMe ? 'bold 12px sans-serif' : '12px sans-serif';
        const label = u.name;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(label, x + 1, y - 49);
        ctx.fillStyle = isMe ? '#ffffff' : u.bot ? '#b8bccb' : '#ffe9a8';
        ctx.fillText(label, x, y - 50);
        const bw = 44;
        ctx.fillStyle = '#11131a'; ctx.fillRect(x - bw / 2 - 1, y + 29, bw + 2, 7);
        ctx.fillStyle = isMe ? '#6fdc7a' : '#ff6a6a';
        ctx.fillRect(x - bw / 2, y + 30, bw * clamp(u.hp / u.maxHp, 0, 1), 5);
        if (u.ult >= 100) { ctx.fillStyle = '#ffd84a'; ctx.fillRect(x - bw / 2, y + 36, bw, 2); }
    }

    function drawProjectile(b) {
        const v = view.get(`${b.id}`) || b;
        if (v.trail && v.trail.length > 1) {
            ctx.strokeStyle = b.color; ctx.lineCap = 'round';
            for (let i = 1; i < v.trail.length; i++) {
                ctx.globalAlpha = i / v.trail.length * 0.5;
                ctx.lineWidth = b.r * 1.6 * (i / v.trail.length);
                ctx.beginPath(); ctx.moveTo(v.trail[i - 1].x, v.trail[i - 1].y); ctx.lineTo(v.trail[i].x, v.trail[i].y); ctx.stroke();
            }
            ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        }
        const gr = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, b.r * 2.4);
        gr.addColorStop(0, b.color + 'aa'); gr.addColorStop(1, b.color + '00');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(v.x, v.y, b.r * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(v.x, v.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(v.x - b.r * 0.25, v.y - b.r * 0.25, b.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }

    function drawZone() {
        const z = snap.zone;
        if (!z) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
        ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(110,40,160,0.28)';
        ctx.fill('evenodd');
        ctx.restore();
        ctx.strokeStyle = `rgba(192,107,255,${0.6 + Math.sin(t * 6) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawWorld() {
        ctx.save();
        if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
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
        for (const it of snap.items) drawItem(it);
        // 바위와 캐릭터를 아래쪽부터 그려서 앞뒤가 맞게
        const list = rocks.map(k => ({ y: k.y + k.r * 0.3, draw: () => drawRock(k) }));
        for (const p of snap.players) {
            if (p.hp <= 0) continue;
            const v = view.get(`${p.id}`) || p;
            list.push({ y: v.y, draw: () => drawUnit(p) });
        }
        list.sort((a, b) => a.y - b.y).forEach(o => o.draw());
        for (const b of snap.projectiles) drawProjectile(b);
        drawZone();
        for (const f of fx) {
            const k = (t - f.born) / f.life;
            if (f.k === 'flash') {
                ctx.globalAlpha = (1 - k) * 0.7;
                const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, f.color); gr.addColorStop(1, f.color + '00');
                ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.7 + 0.3 * k), 0, Math.PI * 2); ctx.fill();
                ctx.globalAlpha = 1;
                continue;
            }
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = f.color; ctx.lineWidth = 3;
            ctx.beginPath();
            if (f.k === 'ring') ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
            else ctx.arc(f.x, f.y, f.r, f.ang - f.arc / 2, f.ang + f.arc / 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        for (const p of parts) {
            ctx.globalAlpha = clamp(1 - (t - p.born) / p.life, 0, 1);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        for (const f of floats) {
            const k = (t - f.born) / 0.9;
            ctx.globalAlpha = 1 - k * k;
            ctx.font = `${f.big ? 'bold 18px' : 'bold 14px'} sans-serif`;
            ctx.textAlign = 'center';
            const pop = k < 0.15 ? 1 + (0.15 - k) * 3 : 1;
            ctx.save(); ctx.translate(f.x, f.y - k * 30); ctx.scale(pop, pop);
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(f.text, 1, 1);
            ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
            ctx.restore();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        if (hurtFlash > 0) {
            const gr = ctx.createRadialGradient(W / 2, (H - HUD_H) / 2, 200, W / 2, (H - HUD_H) / 2, 560);
            gr.addColorStop(0, 'rgba(255,40,40,0)'); gr.addColorStop(1, `rgba(255,40,40,${hurtFlash * 0.45})`);
            ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H - HUD_H);
        }
    }

    function bar(x, y, w, h, frac, color, label) {
        ctx.fillStyle = '#11131a'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, w * clamp(frac, 0, 1), 3);
        ctx.fillStyle = '#ffffff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(label, x + 6, y + h - 3);
    }

    function drawHud() {
        const p = me();
        const y0 = H - HUD_H;
        ctx.fillStyle = '#171a22'; ctx.fillRect(0, y0, W, HUD_H);
        ctx.fillStyle = '#262a38'; ctx.fillRect(0, y0, W, 2);
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
        // 버프
        let bx = 82;
        for (const [val, label, c] of [[p.haste, '신속', '#5ff0e0'], [p.power, '강화', '#ff8a3d']]) {
            if (val > 0) {
                ctx.fillStyle = c + '33'; ctx.fillRect(bx, y0 + 74, 66, 14);
                ctx.fillStyle = c; ctx.font = 'bold 11px sans-serif';
                ctx.fillText(`${label} ${val.toFixed(0)}초`, bx + 5, y0 + 85);
                bx += 72;
            }
        }
        if (p.shield) { ctx.fillStyle = '#e8c27a33'; ctx.fillRect(bx, y0 + 74, 56, 14); ctx.fillStyle = '#e8c27a'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('보호막', bx + 5, y0 + 85); }

        const cost = COST[p.ch];
        const left = { atk: p.readyAtk, q: p.readyQ, e: p.readyE };
        [['atk', '좌클릭'], ['q', 'Q'], ['e', 'E'], ['r', 'R']].forEach(([slot, key], i) => {
            const x = 380 + i * 132, y = y0 + 14, w = 120, h = 64;
            let frac = 1, note = '', usable = true;
            if (slot === 'r') { frac = p.ult / 100; note = p.ult >= 100 ? '준비됨! (R / Space)' : `${Math.floor(p.ult)}%`; usable = p.ult >= 100; }
            else {
                const [cd, mp] = cost[slot];
                frac = left[slot] > 0 ? 1 - left[slot] / cd : 1;
                note = left[slot] > 0 ? `${left[slot].toFixed(1)}초` : mp ? `마나 ${mp}` : '';
                usable = frac >= 1 && p.mp >= mp;
            }
            if (p.hp <= 0 || snap.phase !== 'playing') usable = false;
            ctx.fillStyle = '#20242f'; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = (slot === 'r' ? '#ffd84a' : color) + (usable ? '55' : '22');
            ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
            const glow = slot === 'r' && usable;
            ctx.strokeStyle = glow ? `rgba(255,216,74,${0.6 + Math.sin(t * 8) * 0.4})` : usable ? color : '#3a4156';
            ctx.lineWidth = glow ? 3 : 2; ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(key, x + 8, y + 18);
            ctx.font = '13px sans-serif';
            ctx.fillText(spec.skills[i], x + 8, y + 38);
            ctx.fillStyle = glow ? '#ffd84a' : '#9aa0b4'; ctx.font = '11px sans-serif';
            ctx.fillText(note, x + 8, y + 56);
        });
    }

    function drawScoreboard() {
        ctx.textAlign = 'right'; ctx.font = '12px sans-serif';
        let y = 40;
        const rows = [...snap.players].sort((a, b) => b.wins - a.wins || b.kills - a.kills);
        ctx.fillStyle = 'rgba(12,13,18,0.55)';
        ctx.fillRect(W - 260, 26, 236, 22 + rows.length * 18);
        ctx.fillStyle = '#9aa0b4';
        ctx.fillText(`방 ${roomCode} · ${snap.ranked ? '전적 기록 중' : '봇전 (기록 안 됨)'}`, W - 32, y);
        for (const p of rows) {
            y += 18;
            ctx.fillStyle = p.id === myId ? '#ffffff' : p.hp > 0 ? (p.bot ? '#a9aec0' : '#ffe9a8') : '#5d6275';
            ctx.fillText(`${p.hp > 0 ? '' : '✕ '}${p.name}${p.bot ? ' [봇]' : ''}  승 ${p.wins} · 처치 ${p.kills}`, W - 32, y);
            ctx.fillStyle = ELEMENTS[p.el].color;
            ctx.fillRect(W - 250, y - 8, 6, 6);
        }
    }

    function drawFeed() {
        ctx.textAlign = 'left'; ctx.font = 'bold 12px sans-serif';
        feed.forEach((f, i) => {
            const y = H - HUD_H - 22 - i * 22;
            const a = clamp(6 - (t - f.born), 0, 1);
            ctx.globalAlpha = a;
            const text = `${f.killer}  ▶  ${f.victim}`;
            const w = ctx.measureText(text).width + 20;
            ctx.fillStyle = 'rgba(12,13,18,0.6)'; ctx.fillRect(28, y - 14, w, 19);
            let x = 38;
            ctx.fillStyle = f.kColor; ctx.fillText(f.killer, x, y); x += ctx.measureText(f.killer + '  ').width;
            ctx.fillStyle = '#c3c7d6'; ctx.fillText('▶', x, y); x += ctx.measureText('▶  ').width;
            ctx.fillStyle = f.vColor; ctx.fillText(f.victim, x, y);
            ctx.globalAlpha = 1;
        });
    }

    function drawOverlay() {
        const p = me();
        ctx.textAlign = 'center';
        if (snap.phase === 'playing') {
            const zi = snap.zoneIn;
            ctx.font = 'bold 13px sans-serif';
            if (zi > 0 && zi <= 10) { ctx.fillStyle = '#c06bff'; ctx.fillText(`안전 구역 축소까지 ${Math.ceil(zi)}초`, W / 2, 40); }
            else if (snap.zone) { ctx.fillStyle = '#c06bff'; ctx.fillText('보라색 바깥은 위험해요! 가운데로', W / 2, 40); }
            if (snap.roundTime < 2.5) {
                const k = snap.roundTime / 2.5;
                ctx.globalAlpha = 1 - k;
                ctx.font = 'bold 54px sans-serif'; ctx.fillStyle = '#ffffff';
                ctx.fillText('싸워라!', W / 2, (H - HUD_H) / 2 - 20 - k * 20);
                ctx.globalAlpha = 1;
            }
        }
        if (snap.phase === 'ended') {
            const mine = snap.winnerId === myId;
            ctx.fillStyle = 'rgba(10,11,15,0.65)'; ctx.fillRect(0, H / 2 - 90, W, 130);
            ctx.font = 'bold 40px sans-serif';
            ctx.fillStyle = mine ? '#ffd84a' : '#ffffff';
            ctx.fillText(mine ? '승리!' : snap.winner ? `${snap.winner} 승리!` : '무승부', W / 2, H / 2 - 30);
            ctx.font = '15px sans-serif'; ctx.fillStyle = '#c3c7d6';
            ctx.fillText(`${snap.endsIn}초 후 다음 판${snap.ranked && auth ? ' · 전적에 기록됐어요' : ''}`, W / 2, H / 2 + 8);
        } else if (p && p.hp <= 0) {
            ctx.fillStyle = 'rgba(10,11,15,0.5)'; ctx.fillRect(0, H / 2 - 120, W, 60);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText('관전 중', W / 2, H / 2 - 94);
            ctx.font = '13px sans-serif'; ctx.fillStyle = '#c3c7d6';
            ctx.fillText('이번 판이 끝나면 다시 들어가요', W / 2, H / 2 - 72);
        } else if (banner) {
            const k = (t - banner.born) / 1.8;
            ctx.globalAlpha = Math.min(1, 2 - 2 * k);
            ctx.font = 'bold 22px sans-serif';
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(banner.text, W / 2 + 2, 96);
            ctx.fillStyle = '#ffffff'; ctx.fillText(banner.text, W / 2, 94);
            ctx.globalAlpha = 1;
        }
        if (bigText) {
            const k = (t - bigText.born) / 1.1;
            const s = k < 0.15 ? 1.6 - k * 4 : 1;
            ctx.save();
            ctx.globalAlpha = Math.min(1, 2.5 - 2.5 * k);
            ctx.translate(W / 2, (H - HUD_H) / 2 - 60); ctx.scale(s, s);
            ctx.font = 'bold 44px sans-serif';
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(bigText.text, 3, 3);
            ctx.fillStyle = bigText.color; ctx.fillText(bigText.text, 0, 0);
            ctx.restore();
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
        if (pressed.has('KeyM')) { Sfx.toggle(); renderMute(); }
    }

    function drawSelect() {
        drawFloor();
        ctx.fillStyle = 'rgba(15,17,23,0.72)'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        const title = '원소 난투';
        ctx.font = 'bold 46px sans-serif';
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(title, W / 2 + 3, 95);
        const gr = ctx.createLinearGradient(W / 2 - 120, 0, W / 2 + 120, 0);
        ['#ff6b3d', '#3da5ff', '#5fd38d', '#c8954a'].forEach((c, i) => gr.addColorStop(i / 3, c));
        ctx.fillStyle = gr; ctx.fillText(title, W / 2, 92);
        ctx.font = '15px sans-serif'; ctx.fillStyle = '#9aa0b4';
        ctx.fillText('캐릭터를 고르세요 (클릭 또는 1~4) · 혼자 들어가면 봇 2명과 대결', W / 2, 126);
        ctx.fillText('상성: 물 → 불 → 바람 → 땅 → 물  (이기는 쪽 피해 +20%)', W / 2, 150);
        if (errorText) { ctx.fillStyle = '#ff7a7a'; ctx.fillText(errorText, W / 2, 174); }
        CHARACTERS.forEach((c, i) => {
            const r = cardRect(i), hover = i === hoverCard;
            const lift = hover ? -6 : 0;
            ctx.fillStyle = hover ? '#2a2f3d' : '#20242f'; ctx.fillRect(r.x, r.y + lift, r.w, r.h);
            if (hover) {
                const g2 = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
                g2.addColorStop(0, c.color + '30'); g2.addColorStop(1, c.color + '00');
                ctx.fillStyle = g2; ctx.fillRect(r.x, r.y + lift, r.w, r.h);
            }
            ctx.strokeStyle = hover ? c.color : '#3a4156'; ctx.lineWidth = hover ? 3 : 1.5; ctx.strokeRect(r.x, r.y + lift, r.w, r.h);
            ctx.fillStyle = c.color + '33'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + 116 + lift, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
            Sprites.drawCharacter(ctx, r.x + r.w / 2, r.y + 86 + lift, { kind: c.id, size: 1.46, time: t + i, moving: hover, walk: t * 10 });
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText(c.name, r.x + r.w / 2, r.y + 146 + lift);
            ctx.font = '13px sans-serif'; ctx.fillStyle = c.color;
            ctx.fillText(`${ELEMENTS[c.element].name} · ${c.role}`, r.x + r.w / 2, r.y + 166 + lift);
            ctx.fillStyle = '#c3c7d6';
            ctx.fillText(`체력 ${c.maxHp} · 속도 ${c.moveSpeed}`, r.x + r.w / 2, r.y + 188 + lift);
            ctx.textAlign = 'left'; ctx.fillStyle = '#9aa0b4'; ctx.font = '12px sans-serif';
            ['좌클릭', 'Q', 'E', 'R'].forEach((k, j) => ctx.fillText(`${k}  ${c.skills[j]}`, r.x + 22, r.y + 214 + j * 19 + lift));
            ctx.textAlign = 'center';
            ctx.fillStyle = '#6b7186'; ctx.fillText(`${i + 1}`, r.x + r.w / 2, r.y + r.h - 12 + lift);
        });
        ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillStyle = '#7d8398';
        ctx.fillText('아이템: + 회복 · M 마나 · » 신속 · ! 강화 · ◆ 보호막 · ★ 필살 게이지     바위 뒤에 숨으면 탄을 막아요', W / 2, 530);
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
            if (scene === 'play' && snap) { drawWorld(); drawHud(); drawScoreboard(); drawFeed(); drawOverlay(); }
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
        get scene() { return scene; }, get state() { return snap; }, get me() { return me(); }, get auth() { return auth; },
        join: (i, name, room) => { chosen = CHARACTERS[i]; connect(name, room); },
    };
})();
