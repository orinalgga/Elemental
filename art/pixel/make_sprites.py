"""원소 난투 도트 스프라이트 생성기.

캐릭터마다 24x32 칸에 앞(아래), 옆(오른쪽), 뒤(위) 3방향 × 걷기 3장을 찍어
PNG 시트(3줄 × 3칸)로 저장한다. 바깥 외곽선은 자동으로 그린다.

    python3 make_sprites.py  →  ../../src/main/resources/static/assets/characters/*.png
"""
import os
from PIL import Image

W, H = 24, 32
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'main', 'resources', 'static', 'assets', 'characters')

BASE = {
    'o': (43, 22, 18), 'S': (255, 224, 196), 's': (242, 184, 150), 'W': (255, 255, 255),
    'E': (42, 20, 16), 'P': (255, 150, 150), 'M': (156, 42, 36), 'B': (90, 58, 42),
    'G': (43, 43, 51), 'Y': (244, 178, 60), 'w': (214, 220, 232),
}


class Sprite:
    def __init__(self):
        self.px = [[None] * W for _ in range(H)]

    def set(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = c

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < W and 0 <= y < H else None

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c, cond=None):
        for y in range(H):
            for x in range(W):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1 and (cond is None or cond(x, y)):
                    self.set(x, y, c)

    def recolor(self, frm, to, cond):
        for y in range(H):
            for x in range(W):
                if self.px[y][x] == frm and cond(x, y):
                    self.px[y][x] = to

    def shift(self, dy, y_from):
        """y_from 위쪽 전체를 dy 만큼 옮긴다 (걷기 들썩임)."""
        if dy == 0:
            return
        old = [row[:] for row in self.px]
        for y in range(H):
            for x in range(W):
                if y < y_from:
                    self.px[y][x] = None
        for y in range(y_from):
            for x in range(W):
                if old[y][x] is not None and 0 <= y + dy < H:
                    self.px[y + dy][x] = old[y][x]

    def outline(self):
        add = []
        for y in range(H):
            for x in range(W):
                if self.px[y][x] is None and any(
                        self.get(x + dx, y + dy) not in (None, 'o') for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    add.append((x, y))
        for x, y in add:
            self.px[y][x] = 'o'

    def image(self, pal):
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y in range(H):
            for x in range(W):
                c = self.px[y][x]
                if c is not None:
                    img.putpixel((x, y), (*pal[c], 255))
        return img


# ---------------- 머리 ----------------
def bangs_bottom(x, base):
    # 둥근 물결 앞머리: 3칸마다 한 번씩 내려옴
    return base + (0, 1, 2, 1)[x % 4]


def eye(sp, x, y):
    # 2x4 애니 눈: 속눈썹, 반짝이, 홍채, 아래쪽 밝은 홍채
    sp.set(x, y, 'E'); sp.set(x + 1, y, 'E')
    sp.set(x, y + 1, 'D'); sp.set(x + 1, y + 1, 'W')
    sp.set(x, y + 2, 'I'); sp.set(x + 1, y + 2, 'D')
    sp.set(x, y + 3, 'i'); sp.set(x + 1, y + 3, 'I')


def head_front(sp, look):
    sp.ellipse(12, 10.5, 9.4, 8.6, 'H')                       # 머리 전체
    sp.rect(3, 11, 5, 17, 'H'); sp.rect(18, 11, 20, 17, 'H')   # 옆머리
    sp.set(3, 18, 'H'); sp.set(20, 18, 'H')
    sp.ellipse(12, 12.6, 6.9, 5.9, 'S', lambda x, y: y >= bangs_bottom(x, 8))  # 얼굴
    sp.recolor('H', 'h', lambda x, y: x >= 17 and y >= 6)      # 오른쪽 그림자
    sp.recolor('H', 'h', lambda x, y: y >= 15 and x <= 5)
    for x in range(7, 14):                                    # 천사 고리
        sp.set(x, 5 if x < 12 else 4, 'L')
    sp.set(12, 0, 'H'); sp.set(13, 0, 'H'); sp.set(12, 1, 'H')  # 바보털
    # 눈 (2x3, 반짝이)
    for ex in (8, 14):
        eye(sp, ex, 11)
    sp.set(7, 11, 'E'); sp.set(16, 11, 'E')                     # 속눈썹
    sp.set(7, 15, 'P'); sp.set(16, 15, 'P')                     # 볼
    sp.set(11, 16, 'M'); sp.set(12, 16, 'M')                    # 입
    sp.recolor('S', 's', lambda x, y: y == bangs_bottom(x, 8) and x >= 6)  # 앞머리 그림자
    look['accessory_front'](sp)


def head_side(sp, look):
    sp.ellipse(11.5, 10.5, 9.2, 8.6, 'H')
    sp.rect(3, 11, 7, 17, 'H'); sp.set(4, 18, 'H'); sp.set(5, 18, 'H')   # 뒷머리
    sp.ellipse(14, 12.6, 6.2, 5.9, 'S', lambda x, y: x >= 9 and y >= bangs_bottom(x, 8))
    sp.set(10, 13, 's'); sp.set(10, 12, 's')                   # 귀 그늘
    sp.recolor('H', 'h', lambda x, y: x <= 6 and y >= 6)
    for x in range(8, 15):
        sp.set(x, 5 if x < 13 else 4, 'L')
    sp.set(13, 0, 'H'); sp.set(14, 0, 'H'); sp.set(13, 1, 'H')
    eye(sp, 16, 11)
    sp.set(18, 11, 'E')
    sp.set(15, 15, 'P')
    sp.set(19, 16, 'M')
    sp.recolor('S', 's', lambda x, y: y == bangs_bottom(x, 8) and x >= 9)
    look['accessory_side'](sp)


def head_back(sp, look):
    sp.ellipse(12, 10.5, 9.4, 8.6, 'H')
    sp.rect(3, 11, 20, 16, 'H')
    for x in range(3, 21):                                    # 둥근 물결 끝머리
        for y in range(17, bangs_bottom(x, 17) + 1):
            sp.set(x, y, 'H')
    sp.recolor('H', 'h', lambda x, y: x >= 18 or y >= bangs_bottom(x, 16))
    for x in (7, 11, 15):                                     # 머리카락 결
        for y in range(9, 15):
            sp.set(x + (y > 12), y, 'h')
    for x in range(7, 15):
        sp.set(x, 5, 'L')
    sp.set(12, 0, 'H'); sp.set(13, 0, 'H'); sp.set(12, 1, 'H')
    look['accessory_back'](sp)


# ---------------- 몸 ----------------
def body_front(sp, look, step):
    # step: 0 서기, 1 왼발 앞, 2 오른발 앞
    lu = -1 if step == 1 else 0
    ru = -1 if step == 2 else 0
    # 다리와 신발
    sp.rect(8, 26 + lu, 10, 27 + lu, 'S'); sp.rect(13, 26 + ru, 15, 27 + ru, 'S')
    sp.rect(7, 28 + lu, 10, 29 + lu, 'W'); sp.rect(13, 28 + ru, 16, 29 + ru, 'W')
    sp.rect(7, 29 + lu, 10, 29 + lu, look['accent2']); sp.rect(13, 29 + ru, 16, 29 + ru, look['accent2'])
    # 반바지
    sp.rect(7, 24, 16, 25, 'N'); sp.set(11, 25, None); sp.set(12, 25, None)
    sp.set(7, 25, look['accent']); sp.set(16, 25, look['accent'])
    # 상체
    sp.rect(7, 18, 16, 22, 'N')
    sp.rect(10, 18, 13, 22, 'W')
    sp.set(11, 20, 'f'); sp.set(12, 20, 'f'); sp.set(11, 19, 'F')
    sp.rect(9, 18, 9, 22, look['accent']); sp.rect(14, 18, 14, 22, look['accent'])
    sp.rect(15, 19, 16, 22, 'n')
    sp.rect(7, 23, 16, 23, 'B'); sp.set(11, 23, 'Y'); sp.set(12, 23, 'Y')
    # 팔 (걸을 때 반대로 흔들림)
    la = 1 if step == 2 else 0
    ra = 1 if step == 1 else 0
    sp.rect(5, 19, 6, 21 + la, 'N'); sp.rect(5, 22 + la, 6, 22 + la, 'G')
    sp.rect(17, 19, 18, 21 + ra, 'n'); sp.rect(17, 22 + ra, 18, 22 + ra, 'G')


def body_side(sp, look, step):
    # 앞다리/뒷다리가 앞뒤로 벌어짐
    off = {0: (0, 0), 1: (2, -2), 2: (-2, 2)}[step]
    for i, (dx, c_leg) in enumerate(((off[1], 's'), (off[0], 'S'))):   # 뒷다리 먼저
        x0 = 10 + dx
        sp.rect(x0, 26, x0 + 2, 27, c_leg)
        sp.rect(x0, 28, x0 + 3, 29, 'W' if i else 'w')
        sp.rect(x0, 29, x0 + 3, 29, look['accent2'])
    sp.rect(9, 24, 15, 25, 'N')
    sp.rect(9, 18, 15, 22, 'N')
    sp.rect(14, 18, 15, 22, 'W'); sp.set(15, 20, 'f')
    sp.rect(13, 18, 13, 22, look['accent'])
    sp.rect(9, 23, 15, 23, 'B'); sp.set(15, 23, 'Y')
    sp.rect(8, 17, 10, 18, look['accent'])                    # 후드
    swing = {0: 0, 1: 1, 2: -1}[step]
    sp.rect(11 + swing, 19, 12 + swing, 21, 'n')
    sp.rect(11 + swing, 22, 12 + swing, 22, 'G')


def body_back(sp, look, step):
    lu = -1 if step == 1 else 0
    ru = -1 if step == 2 else 0
    sp.rect(8, 26 + lu, 10, 27 + lu, 'S'); sp.rect(13, 26 + ru, 15, 27 + ru, 'S')
    sp.rect(7, 28 + lu, 10, 29 + lu, 'W'); sp.rect(13, 28 + ru, 16, 29 + ru, 'W')
    sp.rect(7, 29 + lu, 10, 29 + lu, look['accent2']); sp.rect(13, 29 + ru, 16, 29 + ru, look['accent2'])
    sp.rect(7, 24, 16, 25, 'N'); sp.set(11, 25, None); sp.set(12, 25, None)
    sp.rect(7, 18, 16, 22, 'N')
    sp.rect(9, 20, 14, 21, look['accent'])                    # 후드
    sp.rect(10, 21, 13, 21, 'n')
    sp.rect(7, 23, 16, 23, 'B')
    la = 1 if step == 2 else 0
    ra = 1 if step == 1 else 0
    sp.rect(5, 19, 6, 21 + la, 'n'); sp.rect(5, 22 + la, 6, 22 + la, 'G')
    sp.rect(17, 19, 18, 21 + ra, 'N'); sp.rect(17, 22 + ra, 18, 22 + ra, 'G')


VIEWS = [(head_front, body_front), (head_side, body_side), (head_back, body_back)]


def make_frame(look, view, step):
    head, body = VIEWS[view]
    sp = Sprite()
    body(sp, look, step)
    head(sp, look)
    if step != 0:
        sp.shift(-1, 24)   # 걸을 때 상체가 살짝 들썩임
    sp.outline()
    return sp.image(look['palette'])


def make_sheet(look):
    sheet = Image.new('RGBA', (W * 3, H * 3), (0, 0, 0, 0))
    for view in range(3):
        for step in range(3):
            sheet.paste(make_frame(look, view, (0, 1, 2)[step]), (step * W, view * H))
    return sheet


# ---------------- 캐릭터 ----------------
def flame_clip(points):
    def draw(sp):
        for (x, y, c) in points:
            sp.set(x, y, c)
    return draw


HWARANG = {
    'palette': {**BASE,
                'H': (240, 85, 44), 'h': (184, 50, 28), 'L': (255, 154, 90),
                'I': (226, 84, 31), 'i': (255, 184, 58), 'D': (122, 26, 14),
                'N': (42, 51, 82), 'n': (27, 34, 56), 'F': (255, 210, 58), 'f': (255, 122, 28)},
    'accent': 'f', 'accent2': 'f',
    'accessory_front': flame_clip([(4, 6, 'F'), (5, 6, 'f'), (4, 7, 'f'), (5, 7, 'F'), (5, 5, 'F')]),
    'accessory_side': flame_clip([(5, 6, 'F'), (6, 6, 'f'), (5, 7, 'f'), (6, 7, 'F'), (6, 5, 'F')]),
    'accessory_back': flame_clip([(18, 6, 'F'), (19, 6, 'f'), (18, 7, 'f'), (19, 7, 'F'), (18, 5, 'F')]),
}

CHARACTERS = {'hwarang': HWARANG}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, look in CHARACTERS.items():
        path = os.path.join(OUT, f'{name}.png')
        make_sheet(look).save(path)
        print('saved', os.path.normpath(path))
