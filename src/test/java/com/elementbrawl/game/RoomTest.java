package com.elementbrawl.game;

import com.elementbrawl.character.CharacterController;
import com.elementbrawl.character.Element;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RoomTest {
    private static Player player(String id, String character) {
        return new Player(id, id, CharacterController.find(character));
    }

    @Test
    void soloIsPracticeAndSecondPlayerStartsRound() {
        Room room = new Room("T");
        room.join(player("a", "hwarang"));
        assertEquals("practice", room.phase);
        assertFalse(room.dummies.isEmpty());

        room.join(player("b", "sua"));
        assertEquals("playing", room.phase);
        assertTrue(room.dummies.isEmpty());
    }

    @Test
    void lastSurvivorWinsAndRoundRestarts() {
        Room room = new Room("T");
        Player a = player("a", "hwarang");
        Player b = player("b", "sua");
        room.join(a);
        room.join(b);

        room.damage(b, 10_000, Element.FIRE, a);
        room.tick(0.05);
        assertEquals("ended", room.phase);
        assertEquals("a", room.winner);
        assertEquals(1, a.wins);
        assertEquals(1, a.kills);

        for (int i = 0; i < 120; i++) room.tick(0.05);
        assertEquals("playing", room.phase);
        assertTrue(b.alive());
    }

    @Test
    void lateJoinerSpectatesUntilNextRound() {
        Room room = new Room("T");
        Player a = player("a", "hwarang");
        Player b = player("b", "sua");
        room.join(a);
        room.join(b);
        a.hp = 10;

        Player c = player("c", "gangdol");
        room.join(c);
        assertEquals("playing", room.phase);
        assertEquals(10, a.hp, 0.001, "진행 중인 판이 초기화되면 안 됨");
        assertFalse(c.alive());
    }

    @Test
    void affinityChangesDamage() {
        Room room = new Room("T");
        Player fire = player("f", "hwarang");
        Player water = player("w", "sua");
        room.join(fire);
        room.join(water);
        double before = fire.hp;
        room.damage(fire, 10, Element.WATER, water);
        assertEquals(12, before - fire.hp, 0.001);
    }

    @Test
    void roomFullAtFour() {
        Room room = new Room("T");
        for (String c : new String[]{"hwarang", "sua", "punghu", "gangdol"}) room.join(player(c, c));
        assertTrue(room.isFull());
    }
}
