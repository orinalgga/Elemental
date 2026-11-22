package com.elementbrawl.game;

import java.util.Map;

/** 전장에 떨어지는 아이템. 밟으면 바로 효과가 난다. */
final class Item {
    enum Kind {
        HEAL("회복 +35", "#7dff9b"),
        MANA("마나 +60", "#7fb2ff"),
        HASTE("신속!", "#5ff0e0"),
        POWER("공격력 UP!", "#ff8a3d"),
        SHIELD("보호막!", "#e8c27a"),
        ULT("필살 게이지 +40", "#ffd84a");

        final String label, color;

        Kind(String label, String color) {
            this.label = label;
            this.color = color;
        }
    }

    final int id;
    final Kind kind;
    final double x, y, born;

    Item(int id, Kind kind, double x, double y, double born) {
        this.id = id;
        this.kind = kind;
        this.x = x;
        this.y = y;
        this.born = born;
    }

    Map<String, Object> json() {
        return Map.of("id", "i" + id, "kind", kind.name(), "x", Room.round(x), "y", Room.round(y), "color", kind.color);
    }

    void apply(Room room, Player p) {
        switch (kind) {
            case HEAL -> room.heal(p, 35);
            case MANA -> p.mp = Math.min(p.maxMp, p.mp + 60);
            case HASTE -> p.hasteUntil = room.t + 6;
            case POWER -> p.powerUntil = room.t + 8;
            case SHIELD -> p.shieldUntil = Math.max(p.shieldUntil, room.t + 4);
            case ULT -> p.ult = Math.min(100, p.ult + 40);
        }
        if (kind != Kind.HEAL) {
            room.event("float", Map.of("x", Room.round(p.x), "y", Room.round(p.y - p.r - 6),
                    "text", kind.label, "color", kind.color, "big", true));
        }
        room.event("pickup", Map.of("x", Room.round(x), "y", Room.round(y), "color", kind.color, "who", p.id));
    }
}
