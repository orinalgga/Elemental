package com.elementbrawl.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import java.time.Instant;

/** 계정과 누적 전적. 전적은 사람 2명 이상이 함께한 판만 센다. */
@Entity
public class Account {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 12)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    private int games;
    private int wins;
    private int kills;
    private int deaths;
    private Instant createdAt = Instant.now();

    protected Account() {
    }

    public Account(String username, String passwordHash) {
        this.username = username;
        this.passwordHash = passwordHash;
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public int getGames() {
        return games;
    }

    public int getWins() {
        return wins;
    }

    public int getKills() {
        return kills;
    }

    public int getDeaths() {
        return deaths;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void addGame(boolean win, int kills, boolean died) {
        this.games++;
        if (win) this.wins++;
        this.kills += kills;
        if (died) this.deaths++;
    }
}
