package com.elementbrawl.account;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class AccountController {
    private final AccountService service;

    public AccountController(AccountService service) {
        this.service = service;
    }

    record Credentials(String username, String password) {
    }

    @PostMapping("/api/auth/signup")
    Map<String, Object> signup(@RequestBody Credentials c) {
        return issued(service.signup(c.username(), c.password()));
    }

    @PostMapping("/api/auth/login")
    Map<String, Object> login(@RequestBody Credentials c) {
        return issued(service.login(c.username(), c.password()));
    }

    @PostMapping("/api/auth/logout")
    void logout(@RequestHeader(value = "Authorization", required = false) String auth) {
        service.logout(bearer(auth));
    }

    @GetMapping("/api/auth/me")
    ResponseEntity<Map<String, Object>> me(@RequestHeader(value = "Authorization", required = false) String auth) {
        String token = bearer(auth);
        return service.resolve(token).map(a -> ResponseEntity.ok(profile(a, token)))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @GetMapping("/api/leaderboard")
    List<Map<String, Object>> leaderboard() {
        List<Account> list = service.leaderboard(20);
        return list.stream().map(a -> {
            Map<String, Object> m = profile(a, null);
            m.put("rank", list.indexOf(a) + 1);
            return m;
        }).toList();
    }

    @ExceptionHandler(AccountService.AuthException.class)
    ResponseEntity<Map<String, String>> authError(AccountService.AuthException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    private Map<String, Object> issued(String token) {
        return profile(service.resolve(token).orElseThrow(), token);
    }

    private static Map<String, Object> profile(Account a, String token) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (token != null) m.put("token", token);
        m.put("username", a.getUsername());
        m.put("games", a.getGames());
        m.put("wins", a.getWins());
        m.put("kills", a.getKills());
        m.put("deaths", a.getDeaths());
        return m;
    }

    static String bearer(String auth) {
        return auth != null && auth.startsWith("Bearer ") ? auth.substring(7).trim() : null;
    }
}
