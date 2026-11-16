# 원소 난투 (프로토타입)

브라우저에서 즐기는 쿼터뷰 실시간 대전 액션입니다. 지금은 2단계(혼자 허수아비 상대로 조작과 원소 상성 확인) 상태예요.

## 실행

Java 21만 있으면 됩니다. Maven은 따로 설치하지 않아도 돼요.

```bash
./mvnw spring-boot:run        # Windows: mvnw.cmd spring-boot:run
```

브라우저에서 http://localhost:8080 을 엽니다.

## 조작

WASD 이동 · 마우스 조준 · 좌클릭 기본 공격 · Q / E 스킬 · R 필살기(게이지 100%) · Esc 캐릭터 다시 고르기

## 구조

- `src/main/java/com/elementbrawl/character` 캐릭터 능력치와 원소 상성 (`/api/characters`, `/api/affinity`)
- `src/main/resources/static/js/game.js` 화면, 입력, 전투 판정 (3단계에서 판정을 서버 WebSocket 게임 룸으로 옮김)

## 테스트

```bash
./mvnw test
```
