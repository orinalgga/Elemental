# 원소 난투 (프로토타입)

브라우저에서 즐기는 쿼터뷰 실시간 대전 액션입니다. 지금은 3단계(WebSocket 실시간 멀티플레이, 방마다 2~4명 개인전) 상태예요.

## 실행

Java 21만 있으면 됩니다. Maven은 따로 설치하지 않아도 돼요.

```bash
./mvnw spring-boot:run        # Windows: mvnw.cmd spring-boot:run
```

브라우저에서 http://localhost:8080 을 엽니다.

## 같이 하기

1. 캐릭터를 고르고 이름과 방 코드를 입력해 입장합니다. 기본 방은 `LOBBY` 예요.
2. 친구도 같은 방 코드로 들어오면 바로 대전이 시작돼요 (최대 4명, 마지막까지 살아남은 사람이 승리, 5초 뒤 다음 판).
3. 혼자 있을 때는 허수아비 연습 모드예요. 대전 중에 들어온 사람은 다음 판부터 참가해요.
4. 주소창의 `?room=코드` 링크를 친구에게 보내면 같은 방이 미리 채워져요.

같은 와이파이의 친구는 `http://내PC의IP:8080` 으로 들어올 수 있어요 (Windows 방화벽에서 8080 포트 허용 필요).

## 조작

WASD 이동 · 마우스 조준 · 좌클릭 기본 공격 · Q / E 스킬 · R 필살기(게이지 100%) · Esc 방 나가기

## 구조

- `src/main/java/com/elementbrawl/character` 캐릭터 능력치와 원소 상성 (`/api/characters`, `/api/affinity`)
- `src/main/java/com/elementbrawl/game` 서버 게임 룸. 이동, 스킬, 피해, 승패를 모두 서버가 초당 20번 계산 (`/ws`, `/api/rooms`)
  - `Room` 한 방의 상태와 판정, `Skills` 캐릭터별 스킬, `RoomManager` 방 목록과 게임 루프, `GameSocketHandler` 연결
- `src/main/resources/static/js/game.js` 화면과 입력. 서버로 키와 조준을 보내고 받은 상태를 그림

## 캐릭터 그림(스프라이트 시트) 넣기

지금 들어 있는 도트 그림은 `art/pixel/make_sprites.py` 로 만들어요(`python3 art/pixel/make_sprites.py`). 그림이 없으면 코드로 그린 기본 SD 캐릭터가 나옵니다. PNG 스프라이트 시트를 넣으면 그 그림으로 바뀌어요.

1. PNG를 `src/main/resources/static/assets/characters/` 에 넣습니다. 한 줄이 한 동작(대기, 걷기, 피격)이고, 칸 크기는 모두 같아야 해요.
2. 같은 폴더의 `manifest.example.json` 을 `manifest.json` 으로 복사하고 캐릭터별로 적습니다.
   - 키: `hwarang`, `sua`, `punghu`, `gangdol`, `dummy-fire` · `dummy-water` · `dummy-wind` · `dummy-earth`(허수아비)
   - `directions`: 방향별 줄 번호 `{ "down": 0, "side": 1, "up": 2 }` (있으면 조준 방향에 따라 앞·옆·뒤 모습이 바뀜)
   - `frames`: 칸 수 대신 칸 번호 순서도 가능 (예: 걷기 `[1, 0, 2, 0]`)
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
