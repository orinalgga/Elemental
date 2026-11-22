// 효과음: 파일 없이 WebAudio 로 합성한다. M 키로 끄고 켬.
window.Sfx = (() => {
    'use strict';
    let ac = null, master = null;
    let muted = false;
    try { muted = localStorage.getItem('eb-mute') === '1'; } catch (e) { /* 저장소 없음 */ }

    function ensure() {
        if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ac.destination);
        return true;
    }
    // 브라우저는 사용자 입력 뒤에만 소리를 허락함
    addEventListener('pointerdown', ensure, { once: false, passive: true });
    addEventListener('keydown', ensure, { passive: true });

    let noiseBuf = null;
    function noise() {
        if (!noiseBuf) {
            noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
            const d = noiseBuf.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        const s = ac.createBufferSource();
        s.buffer = noiseBuf;
        return s;
    }

    function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0 } = {}) {
        const t0 = ac.currentTime + delay;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g); g.connect(master);
        o.start(t0); o.stop(t0 + dur + 0.02);
    }

    function burst(dur, { vol = 0.3, freq = 1200, q = 0.8, delay = 0, type = 'lowpass' } = {}) {
        const t0 = ac.currentTime + delay;
        const s = noise(), f = ac.createBiquadFilter(), g = ac.createGain();
        f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
        f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        s.connect(f); f.connect(g); g.connect(master);
        s.start(t0); s.stop(t0 + dur + 0.02);
    }

    const ELEMENT_PITCH = { FIRE: 520, WATER: 700, WIND: 880, EARTH: 300 };
    let lastAt = {};

    function play(name, opt = {}) {
        if (muted || !ensure()) return;
        // 같은 소리가 한 프레임에 몰리면 시끄러우니 간격 둠
        const now = ac.currentTime;
        const gap = { shot: 0.04, hit: 0.03, swing: 0.05, rock: 0.05 }[name] || 0;
        if (gap && lastAt[name] && now - lastAt[name] < gap) return;
        lastAt[name] = now;
        const v = opt.vol == null ? 1 : opt.vol;
        switch (name) {
            case 'shot': tone(ELEMENT_PITCH[opt.el] || 600, 0.09, { type: 'square', vol: 0.06 * v, slide: 0.5 }); break;
            case 'swing': burst(0.12, { vol: 0.12 * v, freq: 3000, type: 'bandpass', q: 1.5 }); break;
            case 'hit': burst(0.08, { vol: 0.2 * v, freq: 1800 }); tone(160, 0.08, { type: 'triangle', vol: 0.15 * v, slide: 0.6 }); break;
            case 'hurt': burst(0.15, { vol: 0.35, freq: 900 }); tone(110, 0.18, { type: 'sawtooth', vol: 0.12, slide: 0.5 }); break;
            case 'crit': tone(980, 0.1, { type: 'square', vol: 0.08 * v }); tone(1470, 0.12, { type: 'square', vol: 0.06 * v, delay: 0.05 }); break;
            case 'boom': burst(0.5, { vol: 0.45 * v, freq: 700 }); tone(70, 0.45, { type: 'sine', vol: 0.4 * v, slide: 0.4 }); break;
            case 'rock': tone(220, 0.06, { type: 'triangle', vol: 0.08 * v, slide: 0.7 }); break;
            case 'pickup': [660, 880, 1320].forEach((f, i) => tone(f, 0.1, { type: 'triangle', vol: 0.12, delay: i * 0.06 })); break;
            case 'heal': [520, 780].forEach((f, i) => tone(f, 0.18, { type: 'sine', vol: 0.12, delay: i * 0.08 })); break;
            case 'kill': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.07, delay: i * 0.05 })); break;
            case 'die': tone(330, 0.5, { type: 'sawtooth', vol: 0.12, slide: 0.3 }); break;
            case 'start': [262, 330, 392, 523].forEach((f, i) => tone(f, 0.14, { type: 'square', vol: 0.07, delay: i * 0.09 })); break;
            case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.08, delay: i * 0.11 })); break;
            case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: i * 0.16 })); break;
            case 'ult': tone(200, 0.4, { type: 'sawtooth', vol: 0.1, slide: 4 }); break;
            case 'zone': [880, 660, 880, 660].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.14 })); break;
            case 'ui': tone(880, 0.05, { type: 'square', vol: 0.05 }); break;
        }
    }

    return {
        play,
        get muted() { return muted; },
        toggle() {
            muted = !muted;
            try { localStorage.setItem('eb-mute', muted ? '1' : '0'); } catch (e) { /* 무시 */ }
            if (master) master.gain.value = muted ? 0 : 0.5;
            return muted;
        },
    };
})();
