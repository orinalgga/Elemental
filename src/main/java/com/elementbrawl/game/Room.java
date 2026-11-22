package com.elementbrawl.game;

import com.elementbrawl.character.CharacterController;
import com.elementbrawl.character.CharacterSpec;
import com.elementbrawl.character.Element;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * 게임 룸 하나. 모든 판정을 여기서 한다 (서버 권한).
 * 사람이 적으면 봇으로 3명을 채우고, 마지막 생존자가 이기는 개인전(playing → ended)을 반복한다.
 * 40초가 지나면 안전 구역이 줄어들기 시작한다.
 * 모든 메서드는 RoomManager 가 이 객체로 동기화한 상태에서 부른다.
 */
public class Room {
    public static final int MAX_PLAYERS = 4;
    public static final double AX = Arena.AX, AY = Arena.AY, AW = Arena.AW, AH = Arena.AH;
    static final int MIN_FIGHTERS = 3;
    static final double ROUND_END_DELAY = 5;
    static final double ZONE_START = 40, ZONE_TIME = 40, ZONE_R0 = 560, ZONE_R1 = 110, ZONE_DPS = 12;
    static final double ITEM_FIRST = 3, ITEM_EVERY = 7;
    static final int ITEM_MAX = 3;

    static final Map<Element, String> COLOR = Map.of(
            Element.FIRE, "#ff6b3d", Element.WATER, "#3da5ff", Element.WIND, "#5fd38d", Element.EARTH, "#c8954a");
    static final String[] BOT_NAMES = {"봇 불씨", "봇 이슬", "봇 돌풍", "봇 자갈", "봇 번개", "봇 단비", "봇 모래", "봇 노을"};

    public final String code;
    public final Map<String, Player> players = new LinkedHashMap<>();
    final List<Projectile> projectiles = new ArrayList<>();
    final List<Area> areas = new ArrayList<>();
    final List<Blink> blinks = new ArrayList<>();
    final List<Item> items = new ArrayList<>();
    final List<Map<String, Object>> events = new ArrayList<>();
    /** 사람 2명 이상이 함께한 판의 결과. RoomManager 가 가져가서 전적에 기록한다. */
    final List<Result> results = new ArrayList<>();
    final Random rnd;
    String phase = "waiting";
    String winner;
    String winnerId;
    double endsAt, roundStart, nextItemAt;
    double t;
    boolean zoneWarned;
    boolean ranked;
    private int nextId, botSeq;

    public Room(String code) {
        this(code, new Random());
    }

    Room(String code, Random rnd) {
        this.code = code;
        this.rnd = rnd;
    }

    // ------------------------------------------------------------ 입장과 퇴장

    public long humans() {
        return players.values().stream().filter(p -> !p.bot()).count();
    }

    public boolean isFull() {
        return humans() >= MAX_PLAYERS;
    }

    public void join(Player p) {
        long before = humans();
        players.put(p.id, p);
        if ("waiting".equals(phase) || before <= 1 && "playing".equals(phase)) {
            // 첫 입장이거나, 봇하고만 싸우던 판이면 바로 새 판
            if (before == 1) event("banner", Map.of("text", "새 도전자 " + p.name + " 입장!"));
            startRound();
        } else {
            // 사람끼리 싸우는 판은 그대로 두고 다음 판까지 관전
            p.reset();
            p.hp = 0;
            p.x = Arena.CX;
            p.y = Arena.CY;
            event("banner", Map.of("text", p.name + " 입장 (다음 판부터)"));
        }
    }

    public void leave(String id) {
        Player p = players.remove(id);
        if (p != null && humans() > 0) event("banner", Map.of("text", p.name + " 나감"));
    }

    /** 사람 수에 맞춰 봇을 넣고 뺀다. 판이 시작할 때만 부른다. */
    void fillBots() {
        long humans = humans();
        long want = humans == 0 ? 0 : Math.min(MAX_PLAYERS, Math.max(MIN_FIGHTERS, humans)) - humans;
        List<Player> bots = players.values().stream().filter(Player::bot).toList();
        for (int i = (int) want; i < bots.size(); i++) players.remove(bots.get(i).id);
        Set<String> used = new HashSet<>();
        Set<String> names = new HashSet<>();
        for (Player p : players.values()) {
            used.add(p.spec.id());
            names.add(p.name);
        }
        for (long n = players.values().stream().filter(Player::bot).count(); n < want; n++) {
            List<CharacterSpec> pool = new ArrayList<>(CharacterController.CHARACTERS.stream()
                    .filter(c -> !used.contains(c.id())).toList());
            if (pool.isEmpty()) pool = new ArrayList<>(CharacterController.CHARACTERS);
            CharacterSpec spec = pool.get(rnd.nextInt(pool.size()));
            used.add(spec.id());
            String name;
            do {
                name = BOT_NAMES[rnd.nextInt(BOT_NAMES.length)];
            } while (names.contains(name));
            names.add(name);
            Player bot = new Player("bot" + (++botSeq), name, spec);
            bot.brain = new Bots.Brain(rnd);
            players.put(bot.id, bot);
        }
    }

    void startRound() {
        fillBots();
        phase = "playing";
        winner = null;
        winnerId = null;
        roundStart = t;
        nextItemAt = t + ITEM_FIRST;
        zoneWarned = false;
        projectiles.clear();
        areas.clear();
        blinks.clear();
        items.clear();
        ranked = humans() >= 2;
        List<Player> order = new ArrayList<>(players.values());
        Collections.shuffle(order, rnd);
        int i = 0;
        for (Player p : order) {
            p.reset();
            double[] s = Arena.SPAWNS[i++ % Arena.SPAWNS.length];
            p.x = AX + AW * s[0];
            p.y = AY + AH * s[1];
            p.aim = Math.atan2(Arena.CY - p.y, Arena.CX - p.x);
            p.inRound = true;
        }
        event("banner", Map.of("text", "대전 시작!"));
        event("sfx", Map.of("s", "start"));
    }

    // ------------------------------------------------------------ 입력

    public void input(String id, Map<String, Object> msg) {
        Player p = players.get(id);
        if (p == null || p.bot()) return;
        p.up = Boolean.TRUE.equals(msg.get("up"));
        p.down = Boolean.TRUE.equals(msg.get("down"));
        p.left = Boolean.TRUE.equals(msg.get("left"));
        p.right = Boolean.TRUE.equals(msg.get("right"));
        p.fire = Boolean.TRUE.equals(msg.get("fire"));
        if (msg.get("aim") instanceof Number n && Double.isFinite(n.doubleValue())) p.aim = n.doubleValue();
        if (msg.get("dist") instanceof Number n && Double.isFinite(n.doubleValue())) p.aimDist = Math.max(0, n.doubleValue());
        if (msg.get("cast") instanceof String c && Set.of("q", "e", "r").contains(c)) p.casts.add(c);
    }

    // ------------------------------------------------------------ 시뮬레이션

    public void tick(double dt) {
        t += dt;
        if ("playing".equals(phase)) {
            for (Player p : players.values()) if (p.bot() && p.alive()) Bots.think(this, p, dt);
        }
        for (Player p : players.values()) updatePlayer(p, dt);
        updateBlinks();
        updateProjectiles(dt);
        updateAreas();
        if ("playing".equals(phase)) {
            updateItems();
            updateZone(dt);
        }
        updatePhase();
    }

    private void updatePlayer(Player p, double dt) {
        p.vx = p.vy = 0;
        if (!p.alive()) {
            p.casts.clear();
            return;
        }
        double ox = p.x, oy = p.y;
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
                double sp = p.spec.moveSpeed() * (p.slowUntil > t ? 0.6 : 1) * (p.hasteUntil > t ? 1.35 : 1);
                p.x += mx / len * sp * dt;
                p.y += my / len * sp * dt;
                p.moving = true;
            }
        }
        Arena.pushOut(p);
        if (dt > 0) {
            p.vx = (p.x - ox) / dt;
            p.vy = (p.y - oy) / dt;
        }

        if ("playing".equals(phase)) {
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
            Arena.pushOut(b.owner);
            slash(b.target.x, b.target.y, 40, a + Math.PI, Math.PI * 2, COLOR.get(b.owner.element));
            damage(b.target, 20, b.owner.element, b.owner);
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
            if (Arena.insideRock(b.x, b.y, b.r * 0.5)) {
                ring(b.x, b.y, 14, COLOR.get(b.element));
                event("rock", Map.of("x", round(b.x), "y", round(b.y)));
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
            event("boom", Map.of("x", round(a.x), "y", round(a.y), "r", a.r, "color", COLOR.get(a.element)));
        }
    }

    private void updateItems() {
        for (Iterator<Item> it = items.iterator(); it.hasNext(); ) {
            Item item = it.next();
            for (Player p : players.values()) {
                if (p.alive() && p.dist(item.x, item.y) < p.r + 16) {
                    item.apply(this, p);
                    it.remove();
                    break;
                }
            }
        }
        if (t >= nextItemAt) {
            nextItemAt = t + ITEM_EVERY;
            if (items.size() < ITEM_MAX) spawnItem();
        }
    }

    void spawnItem() {
        double zr = zoneRadius();
        for (int tries = 0; tries < 40; tries++) {
            double x = AX + 50 + rnd.nextDouble() * (AW - 100);
            double y = AY + 50 + rnd.nextDouble() * (AH - 100);
            if (Arena.insideRock(x, y, 30)) continue;
            if (Math.hypot(x - Arena.CX, y - Arena.CY) > zr - 40) continue;
            boolean near = false;
            for (Player p : players.values()) if (p.alive() && p.dist(x, y) < 90) near = true;
            for (Item o : items) if (Math.hypot(o.x - x, o.y - y) < 120) near = true;
            if (near) continue;
            Item.Kind[] kinds = Item.Kind.values();
            // 회복이 조금 더 자주 나옴
            Item.Kind kind = rnd.nextDouble() < 0.25 ? Item.Kind.HEAL : kinds[rnd.nextInt(kinds.length)];
            items.add(new Item(++nextId, kind, x, y, t));
            ring(x, y, 24, kind.color);
            return;
        }
    }

    double zoneRadius() {
        if (!"playing".equals(phase) && !"ended".equals(phase)) return ZONE_R0;
        double k = (t - roundStart - ZONE_START) / ZONE_TIME;
        if (k <= 0) return ZONE_R0;
        return ZONE_R0 + (ZONE_R1 - ZONE_R0) * Math.min(1, k);
    }

    private void updateZone(double dt) {
        double r = zoneRadius();
        if (r >= ZONE_R0) {
            if (!zoneWarned && t - roundStart > ZONE_START - 5) {
                zoneWarned = true;
                event("banner", Map.of("text", "5초 뒤 안전 구역이 좁아져요!"));
            }
            return;
        }
        for (Player p : players.values()) {
            if (!p.alive() || p.dist(Arena.CX, Arena.CY) <= r) continue;
            p.zoneAcc += ZONE_DPS * dt;
            if (p.zoneAcc >= 3) {
                int d = (int) p.zoneAcc;
                p.zoneAcc -= d;
                p.hp = Math.max(0, p.hp - d);
                p.hurtAt = t;
                event("float", Map.of("x", round(p.x), "y", round(p.y - p.r - 6), "text", String.valueOf(d),
                        "color", "#c06bff", "big", false, "to", p.id, "dmg", d));
                if (!p.alive()) died(p, null);
            }
        }
    }

    private void updatePhase() {
        if ("playing".equals(phase)) {
            List<Player> alive = players.values().stream().filter(Unit::alive).toList();
            boolean humanAlive = alive.stream().anyMatch(p -> !p.bot());
            if (alive.size() <= 1 || !humanAlive) {
                Player w = alive.stream().max(Comparator.comparingDouble(p -> p.hp)).orElse(null);
                endRound(w);
            }
        } else if ("ended".equals(phase) && t >= endsAt) {
            if (humans() > 0) startRound(); else phase = "waiting";
        }
    }

    private void endRound(Player w) {
        phase = "ended";
        endsAt = t + ROUND_END_DELAY;
        projectiles.clear();
        areas.clear();
        blinks.clear();
        if (w != null) {
            w.wins++;
            winner = w.name;
            winnerId = w.id;
        } else {
            winner = null;
        }
        event("banner", Map.of("text", winner == null ? "무승부" : winner + " 승리!"));
        event("sfx", Map.of("s", "end"));
        if (ranked) {
            for (Player p : players.values()) {
                if (p.bot() || !p.inRound || p.accountId == null) continue;
                results.add(new Result(p.accountId, p == w, p.roundKills, !p.alive()));
            }
        }
        for (Player p : players.values()) p.inRound = false;
    }

    // ------------------------------------------------------------ 전투 도구 (Skills 가 씀)

    /** owner 가 때릴 수 있는 것: 살아 있는 다른 플레이어. */
    List<Unit> targetsOf(Unit owner) {
        List<Unit> list = new ArrayList<>();
        for (Player p : players.values()) if (p != owner && p.alive()) list.add(p);
        return list;
    }

    void damage(Unit target, double amount, Element element, Unit source) {
        if (!target.alive() || !"playing".equals(phase)) return;
        double mult = element.multiplierAgainst(target.element);
        double dmg = amount * mult;
        if (source instanceof Player sp && sp.powerUntil > t) dmg *= 1.3;
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
        e.put("to", target.id);
        e.put("from", source == null ? "" : source.id);
        e.put("dmg", d);
        event("float", e);
        if (!target.alive() && target instanceof Player tp) died(tp, source instanceof Player sp ? sp : null);
    }

    private void died(Player tp, Player killer) {
        ring(tp.x, tp.y, 40, COLOR.get(tp.element));
        tp.dash = null;
        if (killer != null) {
            killer.kills++;
            killer.roundKills++;
        }
        Map<String, Object> k = new LinkedHashMap<>();
        k.put("x", round(tp.x));
        k.put("y", round(tp.y));
        k.put("id", tp.id);
        k.put("victim", tp.name);
        k.put("vColor", COLOR.get(tp.element));
        k.put("killerId", killer == null ? "" : killer.id);
        k.put("killer", killer == null ? "안전 구역" : killer.name);
        k.put("kColor", killer == null ? "#c06bff" : COLOR.get(killer.element));
        event("kill", k);
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
        event("sfx", Map.of("s", "shot", "who", from.id));
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
        event("sfx", Map.of("s", "swing", "who", p.id));
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
        s.put("winnerId", winnerId);
        s.put("endsIn", "ended".equals(phase) ? Math.max(0, Math.ceil(endsAt - t)) : 0);
        s.put("roundTime", "playing".equals(phase) ? round(t - roundStart) : 0);
        s.put("ranked", ranked);
        double zr = zoneRadius();
        s.put("zone", zr < ZONE_R0 ? Map.of("x", Arena.CX, "y", Arena.CY, "r", round(zr)) : null);
        s.put("zoneIn", "playing".equals(phase) ? round(Math.max(0, ZONE_START - (t - roundStart))) : 0);
        List<Map<String, Object>> ps = new ArrayList<>();
        for (Player p : players.values()) {
            Map<String, Object> m = unit(p);
            m.put("name", p.name);
            m.put("ch", p.spec.id());
            m.put("bot", p.bot());
            m.put("acct", p.accountId != null);
            m.put("mp", round(p.mp));
            m.put("maxMp", p.maxMp);
            m.put("ult", round(p.ult));
            m.put("aim", round(p.aim));
            m.put("dir", p.dir);
            m.put("moving", p.moving);
            m.put("kills", p.kills);
            m.put("wins", p.wins);
            m.put("haste", round(Math.max(0, p.hasteUntil - t)));
            m.put("power", round(Math.max(0, p.powerUntil - t)));
            m.put("readyAtk", round(Math.max(0, p.readyAtk - t)));
            m.put("readyQ", round(Math.max(0, p.readyQ - t)));
            m.put("readyE", round(Math.max(0, p.readyE - t)));
            ps.add(m);
        }
        s.put("players", ps);
        s.put("items", items.stream().map(Item::json).toList());
        s.put("projectiles", projectiles.stream().map(b -> Map.of(
                "id", b.id, "x", round(b.x), "y", round(b.y), "r", b.r, "vx", round(b.vx), "vy", round(b.vy),
                "color", COLOR.get(b.element), "owner", b.owner.id)).toList());
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

    /** 한 판의 개인 결과 (로그인한 사람만). */
    public record Result(long accountId, boolean win, int kills, boolean died) {
    }
}
