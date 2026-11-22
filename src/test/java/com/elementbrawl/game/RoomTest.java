package com.elementbrawl.game;

import com.elementbrawl.character.CharacterController;
import com.elementbrawl.character.Element;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.*;

class RoomTest {
    private static Player player(String id, String character) {
        return new Player(id, id, CharacterController.find(character));
    }

    private static Room room() {
        return new Room("T", new Random(7));
    }

    private static long bots(Room room) {
        return room.players.values().stream().filter(Player::bot).count();
    }

    @Test
    void soloPlayerGetsTwoBotsAndRoundStarts() {
        Room room = room();
        room.join(player("a", "hwarang"));
        assertEquals("playing", room.phase);
        assertEquals(3, room.players.size());
        assertEquals(2, bots(room));
        assertFalse(room.ranked, "봇전은 전적에 안 들어감");
    }

    @Test
    void secondHumanRestartsBotRoundAndIsRanked() {
        Room room = room();
        room.join(player("a", "hwarang"));
        room.join(player("b", "sua"));
        assertEquals("playing", room.phase);
        assertEquals(1, bots(room));
        assertTrue(room.players.get("b").alive());
        assertTrue(room.ranked);
    }

    @Test
    void lateJoinerSpectatesHumanRound() {
        Room room = room();
        Player a = player("a", "hwarang");
        room.join(a);
        room.join(player("b", "sua"));
        a.hp = 10;
        Player c = player("c", "gangdol");
        room.join(c);
        assertEquals(10, a.hp, 0.001, "사람끼리 하던 판이 초기화되면 안 됨");
        assertFalse(c.alive());
    }

    @Test
    void lastSurvivorWinsAndResultsAreRecorded() {
        Room room = room();
        Player a = player("a", "hwarang");
        Player b = player("b", "sua");
        a.accountId = 1L;
        b.accountId = 2L;
        room.join(a);
        room.join(b);
        for (Player p : room.players.values()) if (p.bot()) p.hp = 0;

        room.damage(b, 10_000, Element.FIRE, a);
        room.tick(0.05);
        assertEquals("ended", room.phase);
        assertEquals("a", room.winner);
        assertEquals(1, a.wins);
        assertEquals(2, room.results.size());
        Room.Result ra = room.results.stream().filter(r -> r.accountId() == 1L).findFirst().orElseThrow();
        assertTrue(ra.win());
        assertEquals(1, ra.kills());

        for (int i = 0; i < 120; i++) room.tick(0.05);
        assertEquals("playing", room.phase);
        assertTrue(b.alive());
    }

    @Test
    void roundEndsWhenNoHumanIsLeft() {
        Room room = room();
        Player a = player("a", "punghu");
        room.join(a);
        room.damage(a, 10_000, Element.FIRE, null);
        room.tick(0.05);
        assertEquals("ended", room.phase);
        assertNotNull(room.winnerId);
        assertNotEquals("a", room.winnerId);
    }

    @Test
    void affinityAndPowerChangeDamage() {
        Room room = room();
        Player fire = player("f", "hwarang");
        Player water = player("w", "sua");
        room.join(fire);
        room.join(water);
        double before = fire.hp;
        room.damage(fire, 10, Element.WATER, water);
        assertEquals(12, before - fire.hp, 0.001);
        water.powerUntil = room.t + 5;
        before = fire.hp;
        room.damage(fire, 10, Element.WATER, water);
        assertEquals(16, before - fire.hp, 0.001);
    }

    @Test
    void rocksBlockProjectilesAndPlayers() {
        Room room = room();
        Player a = player("a", "hwarang");
        room.join(a);
        Arena.Rock center = Arena.ROCKS.get(0);
        a.x = center.x();
        a.y = center.y() + 1;
        Arena.pushOut(a);
        assertTrue(a.dist(center.x(), center.y()) >= center.r() + a.r - 0.01);

        room.projectiles.clear();
        room.shoot(a, Math.atan2(center.y() - a.y, center.x() - a.x), 500, 10, 7, 2, false, 0);
        for (int i = 0; i < 10; i++) room.tick(0.05);
        assertTrue(room.projectiles.stream().noneMatch(p -> p.owner == a));
    }

    @Test
    void itemsSpawnAndApply() {
        Room room = room();
        Player a = player("a", "sua");
        room.join(a);
        room.spawnItem();
        assertEquals(1, room.items.size());
        Item item = room.items.get(0);
        a.hp = 10;
        a.x = item.x;
        a.y = item.y;
        room.tick(0.05);
        assertTrue(room.items.stream().noneMatch(i -> i == item));
    }

    @Test
    void zoneShrinksAndHurts() {
        Room room = room();
        Player a = player("a", "gangdol");
        room.join(a);
        for (Player p : room.players.values()) if (p.bot()) p.brain = null;  // 봇은 가만히
        room.t = room.roundStart + Room.ZONE_START + Room.ZONE_TIME;
        assertEquals(Room.ZONE_R1, room.zoneRadius(), 0.01);
        a.x = Arena.AX + 30;
        a.y = Arena.AY + 30;
        double before = a.hp;
        room.tick(0.5);
        assertTrue(a.hp < before);
    }

    @Test
    void botsFightEachOtherWithoutCrashing() {
        Room room = room();
        Player a = player("a", "gangdol");
        room.join(a);
        a.hp = a.maxHp = 100_000;   // 사람은 버티고 봇끼리 싸우게
        boolean botDown = false;
        for (int i = 0; i < 20 * 120 && !botDown; i++) {
            room.tick(0.05);
            room.snapshot();
            for (Player p : room.players.values()) {
                assertFalse(Arena.insideRock(p.x, p.y, p.r - 1), p.name + " 바위 안에 있음");
            }
            botDown = room.players.values().stream().anyMatch(p -> p.bot() && !p.alive());
        }
        assertTrue(botDown, "2분 안에 봇 하나는 쓰러져야 함");
        assertTrue(a.hp < a.maxHp, "봇이 사람도 공격함");
    }

    @Test
    void roomFullAtFourHumans() {
        Room room = room();
        for (String c : new String[]{"hwarang", "sua", "punghu", "gangdol"}) room.join(player(c, c));
        assertTrue(room.isFull());
        for (Player p : room.players.values()) if (!p.id.equals("hwarang")) p.hp = 0;
        for (int i = 0; i < 120; i++) room.tick(0.05);
        assertEquals("playing", room.phase);
        assertEquals(0, bots(room), "다음 판에는 봇이 빠짐");
        assertEquals(4, room.players.size());
    }

    @Test
    void inputIgnoresBadValues() {
        Room room = room();
        Player a = player("a", "sua");
        room.join(a);
        room.input("a", Map.of("aim", Double.NaN, "cast", "x", "up", true));
        assertTrue(Double.isFinite(a.aim));
        assertTrue(a.casts.isEmpty());
        assertTrue(a.up);
    }
}
