package com.elementbrawl.game;

import com.elementbrawl.account.Account;
import com.elementbrawl.account.AccountService;
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
import java.util.Optional;
import java.util.concurrent.ExecutorService;
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
    private final AccountService accounts;
    // 전적 저장은 게임 루프를 막지 않도록 따로
    private final ExecutorService recorder = Executors.newSingleThreadExecutor(r -> {
        Thread th = new Thread(r, "stats-recorder");
        th.setDaemon(true);
        return th;
    });
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, Room> roomOf = new ConcurrentHashMap<>();
    private final ScheduledExecutorService loop = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread th = new Thread(r, "game-loop");
        th.setDaemon(true);
        return th;
    });

    public RoomManager(ObjectMapper json, AccountService accounts) {
        this.json = json;
        this.accounts = accounts;
        loop.scheduleAtFixedRate(this::tickAll, 0, 1000 / TICK_HZ, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void stop() {
        loop.shutdownNow();
        recorder.shutdown();
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
                if (room.humans() == 0) rooms.remove(room.code);
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
        Optional<Account> account = Optional.empty();
        if (msg.get("token") instanceof String token) {
            try {
                account = accounts.resolve(token);
            } catch (RuntimeException e) {
                log.warn("token lookup failed", e);
            }
        }
        String name = account.map(Account::getUsername).orElse(clean(String.valueOf(msg.getOrDefault("name", "")), 10));
        if (name.isEmpty()) name = "플레이어";
        if (account.isEmpty() && name.startsWith("봇")) name = "손님" + name.substring(1);
        var spec = CharacterController.find(String.valueOf(msg.get("character")));

        Player player = new Player(session.getId(), name, spec);
        account.ifPresent(a -> player.accountId = a.getId());
        Room room;
        while (true) {
            room = rooms.computeIfAbsent(code, Room::new);
            synchronized (room) {
                // 마지막 사람이 막 나가서 지워진 방이면 다시 만든다
                if (rooms.get(code) != room) continue;
                if (room.isFull()) {
                    send(session, Map.of("type", "error", "message", "방이 가득 찼어요 (최대 " + Room.MAX_PLAYERS + "명)"));
                    return;
                }
                room.join(player);
                roomOf.put(session.getId(), room);
                break;
            }
        }
        send(session, Map.of("type", "welcome", "id", session.getId(), "room", code, "name", name,
                "rocks", Arena.json(), "arena", Map.of("x", Arena.AX, "y", Arena.AY, "w", Arena.AW, "h", Arena.AH)));
        log.info("{} joined room {} as {}", name, code, spec.id());
    }

    private void tickAll() {
        try {
            double dt = 1.0 / TICK_HZ;
            for (Room room : List.copyOf(rooms.values())) {
                Map<String, Object> snap;
                List<String> ids;
                List<Room.Result> results = List.of();
                synchronized (room) {
                    room.tick(dt);
                    snap = room.snapshot();
                    ids = new ArrayList<>(room.players.keySet());
                    if (!room.results.isEmpty()) {
                        results = new ArrayList<>(room.results);
                        room.results.clear();
                    }
                }
                if (!results.isEmpty()) {
                    List<Room.Result> r = results;
                    recorder.submit(() -> {
                        try {
                            accounts.record(r);
                        } catch (RuntimeException e) {
                            log.warn("stats record failed", e);
                        }
                    });
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
                return Map.<String, Object>of("code", r.code, "players", r.humans(), "max", Room.MAX_PLAYERS, "phase", r.phase);
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
