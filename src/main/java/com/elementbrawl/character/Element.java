package com.elementbrawl.character;

/** 원소 상성: 물 → 불 → 바람 → 땅 → 물 (화살표 방향이 이김). */
public enum Element {
    FIRE, WATER, WIND, EARTH;

    public Element beats() {
        return switch (this) {
            case WATER -> FIRE;
            case FIRE -> WIND;
            case WIND -> EARTH;
            case EARTH -> WATER;
        };
    }

    /** 공격 원소가 방어 원소에 주는 피해 배율. */
    public double multiplierAgainst(Element defender) {
        if (beats() == defender) return 1.2;
        if (defender.beats() == this) return 0.8;
        return 1.0;
    }
}
