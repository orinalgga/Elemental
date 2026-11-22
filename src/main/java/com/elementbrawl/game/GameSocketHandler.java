package com.elementbrawl.game;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** /ws 로 들어오는 연결. 메시지는 JSON: join, input. 서버는 welcome, state, error 를 보낸다. */
@Component
public class GameSocketHandler extends TextWebSocketHandler {
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {
    };

    private final RoomManager rooms;
    private final ObjectMapper json;
    // 게임 루프와 수신 스레드가 동시에 보내도 안전하도록 감싼 세션
    private final Map<String, WebSocketSession> safe = new ConcurrentHashMap<>();

    public GameSocketHandler(RoomManager rooms, ObjectMapper json) {
        this.rooms = rooms;
        this.json = json;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession s = new ConcurrentWebSocketSessionDecorator(session, 2000, 256 * 1024);
        safe.put(session.getId(), s);
        rooms.connected(s);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Map<String, Object> msg;
        try {
            msg = json.readValue(message.getPayload(), MAP);
        } catch (Exception e) {
            return;
        }
        rooms.message(safe.getOrDefault(session.getId(), session), msg);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        safe.remove(session.getId());
        rooms.disconnected(session.getId());
    }
}
