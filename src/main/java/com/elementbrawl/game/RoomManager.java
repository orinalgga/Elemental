package com.elementbrawl.game;

import com.elementbrawl.character.CharacterController;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** 방 목록과 게임 루프. 초당 20번 모든 방을 계산하고 상태를 보낸다. */
@Component
public class RoomManager {
    public static final int TICK_HZ = 20;
    private static final Logger log = LoggerFactory.getLogger(RoomManager.class);

    private final ObjectMapper json;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Room> roomOf = new ConcurrentHashMap<>();
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread th = new Thread(r, "game-loop");
        th.setDaemon(true);
        return th;
    });

    public RoomManager(ObjectMapper json) {
        this.json = json;
        loop.scheduleAtFixedRate(this::tickAll, 0, 1000 / TICK_HZ, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        loop.shutdownNow();
    }

    public void connected(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public void disconnected(String sessionId) {
        sessions.remove(sessionId);
        Room room = roomOf.remove(sessionId);
        if (room != null) {
            synchronized (room) {
                room.leave(sessionId);
                if (room.players.isEmpty()) rooms.remove(room.code);
            }
        }
    }

    public void message(WebSocketSession session, Map<String, Object> msg) {
        String type = String.valueOf(msg.get("type"));
        if ("join".equals(type)) {
            join(session, msg);
            return;
        }
        Room room = roomOf.get(session.getId());
        if (room == null) return;
        if ("input".equals(type)) {
            synchronized (room) {
                room.input(session.getId(), msg);
            }
        }
    }

    private void join(WebSocketSession session, Map<String, Object> msg) {
        if (roomOf.containsKey(session.getId())) return;
        String code = clean(String.valueOf(msg.getOrDefault("room", "")), 12).toUpperCase();
        if (code.isEmpty()) code = "LOBBY";
        String name = clean(String.valueOf(msg.getOrDefault("name", "")), 10);
        if (name.isEmpty()) name = "플레이어";
        var spec = CharacterController.find(String.valueOf(msg.get("character")));

        Room room = rooms.computeIfAbsent(code, Room::new);
        synchronized (room) {
            if (room.isFull()) {
                send(session, Map.of("type", "error", "message", "방이 가득 찼어요 (최대 " + Room.MAX_PLAYERS + "명)"));
                return;
            }
            room.join(new Player(session.getId(), name, spec));
            roomOf.put(session.getId(), room);
        }
        send(session, Map.of("type", "welcome", "id", session.getId(), "room", code));
        log.info("{} joined room {} as {}", name, code, spec.id());
    }

    private void tickAll() {
        try {
            double dt = 1.0 / TICK_HZ;
            for (Room room : List.copyOf(rooms.values())) {
                Map<String, Object> snap;
                List<String> ids;
                synchronized (room) {
                    room.tick(dt);
                    snap = room.snapshot();
                    ids = new ArrayList<>(room.players.keySet());
                }
                String text = json.writeValueAsString(snap);
                for (String id : ids) {
                    WebSocketSession s = sessions.get(id);
                    if (s != null) sendRaw(s, text);
                }
            }
        } catch (Exception e) {
            log.warn("game loop error", e);
        }
    }

    public List<Map<String, Object>> listRooms() {
        return rooms.values().stream().map(r -> {
            synchronized (r) {
                return Map.<String, Object>of("code", r.code, "players", r.players.size(), "max", Room.MAX_PLAYERS, "phase", r.phase);
            }
        }).toList();
    }

    private void send(WebSocketSession s, Object payload) {
        try {
            sendRaw(s, json.writeValueAsString(payload));
        } catch (IOException e) {
            log.debug("send failed", e);
        }
    }

    private void sendRaw(WebSocketSession s, String text) {
        try {
            if (s.isOpen()) s.sendMessage(new TextMessage(text));
        } catch (IOException | IllegalStateException e) {
            log.debug("send failed to {}", s.getId());
        }
    }

    private static String clean(String s, int max) {
        String t = s.replaceAll("[\\p{Cntrl}<>]", "").trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
