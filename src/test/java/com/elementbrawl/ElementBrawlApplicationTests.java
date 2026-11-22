package com.elementbrawl;

import com.elementbrawl.character.Element;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ElementBrawlApplicationTests {

    @Autowired
    MockMvc mvc;

    @Test
    void affinityCycle() {
        assertThat(Element.WATER.multiplierAgainst(Element.FIRE)).isEqualTo(1.2);
        assertThat(Element.FIRE.multiplierAgainst(Element.WATER)).isEqualTo(0.8);
        assertThat(Element.FIRE.multiplierAgainst(Element.WIND)).isEqualTo(1.2);
        assertThat(Element.WIND.multiplierAgainst(Element.EARTH)).isEqualTo(1.2);
        assertThat(Element.EARTH.multiplierAgainst(Element.WATER)).isEqualTo(1.2);
        assertThat(Element.FIRE.multiplierAgainst(Element.EARTH)).isEqualTo(1.0);
        assertThat(Element.FIRE.multiplierAgainst(Element.FIRE)).isEqualTo(1.0);
    }

    @Test
    void servesCharactersAndGamePage() throws Exception {
        mvc.perform(get("/api/characters")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[0].element").value("FIRE"));
        mvc.perform(get("/api/affinity")).andExpect(status().isOk())
                .andExpect(jsonPath("$.WATER.FIRE").value(1.2));
        mvc.perform(get("/")).andExpect(status().isOk());
    }
}
