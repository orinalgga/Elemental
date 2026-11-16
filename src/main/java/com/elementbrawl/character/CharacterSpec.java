package com.elementbrawl.character;

import java.util.List;

/** 캐릭터 기본 능력치와 스킬 이름. 실제 스킬 동작은 아직 클라이언트(game.js)에 있다. */
public record CharacterSpec(
        String id,
        String name,
        Element element,
        String role,
        int maxHp,
        int maxMp,
        double moveSpeed,
        String color,
        List<String> skills
) {
}
