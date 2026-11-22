package com.elementbrawl.account;

import com.elementbrawl.game.Room;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AccountApiTest {
    @Autowired
    MockMvc mvc;
    @Autowired
    ObjectMapper json;
    @Autowired
    AccountService service;
    @Autowired
    AccountRepository accounts;

    private String body(String u, String p) throws Exception {
        return json.writeValueAsString(Map.of("username", u, "password", p));
    }

    @Test
    void signupLoginMeAndLeaderboard() throws Exception {
        String res = mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body("불꽃왕", "1234")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("불꽃왕"))
                .andReturn().getResponse().getContentAsString();
        String token = json.readTree(res).get("token").asText();

        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body("불꽃왕", "9999")))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("이미 있는 이름이에요"));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(body("봇아님", "1234")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body("불꽃왕", "틀림")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body("불꽃왕", "1234")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").isString());

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("불꽃왕"));
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer nope")).andExpect(status().isUnauthorized());

        long id = accounts.findByUsernameIgnoreCase("불꽃왕").orElseThrow().getId();
        service.record(List.of(new Room.Result(id, true, 3, false)));
        mvc.perform(get("/api/leaderboard")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("불꽃왕"))
                .andExpect(jsonPath("$[0].wins").value(1))
                .andExpect(jsonPath("$[0].kills").value(3))
                .andExpect(jsonPath("$[0].token").doesNotExist());
    }
}
