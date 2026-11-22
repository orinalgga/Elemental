package com.elementbrawl.game;

import com.elementbrawl.character.Element;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 게임 룸 하나. 모든 판정을 여기서 한다 (서버 권한).
 * 혼자면 허수아비 연습(practice), 2명 이상이면 마지막 생존자가 이기는 개인전(playing → ended)을 반복한다.
 * 모든 메서드는 RoomManager 가 이 객체로 동기화한 상태에서 부른다.
 */
public class Room {
    public static final int MAX_PLAYERS = 4;
    public static final double AX = 20, AY = 20, AW = 920, AH = 536;
    static final double ROUND_END_DELAY = 5;
    static final double PRACTICE_RESPAWN = 3;

    static final Map<Element, String> COLOR = Map.of(
            Element.FIRE, "#ff6b3d", Element.WATER, "#3da5ff", Element.WIND, "#5fd38d", Element.EARTH, "#c8954a");
    static final double[][] SPAWNS = {{0.12, 0.2}, {0.88, 0.8}, {0.88, 0.2}, {0.12, 0.8}};

    public final String code;
    public final Map<String, Player> players = new LinkedHashMap<>();
    final List<Dummy> dummies = new ArrayList<>();
    final List<Projectile> projectiles = new ArrayList<>();
    final List<Area> areas = new ArrayList<>();
    final List<Blink> blinks = new ArrayList<>();
    final List<Map<String, Object>> events = new ArrayList<>();
    String phase = "practice";
    String winner;
    double endsAt;
    double t;
    private int nextId;

    public Room(String code) {
        this.code = code;
    }

    // ------------------------------------------------------------ 입장과 퇴장

    public boolean isFull() {
        return players.size() >= MAX_PLAYERS;
    }

    public void join(Player p) {
        players.put(p.id, p);
        if ("playing".equals(phase) || "ended".equals(phase)) {
            // 진행 중인 판은 그대로 두고, 다음 판까지 관전
            p.reset();
            p.hp = 0;
            p.x = AX + AW / 2;
            p.y = AY + AH / 2;
            event("banner", Map.of("text", p.name + " 입장 (다음 판부터)"));
        } else if (players.size() >= 2) {
            startRound();
        } else {
            startPractice();
        }
    }

    public void leave(String id) {
        players.remove(id);
        if (players.size() < 2 && !"practice".equals(phase)) {
            startPractice();
        }
    }

    void startPractice() {
        phase = "practice";
        winner = null;
        projectiles.clear();
        areas.clear();
        blinks.clear();
        dummies.clear();
        double[][] homes = {{0.55, 0.25}, {0.82, 0.3}, {0.6, 0.72}, {0.85, 0.75}};
        Element[] els = Element.values();
        for (int i = 0; i < els.length; i++) {
            Dummy d = new Dummy("d" + i, els[i], AX + AW * homes[i][0], AY + AH * homes[i][1]);
            d.fireAt = t + 1.5 + i * 0.6;
            dummies.add(d);
        }
        int i = 0;
        for (Player p : players.values()) {
            p.reset();
            p.x = AX + 140;
            p.y = AY + AH / 2 + i++ * 40;
        }
    }

    void startRound() {
        phase = "playing";
        winner = null;
        projectiles.clear();
        areas.clear();
        blinks.clear();
        dummies.clear();
        int i = 0;
        for (Player p : players.values()) {
            p.reset();
            double[] s = SPAWNS[i++ % SPAWNS.length];
            p.x = AX + AW * s[0];
            p.y = AY + AH * s[1];
        }
        event("banner", Map.of("text", "대전 시작!"));
    }

    // ------------------------------------------------------------ 입력

    public void input(String id, Map<String, Object> msg) {
        Player p = players.get(id);
        if (p == null) return;
        p.up = Boolean.TRUE.equals(msg.get("up"));
        p.down = Boolean.TRUE.equals(msg.get("down"));
        p.left = Boolean.TRUE.equals(msg.get("left"));
        p.right = Boolean.TRUE.equals(msg.get("right"));
        p.fire = Boolean.TRUE.equals(msg.get("fire"));
        if (msg.get("aim") instanceof Number n) p.aim = n.doubleValue();
        if (msg.get("dist") instanceof Number n) p.aimDist = Math.max(0, n.doubleValue());
        if (msg.get("cast") instanceof String c && Set.of("q", "e", "r").contains(c)) p.casts.add(c);
    }

    // ------------------------------------------------------------ 시뮬레이션

    public void tick(double dt) {
        t += dt;
        for (Player p : players.values()) updatePlayer(p, dt);
        updateBlinks();
        updateDummies(dt);
        updateProjectiles(dt);
        updateAreas();
        updatePhase();
    }

    private void updatePlayer(Player p, double dt) {
        if (!p.alive()) {
            if ("practice".equals(phase) && p.respawnAt > 0 && t >= p.respawnAt) {
                p.reset();
                p.x = AX + 140;
                p.y = AY + AH / 2;
                ring(p.x, p.y, 30, COLOR.get(p.element));
            }
            p.casts.clear();
            return;
        }
        double c = Math.cos(p.aim), s = Math.sin(p.aim);
        p.facing = c >= 0 ? 1 : -1;
        p.dir = s > 0.6 ? "down" : s < -0.6 ? "up" : "side";
        p.moving = p.dash != null;

        if (p.dash != null) {
            p.x += p.dash.vx * dt;
            p.y += p.dash.vy * dt;
            for (Unit u : targetsOf(p)) {
                if (!p.dash.hit.contains(u) && p.dist(u) < p.r + u.r + 6) {
                    p.dash.hit.add(u);
                    damage(u, p.dash.dmg, p.element, p);
                }
            }
            if (t >= p.dash.until) p.dash = null;
        } else if (p.stunUntil <= t) {
            double mx = (p.right ? 1 : 0) - (p.left ? 1 : 0);
            double my = (p.down ? 1 : 0) - (p.up ? 1 : 0);
            double len = Math.hypot(mx, my);
            if (len > 0) {
                double sp = p.spec.moveSpeed() * (p.slowUntil > t ? 0.6 : 1);
                p.x += mx / len * sp * dt;
                p.y += my / len * sp * dt;
                p.moving = true;
            }
        }
        p.x = clamp(p.x, AX + p.r, AX + AW - p.r);
        p.y = clamp(p.y, AY + p.r, AY + AH - p.r);

        if (!"ended".equals(phase)) {
            if (p.fire) Skills.use(this, p, "atk");
            for (String cast : p.casts) Skills.use(this, p, cast);
        }
        p.casts.clear();
        p.mp = Math.min(p.maxMp, p.mp + (t - p.lastAttackAt > 2 ? 18 : 6) * dt);
    }

    private void updateBlinks() {
        Iterator<Blink> it = blinks.iterator();
        while (it.hasNext()) {
            Blink b = it.next();
            if (t < b.at) continue;
            it.remove();
            if (!b.owner.alive() || !b.target.alive()) continue;
            double a = Math.atan2(b.owner.y - b.target.y, b.owner.x - b.target.x);
            b.owner.x = b.target.x + Math.cos(a) * (b.target.r + b.owner.r + 4);
            b.owner.y = b.target.y + Math.sin(a) * (b.target.r + b.owner.r + 4);
            slash(b.target.x, b.target.y, 40, a + Math.PI, Math.PI * 2, COLOR.get(b.owner.element));
            damage(b.target, 20, b.owner.element, b.owner);
        }
    }

    private void updateDummies(double dt) {
        for (Dummy d : dummies) {
            if (!d.alive()) {
                if (t >= d.respawnAt) {
                    d.hp = d.maxHp;
                    d.x = d.hx;
                    d.y = d.hy;
                    d.fireAt = t + 1.5;
                    ring(d.x, d.y, 30, COLOR.get(d.element));
                }
                continue;
            }
            if (d.stunUntil > t) continue;
            d.wanderAng += (Math.random() - 0.5) * 2 * dt;
            double sp = 40 * (d.slowUntil > t ? 0.4 : 1);
            d.x += Math.cos(d.wanderAng) * sp * dt;
            d.y += Math.sin(d.wanderAng) * sp * dt;
            if (Math.abs(Math.cos(d.wanderAng)) > 0.3) d.facing = Math.cos(d.wanderAng) > 0 ? 1 : -1;
            if (Math.hypot(d.x - d.hx, d.y - d.hy) > 60) d.wanderAng = Math.atan2(d.hy - d.y, d.hx - d.x);
            if (t >= d.fireAt) {
                d.fireAt = t + 2.5 * (d.slowUntil > t ? 1.6 : 1);
                Player near = null;
                for (Player p : players.values()) {
                    if (p.alive() && d.dist(p) < 460 && (near == null || d.dist(p) < d.dist(near))) near = p;
                }
                if (near != null) {
                    shoot(d, Math.atan2(near.y - d.y, near.x - d.x), 230, 6, 8, 2.2, false, 0);
                }
            }
        }
    }

    private void updateProjectiles(double dt) {
        Iterator<Projectile> it = projectiles.iterator();
        while (it.hasNext()) {
            Projectile b = it.next();
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (t - b.born > b.life || b.x < AX || b.x > AX + AW || b.y < AY || b.y > AY + AH) {
                it.remove();
                continue;
            }
            for (Unit u : targetsOf(b.owner)) {
                if (b.hit.contains(u) || u.dist(b.x, b.y) > b.r + u.r) continue;
                damage(u, b.dmg, b.element, b.owner);
                if (b.slow > 0) u.slowUntil = t + b.slow;
                if (!b.pierce) {
                    ring(b.x, b.y, 14, COLOR.get(b.element));
                    it.remove();
                    break;
                }
                b.hit.add(u);
            }
        }
    }

    private void updateAreas() {
        Iterator<Area> it = areas.iterator();
        while (it.hasNext()) {
            Area a = it.next();
            if (a.follow && a.owner.alive()) {
                a.x = a.owner.x;
                a.y = a.owner.y;
            }
            if (t - a.born < a.delay) continue;
            it.remove();
            for (Unit u : targetsOf(a.owner)) {
                if (u.dist(a.x, a.y) <= a.r + u.r) {
                    damage(u, a.dmg, a.element, a.owner);
                    if (a.slow > 0) u.slowUntil = t + a.slow;
                    if (a.stun > 0) u.stunUntil = t + a.stun;
                }
            }
            ring(a.x, a.y, a.r, COLOR.get(a.element));
        }
    }

    private void updatePhase() {
        if ("playing".equals(phase)) {
            List<Player> alive = players.values().stream().filter(Unit::alive).toList();
            if (alive.size() <= 1) {
                phase = "ended";
                endsAt = t + ROUND_END_DELAY;
                if (alive.size() == 1) {
                    Player w = alive.get(0);
                    w.wins++;
                    winner = w.name;
                } else {
                    winner = null;
                }
                event("banner", Map.of("text", winner == null ? "무승부" : winner + " 승리!"));
            }
        } else if ("ended".equals(phase) && t >= endsAt) {
            if (players.size() >= 2) startRound(); else startPractice();
        }
    }

    // ------------------------------------------------------------ 전투 도구 (Skills 가 씀)

    /** owner 가 때릴 수 있는 것: 살아 있는 다른 플레이어와 허수아비. 허수아비가 쏜 것은 플레이어만. */
    List<Unit> targetsOf(Unit owner) {
        List<Unit> list = new ArrayList<>();
        for (Player p : players.values()) if (p != owner && p.alive()) list.add(p);
        if (owner instanceof Player) for (Dummy d : dummies) if (d.alive()) list.add(d);
        return list;
    }

    void damage(Unit target, double amount, Element element, Unit source) {
        if (!target.alive() || "ended".equals(phase)) return;
        double mult = element.multiplierAgainst(target.element);
        double dmg = amount * mult;
        if (target.shieldUntil > t) dmg *= 0.5;
        int d = (int) Math.max(1, Math.round(dmg));
        target.hp = Math.max(0, target.hp - d);
        target.hurtAt = t;
        if (source instanceof Player sp) sp.ult = Math.min(100, sp.ult + d * 0.8);
        if (target instanceof Player tp) tp.ult = Math.min(100, tp.ult + d * 1.2);
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("x", round(target.x));
        e.put("y", round(target.y - target.r - 6));
        e.put("text", mult > 1 ? d + " 상성!" : String.valueOf(d));
        e.put("color", mult > 1 ? "#ffd84a" : mult < 1 ? "#8a8fa3" : "#ffffff");
        e.put("big", mult > 1);
        event("float", e);
        if (!target.alive()) {
            ring(target.x, target.y, 40, COLOR.get(target.element));
            if (source instanceof Player sp) sp.kills++;
            if (target instanceof Dummy dm) dm.respawnAt = t + 3;
            if (target instanceof Player tp) {
                tp.dash = null;
                if ("practice".equals(phase)) tp.respawnAt = t + PRACTICE_RESPAWN;
                event("banner", Map.of("text", tp.name + " 쓰러짐"));
            }
        }
    }

    void heal(Player p, double amount) {
        double before = p.hp;
        p.hp = Math.min(p.maxHp, p.hp + amount);
        event("float", Map.of("x", round(p.x), "y", round(p.y - p.r - 6),
                "text", "+" + Math.round(p.hp - before), "color", "#7dff9b", "big", false));
        ring(p.x, p.y, 36, "#7dff9b");
    }

    void shoot(Unit from, double ang, double speed, double dmg, double r, double life, boolean pierce, double slow) {
        Projectile b = new Projectile();
        b.id = ++nextId;
        b.owner = from;
        b.element = from.element;
        b.x = from.x + Math.cos(ang) * (from.r + 4);
        b.y = from.y + Math.sin(ang) * (from.r + 4);
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.dmg = dmg;
        b.r = r;
        b.life = life;
        b.pierce = pierce;
        b.slow = slow;
        b.born = t;
        projectiles.add(b);
    }

    Area area(Player owner, double x, double y, double r, double delay, double dmg) {
        Area a = new Area();
        a.id = ++nextId;
        a.owner = owner;
        a.element = owner.element;
        a.x = x;
        a.y = y;
        a.r = r;
        a.delay = delay;
        a.dmg = dmg;
        a.born = t;
        areas.add(a);
        return a;
    }

    void melee(Player p, double range, double arc, double dmg) {
        for (Unit u : targetsOf(p)) {
            double a = Math.atan2(u.y - p.y, u.x - p.x);
            double diff = Math.abs(Math.atan2(Math.sin(p.aim - a), Math.cos(p.aim - a)));
            if (p.dist(u) <= range + u.r && diff <= arc / 2) damage(u, dmg, p.element, p);
        }
        slash(p.x, p.y, range, p.aim, arc, COLOR.get(p.element));
    }

    void ring(double x, double y, double r, String color) {
        event("ring", Map.of("x", round(x), "y", round(y), "r", r, "color", color));
    }

    void slash(double x, double y, double r, double ang, double arc, String color) {
        event("slash", Map.of("x", round(x), "y", round(y), "r", r, "ang", ang, "arc", arc, "color", color));
    }

    void event(String kind, Map<String, Object> data) {
        Map<String, Object> e = new LinkedHashMap<>(data);
        e.put("k", kind);
        events.add(e);
    }

    // ------------------------------------------------------------ 상태 보내기

    /** 이번 틱의 상태. 보낸 뒤 이벤트는 비운다. */
    public Map<String, Object> snapshot() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("type", "state");
        s.put("t", round(t));
        s.put("room", code);
        s.put("phase", phase);
        s.put("winner", winner);
        s.put("endsIn", "ended".equals(phase) ? Math.max(0, Math.ceil(endsAt - t)) : 0);
        List<Map<String, Object>> ps = new ArrayList<>();
        for (Player p : players.values()) {
            Map<String, Object> m = unit(p);
            m.put("name", p.name);
            m.put("ch", p.spec.id());
            m.put("mp", round(p.mp));
            m.put("maxMp", p.maxMp);
            m.put("ult", round(p.ult));
            m.put("aim", round(p.aim));
            m.put("dir", p.dir);
            m.put("moving", p.moving);
            m.put("kills", p.kills);
            m.put("wins", p.wins);
            m.put("respawnIn", p.respawnAt > 0 ? round(Math.max(0, p.respawnAt - t)) : 0);
            m.put("readyAtk", round(Math.max(0, p.readyAtk - t)));
            m.put("readyQ", round(Math.max(0, p.readyQ - t)));
            m.put("readyE", round(Math.max(0, p.readyE - t)));
            ps.add(m);
        }
        s.put("players", ps);
        s.put("dummies", dummies.stream().filter(Unit::alive).map(this::unit).toList());
        s.put("projectiles", projectiles.stream().map(b -> Map.of(
                "id", b.id, "x", round(b.x), "y", round(b.y), "r", b.r,
                "color", COLOR.get(b.element), "enemy", !(b.owner instanceof Player))).toList());
        s.put("areas", areas.stream().map(a -> Map.of(
                "id", a.id, "x", round(a.x), "y", round(a.y), "r", a.r,
                "k", a.delay > 0 ? round(Math.min(1, (t - a.born) / a.delay)) : 1, "color", COLOR.get(a.element))).toList());
        s.put("events", new ArrayList<>(events));
        events.clear();
        return s;
    }

    private Map<String, Object> unit(Unit u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.id);
        m.put("el", u.element.name());
        m.put("x", round(u.x));
        m.put("y", round(u.y));
        m.put("r", u.r);
        m.put("hp", Math.ceil(u.hp));
        m.put("maxHp", u.maxHp);
        m.put("facing", u.facing);
        m.put("hurt", t - u.hurtAt < 0.25);
        m.put("shield", u.shieldUntil > t);
        m.put("slow", u.slowUntil > t);
        m.put("stun", u.stunUntil > t);
        return m;
    }

    static double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    // ------------------------------------------------------------ 작은 자료형

    static final class Projectile {
        int id;
        Unit owner;
        Element element;
        double x, y, vx, vy, r, dmg, life, born, slow;
        boolean pierce;
        final Set<Unit> hit = new HashSet<>();
    }

    static final class Area {
        int id;
        Player owner;
        Element element;
        double x, y, r, delay, dmg, born, slow, stun;
        boolean follow;
    }

    record Blink(double at, Player owner, Unit target) {
    }
}
