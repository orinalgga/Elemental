package com.elementbrawl.game;

import java.util.List;
import java.util.Map;

/** 경기장 모양. 바위 기둥은 캐릭터와 투사체를 막는다 (범위 공격은 통과). */
final class Arena {
    private Arena() {
    }

    static final double AX = 20, AY = 20, AW = 920, AH = 536;
    static final double CX = AX + AW / 2, CY = AY + AH / 2;

    record Rock(double x, double y, double r) {
        Map<String, Object> json() {
            return Map.of("x", x, "y", y, "r", r);
        }
    }

    static final List<Rock> ROCKS = List.of(
            new Rock(CX, CY, 44),
            new Rock(CX - 190, CY - 120, 28), new Rock(CX + 190, CY - 120, 28),
            new Rock(CX - 190, CY + 120, 28), new Rock(CX + 190, CY + 120, 28),
            new Rock(CX - 330, CY, 24), new Rock(CX + 330, CY, 24),
            new Rock(CX, CY - 200, 20), new Rock(CX, CY + 200, 20)
    );

    static final double[][] SPAWNS = {{0.1, 0.16}, {0.9, 0.84}, {0.9, 0.16}, {0.1, 0.84}};

    static List<Map<String, Object>> json() {
        return ROCKS.stream().map(Rock::json).toList();
    }

    /** 원 (x, y, r) 이 바위나 벽에 겹치면 밖으로 밀어낸다. */
    static void pushOut(Unit u) {
        for (Rock k : ROCKS) {
            double dx = u.x - k.x, dy = u.y - k.y, d = Math.hypot(dx, dy), min = k.r + u.r;
            if (d < min) {
                if (d < 0.001) {
                    dx = 1;
                    dy = 0;
                    d = 1;
                }
                u.x = k.x + dx / d * min;
                u.y = k.y + dy / d * min;
            }
        }
        u.x = Room.clamp(u.x, AX + u.r, AX + AW - u.r);
        u.y = Room.clamp(u.y, AY + u.r, AY + AH - u.r);
    }

    static boolean insideRock(double x, double y, double pad) {
        for (Rock k : ROCKS) if (Math.hypot(x - k.x, y - k.y) < k.r + pad) return true;
        return false;
    }

    /** 두 점 사이를 바위가 가리는지. */
    static boolean blocked(double x1, double y1, double x2, double y2, double pad) {
        double dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
        for (Rock k : ROCKS) {
            double tt = len2 == 0 ? 0 : Math.max(0, Math.min(1, ((k.x - x1) * dx + (k.y - y1) * dy) / len2));
            double px = x1 + dx * tt, py = y1 + dy * tt;
            if (Math.hypot(px - k.x, py - k.y) < k.r + pad) return true;
        }
        return false;
    }
}
