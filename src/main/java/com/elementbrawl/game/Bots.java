package com.elementbrawl.game;

import java.util.Random;

/**
 * 봇 조종. 사람처럼 키 입력(상하좌우, 공격, 스킬)만 정해서 Player 에 넣는다.
 * 일부러 조준 오차와 반응 지연을 둬서 이길 만하게 만든다.
 */
final class Bots {
    private Bots() {
    }

    static final class Brain {
        final Random rnd;
        Player target;
        double retargetAt, castAt, strafeFlipAt, aimErrAt, dodgeAt;
        double strafeDir = 1, aimErr;
        boolean dodgeAware;
        final double skill;   // 0.75 ~ 1.0: 높을수록 조준이 정확하고 반응이 빠름

        Brain(Random rnd) {
            this.rnd = rnd;
            this.skill = 0.75 + rnd.nextDouble() * 0.25;
        }
    }

    /** 캐릭터별 {선호 거리, 기본 공격 사거리, 탄속(0이면 근접)} */
    private static double[] style(String ch) {
        return switch (ch) {
            case "hwarang" -> new double[]{300, 520, 520};
            case "sua" -> new double[]{260, 500, 500};
            case "punghu" -> new double[]{45, 75, 0};
            default -> new double[]{55, 85, 0};
        };
    }

    static void think(Room room, Player p, double dt) {
        Brain b = p.brain;
        double t = room.t;
        if (t >= b.retargetAt || b.target == null || !b.target.alive() || !room.players.containsKey(b.target.id)) {
            b.target = pickTarget(room, p);
            b.retargetAt = t + 0.8 + b.rnd.nextDouble() * 0.7;
        }
        if (t >= b.strafeFlipAt) {
            b.strafeDir = b.rnd.nextBoolean() ? 1 : -1;
            b.strafeFlipAt = t + 0.8 + b.rnd.nextDouble() * 1.8;
        }
        if (t >= b.aimErrAt) {
            b.aimErr = b.rnd.nextGaussian() * 0.16 * (1.25 - b.skill);
            b.aimErrAt = t + 0.3 + b.rnd.nextDouble() * 0.4;
        }
        if (t >= b.dodgeAt) {
            b.dodgeAware = b.rnd.nextDouble() < 0.45 + 0.4 * b.skill;
            b.dodgeAt = t + 0.35;
        }

        double mx = 0, my = 0;
        Player tg = b.target;
        double[] st = style(p.spec.id());
        boolean melee = st[2] == 0;
        double d = 0;
        boolean blocked = false;
        if (tg != null) {
            d = p.dist(tg);
            double ux = (tg.x - p.x) / Math.max(1, d), uy = (tg.y - p.y) / Math.max(1, d);
            blocked = Arena.blocked(p.x, p.y, tg.x, tg.y, 6);
            double pref = st[0];
            boolean lowHp = p.hp < p.maxHp * 0.3 && !melee;
            if (lowHp) pref += 120;
            if (d > pref + 40) {
                mx += ux;
                my += uy;
            } else if (d < pref - 40) {
                mx -= ux;
                my -= uy;
            }
            double strafe = melee ? 0.35 : blocked ? 1.0 : 0.75;
            mx += -uy * strafe * b.strafeDir;
            my += ux * strafe * b.strafeDir;
            if (blocked) {
                mx += ux * 0.5;
                my += uy * 0.5;
            }

            // 조준: 상대가 움직이는 방향을 조금 앞서 쏨
            double lead = melee ? 0 : Math.min(0.9, d / st[2]) * (0.5 + 0.4 * b.skill);
            double px = tg.x + tg.vx * lead, py = tg.y + tg.vy * lead;
            p.aim = Math.atan2(py - p.y, px - p.x) + b.aimErr;
            p.aimDist = Math.hypot(px - p.x, py - p.y);

            p.fire = melee ? d < st[1] + tg.r + 4 : d < st[1] && !blocked;
            if (t >= b.castAt) {
                b.castAt = t + 0.3 + b.rnd.nextDouble() * (0.9 - 0.4 * b.skill);
                castSkills(room, p, tg, d, blocked);
            }
        } else {
            p.fire = false;
            mx += (Arena.CX - p.x) / 300;
            my += (Arena.CY - p.y) / 300;
        }

        // 날아오는 탄 피하기
        if (b.dodgeAware) {
            for (Room.Projectile pr : room.projectiles) {
                if (pr.owner == p) continue;
                double rx = p.x - pr.x, ry = p.y - pr.y;
                double dist = Math.hypot(rx, ry);
                if (dist > 170) continue;
                double sp = Math.hypot(pr.vx, pr.vy);
                if (sp < 1) continue;
                double vx = pr.vx / sp, vy = pr.vy / sp;
                double along = rx * vx + ry * vy;
                if (along <= 0) continue;
                double side = rx * -vy + ry * vx;          // 탄 진행 방향 기준 옆 거리
                if (Math.abs(side) > p.r + pr.r + 12) continue;
                double s = side >= 0 ? 1 : -1;
                mx += -vy * s * 1.8;
                my += vx * s * 1.8;
            }
        }

        // 아이템 줍기
        Item best = null;
        double bestD = 1e9;
        for (Item it : room.items) {
            double di = p.dist(it.x, it.y);
            if (di < bestD) {
                bestD = di;
                best = it;
            }
        }
        if (best != null && bestD < 320) {
            boolean want = p.hp < p.maxHp * 0.6 || tg == null || bestD < d * 0.8 || bestD < 120;
            if (want) {
                double w = p.hp < p.maxHp * 0.5 ? 1.6 : 0.9;
                mx += (best.x - p.x) / bestD * w;
                my += (best.y - p.y) / bestD * w;
            }
        }

        // 안전 구역 안으로
        double zr = room.zoneRadius();
        double dc = p.dist(Arena.CX, Arena.CY);
        if (zr < Room.ZONE_R0 && dc > zr - 70) {
            mx += (Arena.CX - p.x) / Math.max(1, dc) * 2.2;
            my += (Arena.CY - p.y) / Math.max(1, dc) * 2.2;
        }

        // 바위와 벽 피해 다니기
        for (Arena.Rock k : Arena.ROCKS) {
            double rx = p.x - k.x(), ry = p.y - k.y(), dk = Math.hypot(rx, ry);
            double gap = dk - k.r() - p.r;
            if (gap < 26) {
                double w = (26 - gap) / 26 * 1.4;
                mx += rx / dk * w + -ry / dk * w * 0.6 * b.strafeDir;
                my += ry / dk * w + rx / dk * w * 0.6 * b.strafeDir;
            }
        }
        double m = 46;
        if (p.x < Arena.AX + m) mx += 1;
        if (p.x > Arena.AX + Arena.AW - m) mx -= 1;
        if (p.y < Arena.AY + m) my += 1;
        if (p.y > Arena.AY + Arena.AH - m) my -= 1;

        double len = Math.hypot(mx, my);
        if (len < 0.2) {
            p.up = p.down = p.left = p.right = false;
        } else {
            double nx = mx / len, ny = my / len;
            p.right = nx > 0.38;
            p.left = nx < -0.38;
            p.down = ny > 0.38;
            p.up = ny < -0.38;
        }
    }

    private static Player pickTarget(Room room, Player p) {
        Player best = null;
        double bestScore = 1e9;
        for (Player o : room.players.values()) {
            if (o == p || !o.alive()) continue;
            double score = p.dist(o) - (1 - o.hp / o.maxHp) * 160
                    + (Arena.blocked(p.x, p.y, o.x, o.y, 6) ? 120 : 0)
                    + p.brain.rnd.nextDouble() * 60;
            if (score < bestScore) {
                bestScore = score;
                best = o;
            }
        }
        return best;
    }

    private static boolean ready(Room room, Player p, String slot) {
        double[] cost = Skills.COST.get(p.spec.id() + "." + slot);
        double readyAt = slot.equals("q") ? p.readyQ : p.readyE;
        return cost != null && room.t >= readyAt && p.mp >= cost[1];
    }

    private static void castSkills(Room room, Player p, Player tg, double d, boolean blocked) {
        boolean ult = p.ult >= 100;
        switch (p.spec.id()) {
            case "hwarang" -> {
                if (ult && d < 360) p.casts.add("r");
                else if (ready(room, p, "e") && d < 360) p.casts.add("e");
                else if (ready(room, p, "q") && d < 380 && !blocked) p.casts.add("q");
            }
            case "sua" -> {
                if (ult && (d < 190 || p.hp < p.maxHp * 0.45)) p.casts.add("r");
                else if (ready(room, p, "q") && p.hp < p.maxHp * 0.65) p.casts.add("q");
                else if (ready(room, p, "e") && d < 340 && !blocked) p.casts.add("e");
            }
            case "punghu" -> {
                if (ult && d < 420) p.casts.add("r");
                else if (ready(room, p, "q") && d > 110 && d < 240 && !blocked) p.casts.add("q");
                else if (ready(room, p, "e") && d < 100) p.casts.add("e");
            }
            default -> {
                if (ult && d < 150) p.casts.add("r");
                else if (ready(room, p, "e") && (room.t - p.hurtAt < 0.4 || d < 130)) p.casts.add("e");
                else if (ready(room, p, "q") && d > 120 && d < 420 && !blocked) p.casts.add("q");
            }
        }
    }
}
