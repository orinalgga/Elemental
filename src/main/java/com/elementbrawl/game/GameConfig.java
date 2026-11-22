package com.elementbrawl.game;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSocket
public class GameConfig implements WebSocketConfigurer {
    private final GameSocketHandler handler;

    public GameConfig(GameSocketHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws").setAllowedOriginPatterns("*");
    }

    @RestController
    static class RoomApi {
        private final RoomManager rooms;

        RoomApi(RoomManager rooms) {
            this.rooms = rooms;
        }

        @GetMapping("/api/rooms")
        List<Map<String, Object>> rooms() {
            return rooms.listRooms();
        }
    }
}
