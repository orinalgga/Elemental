package com.elementbrawl.account;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByUsernameIgnoreCase(String username);

    @Query("select a from Account a where a.games > 0 order by a.wins desc, a.kills desc, a.deaths asc, a.id asc")
    List<Account> leaderboard(Pageable page);
}
