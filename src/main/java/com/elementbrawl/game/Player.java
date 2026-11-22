package com.elementbrawl.game;

import com.elementbrawl.character.CharacterSpec;

import java.util.HashSet;
import java.util.Set;

public class Player extends Unit {
    public final String name;
    public final CharacterSpec spec;
    public double mp, maxMp, ult;
    public double readyAtk, readyQ, readyE;
    public double lastAttackAt = -10;
    public double aim;
    public double aimDist = 200;   // 조준점까지 거리 (범위 스킬 위치)
    public String dir = "down";
    public boolean moving;
    public double respawnAt = -1;
    public int kills;
    public int wins;

    // 입력 (클라이언트가 보낸 마지막 값)
    public boolean up, down, left, right, fire;
    public final Set<String> casts = new HashSet<>();

    // 풍후 돌진
    public Dash dash;

    public Player(String id, String name, CharacterSpec spec) {
        super(id);
        this.name = name;
        this.spec = spec;
        this.element = spec.element();
        this.maxHp = spec.maxHp();
        this.maxMp = spec.maxMp();
        reset();
    }

    public void reset() {
        hp = maxHp;
        mp = maxMp;
        ult = 0;
        readyAtk = readyQ = readyE = 0;
        slowUntil = stunUntil = shieldUntil = 0;
        dash = null;
        respawnAt = -1;
        casts.clear();
    }

    public static final class Dash {
        public double vx, vy, until, dmg;
        public final Set<Unit> hit = new HashSet<>();
    }
}
