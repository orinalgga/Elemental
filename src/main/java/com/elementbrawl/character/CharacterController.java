package com.elementbrawl.character;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class CharacterController {

    static final List<CharacterSpec> CHARACTERS = List.of(
            new CharacterSpec("hwarang", "화랑", Element.FIRE, "원거리 폭발형", 90, 100, 200, "#ff6b3d",
                    List.of("화염구", "세 갈래 화염", "불기둥", "대폭발")),
            new CharacterSpec("sua", "수아", Element.WATER, "회복과 방해", 100, 110, 200, "#3da5ff",
                    List.of("물방울", "치유의 샘", "물결", "해일")),
            new CharacterSpec("punghu", "풍후", Element.WIND, "빠른 근접형", 80, 100, 250, "#5fd38d",
                    List.of("바람 베기", "질풍 돌진", "회오리", "연속 순간 베기")),
            new CharacterSpec("gangdol", "강돌", Element.EARTH, "탱커", 130, 90, 165, "#c8954a",
                    List.of("바위 주먹", "돌 던지기", "바위 갑옷", "대지 강타"))
    );

    @GetMapping("/characters")
    public List<CharacterSpec> characters() {
        return CHARACTERS;
    }

    /** 공격 원소 → 방어 원소 → 피해 배율 표. 클라이언트와 서버가 같은 값을 쓰게 한다. */
    @GetMapping("/affinity")
    public Map<Element, Map<Element, Double>> affinity() {
        var table = new java.util.EnumMap<Element, Map<Element, Double>>(Element.class);
        for (Element attacker : Element.values()) {
            var row = new java.util.EnumMap<Element, Double>(Element.class);
            for (Element defender : Element.values()) {
                row.put(defender, attacker.multiplierAgainst(defender));
            }
            table.put(attacker, row);
        }
        return table;
    }
}
