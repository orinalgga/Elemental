package com.elementbrawl.game;

import com.elementbrawl.character.Element;

/** 혼자 있을 때 나오는 연습용 허수아비. 천천히 돌아다니며 가끔 탄을 쏜다. */
public class Dummy extends Unit {
    public final double hx, hy;
    public double wanderAng, fireAt, respawnAt;

    public Dummy(String id, Element element, double hx, double hy) {
        super(id);
        this.element = element;
        this.hx = hx;
        this.hy = hy;
        this.x = hx;
        this.y = hy;
        this.r = 20;
        this.maxHp = 120;
        this.hp = 120;
        this.wanderAng = Math.random() * Math.PI * 2;
    }
}
