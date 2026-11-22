package com.elementbrawl.game;

import com.elementbrawl.character.Element;

/** 경기장 위의 맞을 수 있는 것(플레이어, 허수아비). 좌표 단위는 화면 픽셀. */
public abstract class Unit {
    public final String id;
    public Element element;
    public double x, y, r = 18;
    public double hp, maxHp;
    public double slowUntil, stunUntil, shieldUntil, hurtAt = -10;
    public int facing = 1;
    public double vx, vy;          // 지난 틱 이동 속도 (봇 조준 예측용)

    protected Unit(String id) {
        this.id = id;
    }

    public boolean alive() {
        return hp > 0;
    }

    public double dist(double px, double py) {
        return Math.hypot(x - px, y - py);
    }

    public double dist(Unit o) {
        return dist(o.x, o.y);
    }
}
