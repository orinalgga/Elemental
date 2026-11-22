package com.elementbrawl.account;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

import java.time.Instant;

/** 로그인 유지용 토큰. 브라우저가 저장해 두고 요청마다 보낸다. */
@Entity
public class AuthToken {
    @Id
    private String token;
    private Long accountId;
    private Instant createdAt = Instant.now();

    protected AuthToken() {
    }

    public AuthToken(String token, Long accountId) {
        this.token = token;
        this.accountId = accountId;
    }

    public String getToken() {
        return token;
    }

    public Long getAccountId() {
        return accountId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
