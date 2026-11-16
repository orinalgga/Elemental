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

## 캐릭터 그림(스프라이트 시트) 넣기

그림이 없으면 코드로 그린 기본 SD 캐릭터가 나옵니다. PNG 스프라이트 시트를 넣으면 그 그림으로 바뀌어요.

1. PNG를 `src/main/resources/static/assets/characters/` 에 넣습니다. 한 줄이 한 동작(대기, 걷기, 피격)이고, 칸 크기는 모두 같아야 해요.
2. 같은 폴더의 `manifest.example.json` 을 `manifest.json` 으로 복사하고 캐릭터별로 적습니다.
   - 키: `hwarang`, `sua`, `punghu`, `gangdol`, `dummy`(허수아비)
   - `frameWidth`, `frameHeight`: 한 칸 크기(px)
   - `anims`: 동작별 `row`(몇 번째 줄, 0부터), `frames`(칸 수), `fps`(초당 장 수, 0이면 정지)
   - `displayHeight`: 게임 화면에서의 키(px, 기본 72)
   - `anchorY`: 칸 안에서 발이 닿는 높이(0 맨 위, 1 맨 아래)
   - `facesRight`: 그림이 오른쪽을 보고 있으면 true. 왼쪽으로 갈 때는 자동으로 뒤집혀요.
   - `pixelArt`: 도트 그림이면 true(확대해도 흐려지지 않음)
3. 서버를 다시 켜면 적용돼요. 등록하지 않은 캐릭터는 기본 그림 그대로예요.

## 테스트

```bash
./mvnw test
```
