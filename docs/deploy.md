# 배포: 장기 앱과 같은 Oracle VM에 함께 올리기

원소 난투는 장기 앱(`orinalgga/janggigame`)이 돌고 있는 Oracle Cloud VM에 같이 올라갑니다.
추모 앱(`orinalgga/memorial`)과 같은 방식입니다.

| 부분 | 어디서 | 비고 |
| --- | --- | --- |
| 서버 + 게임 화면 (Spring Boot) | Oracle VM의 도커 | GitHub Actions가 만든 `ghcr.io/orinalgga/elemental-server` 이미지를 받아 씀. 화면(정적 파일)도 이 서버가 내줌 |
| 계정·전적 DB | 같은 컨테이너의 H2 파일 | `gamedata` 볼륨(`/data`)에 저장. DB 컨테이너 따로 없음 |
| HTTPS | 장기 앱의 caddy | `game.<공인 IP>.sslip.io` 로 인증서를 받아 게임 서버로 넘김 (웹소켓 포함) |

Cloudflare Pages는 필요 없습니다. 주소 하나로 화면과 서버가 같이 열립니다.

## 1. 서버 이미지 공개

`main`에 머지되면 `Server image` 워크플로가 `ghcr.io/orinalgga/elemental-server:latest`를 올립니다.
처음 한 번은 GitHub의 Packages → `elemental-server` → Package settings에서 공개(Public)로 바꿔 둡니다.
(장기 앱, 추모 앱 이미지와 같은 방법입니다. 비공개로 두려면 VM에서 `docker login ghcr.io`가 필요합니다.)

## 2. VM에서 게임 서버 띄우기

```bash
ssh ubuntu@<공인 IP>
git clone https://github.com/orinalgga/Elemental.git ~/elemental
cd ~/elemental
bash deploy/setup-on-janggi-vm.sh
```

이 스크립트가 하는 일:

- `.env`를 만듭니다. `COMPOSE_FILE`에 `deploy/compose.janggi.yml`이 들어가서, 서버가 장기 앱 도커 네트워크(`janggigame_default`)에 `elemental-server`라는 이름으로 붙습니다.
- 이미지를 받아 서버를 띄웁니다. VM 안에서는 `127.0.0.1:8082`로 열립니다(장기 앱 8080, 추모 앱 8081).
- 5분마다 새 버전을 받는 자동 업데이트를 cron에 등록합니다. 로그는 `~/elemental-auto-update.log`.

확인: `curl -s localhost:8082/api/rooms` → `[]`

## 3. 장기 앱 caddy에 게임 주소 더하기

장기 앱 저장소의 `deploy/Caddyfile`과 `docker-compose.yml`(caddy `environment`)에 게임 주소가 들어가 있어야 합니다
(같은 내용이 `deploy/Caddyfile.janggi-snippet`에 있습니다).

```
{$ELEMENTAL_HOST} {
	encode gzip
	reverse_proxy elemental-server:8080
}
```

```yaml
      ELEMENTAL_HOST: ${ELEMENTAL_HOST:-game.localhost}
```

그리고 VM의 `~/janggigame/.env`에:

```
ELEMENTAL_HOST=game.<공인 IP>.sslip.io
```

장기 앱 쪽 변경이 main에 머지되면 장기 앱 자동 업데이트가 caddy를 다시 띄웁니다. `.env`를 고친 뒤 바로 반영하려면:

```bash
cd ~/janggigame && docker compose up -d caddy
```

확인: 브라우저로 `https://game.<공인 IP>.sslip.io` 를 열면 캐릭터 선택 화면이 나옵니다.

## 메모리

`-Xmx256m`이면 게임 서버는 대략 350MB 안쪽을 씁니다. 방 상태는 메모리에 있고 서버는 한 대로 충분합니다.

## 손으로 업데이트

```bash
cd ~/elemental && bash deploy/update.sh
```

## 전적 DB 백업

```bash
cd ~/elemental && docker compose cp server:/data ./backup-$(date +%F)
```
