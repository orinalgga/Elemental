package com.elementbrawl.account;

import com.elementbrawl.game.Room;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class AccountService {
    static final Pattern USERNAME = Pattern.compile("[가-힣A-Za-z0-9_]{2,12}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AccountRepository accounts;
    private final AuthTokenRepository tokens;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AccountService(AccountRepository accounts, AuthTokenRepository tokens) {
        this.accounts = accounts;
        this.tokens = tokens;
    }

    public static class AuthException extends RuntimeException {
        public AuthException(String message) {
            super(message);
        }
    }

    @Transactional
    public String signup(String username, String password) {
        username = username == null ? "" : username.trim();
        if (!USERNAME.matcher(username).matches()) throw new AuthException("이름은 2~12자의 한글, 영문, 숫자, _ 만 돼요");
        if (password == null || password.length() < 4 || password.length() > 64) throw new AuthException("비밀번호는 4~64자로 해 주세요");
        if (username.startsWith("봇")) throw new AuthException("'봇'으로 시작하는 이름은 쓸 수 없어요");
        if (accounts.findByUsernameIgnoreCase(username).isPresent()) throw new AuthException("이미 있는 이름이에요");
        Account a = accounts.save(new Account(username, encoder.encode(password)));
        return issue(a);
    }

    @Transactional
    public String login(String username, String password) {
        Account a = accounts.findByUsernameIgnoreCase(username == null ? "" : username.trim())
                .filter(x -> password != null && encoder.matches(password, x.getPasswordHash()))
                .orElseThrow(() -> new AuthException("이름이나 비밀번호가 맞지 않아요"));
        return issue(a);
    }

    private String issue(Account a) {
        byte[] b = new byte[24];
        RANDOM.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        tokens.save(new AuthToken(token, a.getId()));
        return token;
    }

    @Transactional(readOnly = true)
    public Optional<Account> resolve(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        return tokens.findById(token).flatMap(t -> accounts.findById(t.getAccountId()));
    }

    @Transactional
    public void logout(String token) {
        if (token != null) tokens.deleteById(token);
    }

    @Transactional
    public void record(List<Room.Result> results) {
        for (Room.Result r : results) {
            accounts.findById(r.accountId()).ifPresent(a -> a.addGame(r.win(), r.kills(), r.died()));
        }
    }

    @Transactional(readOnly = true)
    public List<Account> leaderboard(int size) {
        return accounts.leaderboard(PageRequest.of(0, size));
    }
}
