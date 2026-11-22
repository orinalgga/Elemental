package com.elementbrawl.game;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 캐릭터별 기술. atk = 기본 공격, q / e = 스킬(재사용 대기 + 마나), r = 필살기(게이지 100).
 * 수치는 기획서의 임시값이고 테스트하며 조절한다.
 */
final class Skills {
    private Skills() {
    }

    /** {재사용 대기(초), 마나} */
    static final Map<String, double[]> COST = Map.ofEntries(
            Map.entry("hwarang.atk", new double[]{0.35, 0}), Map.entry("hwarang.q", new double[]{4, 20}), Map.entry("hwarang.e", new double[]{6, 30}),
            Map.entry("sua.atk", new double[]{0.35, 0}), Map.entry("sua.q", new double[]{7, 25}), Map.entry("sua.e", new double[]{5, 25}),
            Map.entry("punghu.atk", new double[]{0.3, 0}), Map.entry("punghu.q", new double[]{4, 20}), Map.entry("punghu.e", new double[]{6, 30}),
            Map.entry("gangdol.atk", new double[]{0.5, 0}), Map.entry("gangdol.q", new double[]{4, 20}), Map.entry("gangdol.e", new double[]{9, 25})
    );

    static void use(Room room, Player p, String slot) {
        if (!p.alive() || p.stunUntil > room.t) return;
        String ch = p.spec.id();
        if (slot.equals("r")) {
            if (p.ult < 100) return;
            p.ult = 0;
        } else {
            double[] cost = COST.get(ch + "." + slot);
            if (cost == null) return;
            double ready = switch (slot) {
                case "atk" -> p.readyAtk;
                case "q" -> p.readyQ;
                default -> p.readyE;
            };
            if (room.t < ready) return;
            if (p.mp < cost[1]) {
                if (!slot.equals("atk")) {
                    room.event("float", Map.of("x", Room.round(p.x), "y", Room.round(p.y - p.r - 6),
                            "text", "마나 부족", "color", "#8fb7ff", "big", false, "only", p.id));
                }
                setReady(p, slot, room.t + 0.4);
                return;
            }
            p.mp -= cost[1];
            setReady(p, slot, room.t + cost[0]);
        }
        p.lastAttackAt = room.t;
        cast(room, p, ch + "." + slot);
    }

    private static void setReady(Player p, String slot, double at) {
        switch (slot) {
            case "atk" -> p.readyAtk = at;
            case "q" -> p.readyQ = at;
            default -> p.readyE = at;
        }
    }

    private static void cast(Room room, Player p, String key) {
        double a = p.aim;
        switch (key) {
            // 화랑 (불): 원거리 폭발형
            case "hwarang.atk" -> room.shoot(p, a, 520, 8, 7, 1.6, false, 0);
            case "hwarang.q" -> {
                for (double o : new double[]{-0.25, 0, 0.25}) room.shoot(p, a + o, 480, 9, 7, 1.6, false, 0);
            }
            case "hwarang.e" -> {
                double[] pt = aimPoint(p, 360);
                room.area(p, pt[0], pt[1], 60, 0.5, 18);
            }
            case "hwarang.r" -> {
                double[] pt = aimPoint(p, 380);
                room.area(p, pt[0], pt[1], 140, 0.6, 40);
            }
            // 수아 (물): 회복과 방해
            case "sua.atk" -> room.shoot(p, a, 500, 7, 7, 1.6, false, 0);
            case "sua.q" -> room.heal(p, 22);
            case "sua.e" -> room.shoot(p, a, 380, 10, 22, 1.3, true, 2);
            case "sua.r" -> {
                room.heal(p, 40);
                room.area(p, p.x, p.y, 200, 0.2, 20).slow = 3;
            }
            // 풍후 (바람): 빠른 근접형
            case "punghu.atk" -> room.melee(p, 75, 1.4, 9);
            case "punghu.q" -> {
                Player.Dash d = new Player.Dash();
                d.vx = Math.cos(a) * 1150;
                d.vy = Math.sin(a) * 1150;
                d.until = room.t + 0.15;
                d.dmg = 12;
                p.dash = d;
            }
            case "punghu.e" -> room.area(p, p.x, p.y, 95, 0, 14).follow = true;
            case "punghu.r" -> {
                List<Unit> targets = room.targetsOf(p).stream().filter(u -> p.dist(u) < 480)
                        .sorted(Comparator.comparingDouble(p::dist)).limit(3).toList();
                for (int i = 0; i < targets.size(); i++) {
                    room.blinks.add(new Room.Blink(room.t + i * 0.18, p, targets.get(i)));
                }
            }
            // 강돌 (땅): 탱커
            case "gangdol.atk" -> room.melee(p, 85, 1.6, 12);
            case "gangdol.q" -> room.shoot(p, a, 420, 15, 12, 1.6, false, 0);
            case "gangdol.e" -> {
                p.shieldUntil = room.t + 3;
                room.ring(p.x, p.y, 34, Room.COLOR.get(p.element));
            }
            case "gangdol.r" -> {
                Room.Area area = room.area(p, p.x, p.y, 160, 0.35, 30);
                area.stun = 1.5;
                area.follow = true;
            }
            default -> {
            }
        }
    }

    private static double[] aimPoint(Player p, double maxRange) {
        double d = Math.min(maxRange, p.aimDist);
        return new double[]{
                Room.clamp(p.x + Math.cos(p.aim) * d, Room.AX, Room.AX + Room.AW),
                Room.clamp(p.y + Math.sin(p.aim) * d, Room.AY, Room.AY + Room.AH)
        };
    }
}
