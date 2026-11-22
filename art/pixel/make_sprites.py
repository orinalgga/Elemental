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


# ======================================================================
# 비율: 약 2등신. 머리 1~14줄, 몸 15~29줄. 원소마다 머리 모양과 옷이 다르다.
# 보기(view): 0 앞, 1 옆(오른쪽), 2 뒤.  걸음(step): 0 서기, 1 왼발, 2 오른발
# ======================================================================

def face_front(sp, bangs, mouth='small'):
    sp.ellipse(12, 9.4, 5.4, 4.9, 'S', lambda x, y: y >= bangs(x))
    sp.recolor('S', 's', lambda x, y: y == bangs(x))
    for ex in (9, 13):
        sp.set(ex, 8, 'E'); sp.set(ex + 1, 8, 'E')
        sp.set(ex, 9, 'I'); sp.set(ex + 1, 9, 'W')
        sp.set(ex, 10, 'i'); sp.set(ex + 1, 10, 'I')
    sp.set(8, 8, 'E'); sp.set(15, 8, 'E')
    sp.set(8, 11, 'P'); sp.set(15, 11, 'P')
    if mouth == 'grin':
        sp.set(11, 12, 'M'); sp.set(12, 12, 'M')
    else:
        sp.set(12, 12, 'M')


def face_side(sp, bangs, mouth='small'):
    sp.ellipse(13.4, 9.4, 4.7, 4.9, 'S', lambda x, y: x >= 10 and y >= bangs(x))
    sp.recolor('S', 's', lambda x, y: y == bangs(x) and x >= 10)
    sp.set(11, 10, 's')
    sp.set(15, 8, 'E'); sp.set(16, 8, 'E'); sp.set(17, 8, 'E')
    sp.set(15, 9, 'I'); sp.set(16, 9, 'W')
    sp.set(15, 10, 'i'); sp.set(16, 10, 'I')
    sp.set(14, 11, 'P')
    sp.set(17, 12, 'M')
    if mouth == 'grin':
        sp.set(16, 12, 'M')


def neck(sp, view):
    if view == 1:
        sp.rect(12, 14, 13, 15, 's')
    else:
        sp.rect(11, 14, 12, 15, 's')


def arms_front(sp, step, sleeve, sleeve_rows, hand='S', x_l=6, x_r=16, shade=None):
    la = 1 if step == 2 else 0
    ra = 1 if step == 1 else 0
    for x0, a, c in ((x_l, la, sleeve), (x_r, ra, shade or sleeve)):
        sp.rect(x0, 16, x0 + 1, 16 + sleeve_rows - 1 + a, c)
        sp.rect(x0, 16 + sleeve_rows + a, x0 + 1, 20 + a, 'S')
        sp.rect(x0, 20 + a, x0 + 1, 20 + a, hand)


def arm_side(sp, step, sleeve, sleeve_rows, hand='S'):
    sw = {0: 0, 1: 1, 2: -1}[step]
    x0 = 12 + sw
    sp.rect(x0, 16, x0 + 1, 16 + sleeve_rows - 1, sleeve)
    sp.rect(x0, 16 + sleeve_rows, x0 + 1, 20, 'S')
    sp.rect(x0, 20, x0 + 1, 20, hand)


def legs_front(sp, step, pants, shoe, top=23, sock=None, sock_row=None, wide=False):
    lu = -1 if step == 1 else 0
    ru = -1 if step == 2 else 0
    (l0, l1), (r0, r1) = ((8, 10), (13, 15)) if wide else ((9, 10), (13, 14))
    for x0, x1, u, sx0, sx1 in ((l0, l1, lu, l0 - 1, l1), (r0, r1, ru, r0, r1 + 1)):
        sp.rect(x0, top, x1, 27 + u, pants)
        if sock:
            sp.rect(x0, sock_row + u, x1, 27 + u, sock)
        sp.rect(sx0, 28 + u, sx1, 29 + u, shoe)


def legs_side(sp, step, pants, pants_back, shoe, shoe_back, top=23, sock=None, sock_row=None):
    off = {0: (0, 0), 1: (2, -2), 2: (-2, 2)}[step]
    for dx, p, s_ in ((off[1], pants_back, shoe_back), (off[0], pants, shoe)):
        x0 = 11 + dx
        sp.rect(x0, top, x0 + 1, 27, p)
        if sock:
            sp.rect(x0, sock_row, x0 + 1, 27, sock)
        sp.rect(x0, 28, x0 + 2, 29, s_)


# ---------------- 화랑 (불): 삐죽머리, 머리띠, 빨간 트레이닝 재킷 ----------------
def hwarang(sp, view, step):
    # 몸
    if view == 0:
        legs_front(sp, step, 'N', 'R')
        sp.rect(8, 15, 15, 21, 'R'); sp.rect(14, 16, 15, 21, 'r')
        sp.rect(11, 15, 12, 21, 'K'); sp.set(11, 17, 'Y'); sp.set(12, 18, 'Y')
        sp.rect(8, 21, 15, 21, 'Y')
        sp.rect(8, 22, 15, 22, 'N')
        arms_front(sp, step, 'R', 4, shade='r')
    elif view == 1:
        legs_side(sp, step, 'N', 'n', 'R', 'r')
        sp.rect(10, 15, 14, 21, 'R'); sp.rect(14, 15, 14, 21, 'K')
        sp.rect(10, 21, 14, 21, 'Y'); sp.rect(10, 22, 14, 22, 'N')
        arm_side(sp, step, 'r', 4)
    else:
        legs_front(sp, step, 'N', 'R')
        sp.rect(8, 15, 15, 21, 'R'); sp.rect(10, 17, 13, 18, 'Y')   # 등 줄무늬
        sp.rect(8, 21, 15, 21, 'Y'); sp.rect(8, 22, 15, 22, 'N')
        arms_front(sp, step, 'r', 4, shade='R')
    neck(sp, view)
    # 머리
    spikes = [(6, 2), (7, 1), (9, 0), (10, 1), (13, 0), (14, 0), (16, 1), (17, 2), (18, 4), (5, 4)]
    cx = 12 if view != 1 else 11.5
    sp.ellipse(cx, 7.6, 7.0, 6.6, 'H')
    for x, y in spikes:
        sp.set(x if view != 1 else x - 1, y, 'H')
    if view == 1:
        sp.set(4, 6, 'H'); sp.set(3, 7, 'H'); sp.set(4, 9, 'H'); sp.set(3, 10, 'H')   # 뒷머리 삐죽
    bangs = lambda x: 5 + (0, 2, 1, 2)[x % 4]
    if view == 0:
        face_front(sp, bangs, 'grin')
    elif view == 1:
        face_side(sp, bangs, 'grin')
    sp.recolor('H', 'h', lambda x, y: (x >= 16 if view != 1 else x <= 6) and y >= 4)
    hb = (6, 17) if view != 1 else (5, 16)
    sp.rect(hb[0], 4, hb[1], 4, 'Y')                                   # 머리띠
    if view == 2:
        sp.rect(17, 5, 17, 5, 'Y'); sp.set(18, 6, 'Y'); sp.set(19, 7, 'Y'); sp.set(18, 8, 'Y')
    if view == 1:
        sp.rect(3, 4, 4, 5, 'Y'); sp.set(2, 6, 'Y')
    for x in range(8, 12):
        sp.set(x if view != 1 else x - 1, 2, 'L')


# ---------------- 수아 (물): 긴 생머리, 리본, 세일러 블라우스와 주름치마 ----------------
def sua(sp, view, step):
    long_hair = 'h'
    if view == 0:
        sp.rect(5, 8, 6, 20, long_hair); sp.rect(17, 8, 18, 20, long_hair)
        sp.set(5, 21, long_hair); sp.set(18, 21, long_hair)
    elif view == 1:
        sp.rect(4, 8, 8, 20, long_hair); sp.set(5, 21, long_hair); sp.set(6, 21, long_hair)
    # 몸
    if view == 0:
        legs_front(sp, step, 'S', 'C', top=24, sock='W', sock_row=26)
        sp.rect(8, 15, 15, 20, 'W'); sp.rect(14, 16, 15, 20, 'w')
        sp.rect(8, 15, 15, 15, 'C'); sp.set(9, 16, 'C'); sp.set(14, 16, 'C'); sp.set(10, 17, 'C'); sp.set(13, 17, 'C')
        sp.rect(11, 17, 12, 18, 'M')                                  # 스카프
        sp.rect(7, 21, 16, 23, 'C')
        for x in (9, 12, 15):
            sp.rect(x, 22, x, 23, 'c')
        arms_front(sp, step, 'W', 3, shade='w')
    elif view == 1:
        legs_side(sp, step, 'S', 's', 'C', 'c', top=24, sock='W', sock_row=26)
        sp.rect(10, 15, 14, 20, 'W'); sp.rect(10, 15, 11, 17, 'C'); sp.set(14, 17, 'M')
        sp.rect(9, 21, 15, 23, 'C'); sp.set(11, 22, 'c'); sp.set(13, 23, 'c')
        arm_side(sp, step, 'w', 3)
    else:
        legs_front(sp, step, 'S', 'C', top=24, sock='W', sock_row=26)
        sp.rect(8, 15, 15, 20, 'W')
        sp.rect(7, 21, 16, 23, 'C')
        for x in (9, 12, 15):
            sp.rect(x, 22, x, 23, 'c')
        arms_front(sp, step, 'w', 3, shade='W')
    neck(sp, view)
    # 머리
    cx = 12 if view != 1 else 11.5
    sp.ellipse(cx, 7.4, 6.9, 6.6, 'H')
    if view == 2:
        sp.rect(5, 7, 18, 20, 'H')
        for x in range(5, 19):
            sp.set(x, 21, 'H' if x % 2 else None)
        sp.recolor('H', 'h', lambda x, y: x >= 16 or x in (8, 12) and y > 8)
    bangs = lambda x: 6 if x != 11 else 5                              # 일자 앞머리
    if view == 0:
        face_front(sp, bangs)
        sp.recolor('H', 'h', lambda x, y: x >= 16 and y >= 4)
    elif view == 1:
        face_side(sp, bangs)
        sp.recolor('H', 'h', lambda x, y: x <= 6 and y >= 4)
    for x in range(8, 12):
        sp.set(x if view != 1 else x - 1, 2, 'L')
    # 흰 리본
    rx = {0: 16, 1: 6, 2: 6}[view]
    sp.set(rx, 1, 'W'); sp.set(rx + 2, 1, 'W'); sp.set(rx, 2, 'W'); sp.set(rx + 2, 2, 'W'); sp.set(rx + 1, 2, 'C')


# ---------------- 풍후 (바람): 옆으로 넘긴 머리, 휘날리는 머리끈, 짧은 망토 ----------------
def punghu(sp, view, step):
    if view == 0:
        legs_front(sp, step, 'n', 'b', sock='b', sock_row=26)
        sp.rect(8, 19, 15, 22, 'U'); sp.rect(8, 21, 15, 21, 'B'); sp.set(12, 21, 'Y')
        sp.rect(6, 15, 17, 19, 'V'); sp.rect(15, 15, 17, 19, 'v')       # 망토
        sp.set(6, 20, 'V'); sp.set(17, 20, 'v'); sp.set(11, 15, 'Y'); sp.set(12, 15, 'Y')
        la = 1 if step == 2 else 0
        ra = 1 if step == 1 else 0
        sp.rect(6, 20 + la, 7, 21 + la, 'S'); sp.rect(16, 20 + ra, 17, 21 + ra, 'S')
    elif view == 1:
        legs_side(sp, step, 'n', 'm', 'b', 'b', sock='b', sock_row=26)
        sp.rect(10, 19, 14, 22, 'U'); sp.rect(10, 21, 14, 21, 'B')
        wave = (0, 1, 0)[step]
        sp.rect(8, 15, 15, 19, 'V'); sp.rect(6, 16 + wave, 7, 19 + wave, 'v'); sp.set(5, 18 + wave, 'v')
        sp.set(14, 15, 'Y')
        sw = {0: 0, 1: 1, 2: -1}[step]
        sp.rect(12 + sw, 20, 13 + sw, 21, 'S')
    else:
        legs_front(sp, step, 'n', 'b', sock='b', sock_row=26)
        sp.rect(8, 19, 15, 22, 'U'); sp.rect(8, 21, 15, 21, 'B')
        sp.rect(6, 15, 17, 20, 'V'); sp.rect(9, 15, 14, 16, 'v')        # 후드
        la = 1 if step == 2 else 0
        ra = 1 if step == 1 else 0
        sp.rect(6, 21 + la, 7, 21 + la, 'S'); sp.rect(16, 21 + ra, 17, 21 + ra, 'S')
    neck(sp, view)
    cx = 12 if view != 1 else 11.5
    sp.ellipse(cx, 7.6, 7.0, 6.6, 'H')
    if view != 1:
        sp.set(4, 9, 'H'); sp.set(19, 10, 'H'); sp.set(5, 11, 'H')
    else:
        sp.set(3, 9, 'H'); sp.set(4, 11, 'H')
    bangs = lambda x: min(7, 4 + max(0, x - 5) // 3)                   # 오른쪽으로 넘긴 앞머리
    if view == 0:
        face_front(sp, bangs)
        sp.recolor('H', 'h', lambda x, y: x >= 16 and y >= 4)
    elif view == 1:
        face_side(sp, lambda x: 5 + (x % 3 == 0))
        sp.recolor('H', 'h', lambda x, y: x <= 6 and y >= 4)
    else:
        sp.recolor('H', 'h', lambda x, y: x >= 16 or y >= 12)
        sp.rect(11, 13, 12, 16, 'h'); sp.set(12, 17, 'h')             # 짧은 꽁지머리
    if view == 1:
        sp.rect(4, 11, 5, 13, 'h'); sp.set(3, 14, 'h')
    # 휘날리는 머리끈
    if view == 0:
        sp.rect(6, 4, 17, 4, 'T'); sp.set(5, 5, 'T'); sp.set(4, 5, 'T'); sp.set(3, 6, 'T'); sp.set(2, 6, 'T'); sp.set(3, 7, 't')
    elif view == 1:
        sp.rect(5, 4, 16, 4, 'T')
        sp.set(4, 5, 'T'); sp.set(3, 5, 'T'); sp.set(2, 6, 'T'); sp.set(1, 6, 'T'); sp.set(2, 7, 't'); sp.set(1, 8, 't')
    else:
        sp.rect(6, 4, 17, 4, 'T'); sp.rect(11, 5, 12, 5, 'T'); sp.rect(10, 6, 10, 9, 't'); sp.rect(13, 6, 13, 10, 'T')
    for x in range(8, 12):
        sp.set(x if view != 1 else x - 1, 2, 'L')


# ---------------- 강돌 (땅): 두건, 굵은 눈썹, 멜빵 작업복, 큰 장갑 ----------------
def gangdol(sp, view, step):
    if view == 0:
        legs_front(sp, step, 'O', 'b', wide=True)
        sp.rect(7, 15, 16, 22, 'K'); sp.rect(15, 16, 16, 22, 'k')
        sp.rect(9, 18, 14, 22, 'O'); sp.rect(9, 15, 9, 17, 'O'); sp.rect(14, 15, 14, 17, 'O')
        sp.set(9, 18, 'Y'); sp.set(14, 18, 'Y'); sp.rect(10, 19, 13, 20, 'o2')
        arms_front(sp, step, 'K', 2, hand='b', x_l=5, x_r=17, shade='k')
    elif view == 1:
        legs_side(sp, step, 'O', 'Q', 'b', 'b')
        sp.rect(9, 15, 15, 22, 'K'); sp.rect(12, 17, 15, 22, 'O'); sp.rect(12, 15, 12, 16, 'O')
        arm_side(sp, step, 'k', 2, hand='b')
        sw = {0: 0, 1: 1, 2: -1}[step]
        sp.rect(12 + sw, 19, 13 + sw, 20, 'S'); sp.rect(11 + sw, 21, 14 + sw, 21, 'b'); sp.rect(12 + sw, 20, 13 + sw, 20, 'b')
    else:
        legs_front(sp, step, 'O', 'b', wide=True)
        sp.rect(7, 15, 16, 22, 'K')
        sp.rect(9, 15, 9, 19, 'O'); sp.rect(14, 15, 14, 19, 'O'); sp.rect(9, 19, 14, 22, 'O')
        arms_front(sp, step, 'k', 2, hand='b', x_l=5, x_r=17, shade='K')
    if view == 0:
        sp.rect(4, 20 + (step == 2), 7, 21 + (step == 2), 'b'); sp.rect(16, 20 + (step == 1), 19, 21 + (step == 1), 'b')
    elif view == 2:
        sp.rect(4, 20 + (step == 2), 7, 21 + (step == 2), 'b'); sp.rect(16, 20 + (step == 1), 19, 21 + (step == 1), 'b')
    neck(sp, view)
    cx = 12 if view != 1 else 11.5
    sp.ellipse(cx, 7.8, 6.9, 6.4, 'H')
    bangs = lambda x: 6
    if view == 0:
        face_front(sp, bangs, 'grin')
        sp.rect(9, 7, 10, 7, 'h'); sp.rect(13, 7, 14, 7, 'h')         # 굵은 눈썹
    elif view == 1:
        face_side(sp, bangs, 'grin')
        sp.rect(15, 7, 17, 7, 'h')
    # 두건
    sp.ellipse(cx, 6.2, 7.2, 5.2, 'A', lambda x, y: y <= 5)
    sp.recolor('A', 'a', lambda x, y: y == 5 or (x >= 16 if view != 1 else x <= 6))
    sp.set(9 if view != 1 else 8, 2, 'Y'); sp.set(15 if view != 1 else 14, 3, 'Y')     # 두건 무늬
    if view == 2:
        sp.rect(11, 6, 12, 6, 'a'); sp.set(10, 7, 'A'); sp.set(13, 7, 'A'); sp.set(9, 8, 'A'); sp.set(14, 8, 'A')
    if view == 1:
        sp.rect(3, 5, 4, 6, 'a'); sp.set(2, 7, 'A')


LOOKS = {
    'hwarang': (hwarang, {
        'H': (240, 85, 44), 'h': (184, 50, 28), 'L': (255, 154, 90),
        'I': (226, 84, 31), 'i': (255, 190, 70),
        'R': (226, 58, 44), 'r': (164, 34, 26), 'K': (44, 44, 54), 'N': (52, 54, 76), 'n': (36, 38, 54)}),
    'sua': (sua, {
        'H': (66, 138, 232), 'h': (36, 88, 178), 'L': (160, 210, 255),
        'I': (40, 120, 220), 'i': (140, 220, 255),
        'C': (40, 92, 196), 'c': (26, 62, 140)}),
    'punghu': (punghu, {
        'H': (70, 182, 108), 'h': (38, 124, 72), 'L': (170, 240, 190),
        'I': (40, 160, 90), 'i': (170, 250, 190),
        'V': (66, 150, 108), 'v': (42, 104, 74), 'U': (232, 216, 172), 'n': (78, 84, 70), 'm': (58, 62, 52),
        'b': (138, 94, 52), 'T': (222, 255, 232), 't': (170, 220, 190)}),
    'gangdol': (gangdol, {
        'H': (120, 78, 46), 'h': (84, 52, 28), 'L': (170, 120, 80),
        'I': (170, 110, 40), 'i': (240, 200, 110),
        'A': (204, 168, 96), 'a': (160, 126, 66), 'K': (242, 232, 204), 'k': (212, 198, 164),
        'O': (96, 112, 70), 'Q': (70, 82, 50), 'o2': (76, 90, 56), 'b': (110, 70, 40)}),
}


def make_frame(draw, pal, view, step):
    sp = Sprite()
    draw(sp, view, step)
    if step != 0:
        sp.shift(-1, 23)
    sp.outline()
    return sp.image({**BASE, **pal})


def make_sheet(draw, pal):
    sheet = Image.new('RGBA', (W * 3, H * 3), (0, 0, 0, 0))
    for view in range(3):
        for step in range(3):
            sheet.paste(make_frame(draw, pal, view, step), (step * W, view * H))
    return sheet


# ---------------- 허수아비 ----------------
def scarecrow(hat, hat_dark, hurt=False):
    sp = Sprite()
    pal = {**BASE, 'T': hat, 't': hat_dark, 'K': (236, 212, 160), 'k': (204, 170, 110),
           'R': (160, 112, 63), 'r': (120, 80, 44), 'A': (230, 196, 122)}
    sp.rect(11, 22, 12, 29, 'R')                               # 막대
    sp.rect(3, 18, 20, 19, 'R'); sp.rect(3, 19, 20, 19, 'r')   # 팔
    sp.set(2, 18, 'A'); sp.set(21, 18, 'A'); sp.set(2, 19, 'A'); sp.set(21, 19, 'A')
    sp.ellipse(12, 21, 5.5, 4.5, 'k')                          # 자루 몸통
    sp.rect(11, 18, 12, 24, 'k'); sp.set(12, 20, 'r'); sp.set(12, 22, 'r')
    sp.ellipse(12, 13.5, 6.5, 5.6, 'K')                         # 자루 머리
    sp.recolor('K', 'k', lambda x, y: x >= 16)
    if hurt:
        for ex in (9, 14):
            sp.set(ex, 12, 'E'); sp.set(ex + 1, 13, 'E'); sp.set(ex + 1, 12, 'E'); sp.set(ex, 13, 'E')
    else:
        sp.rect(9, 12, 10, 13, 'E'); sp.rect(14, 12, 15, 13, 'E')
    for x in range(9, 16):
        sp.set(x, 16, 'E' if x % 2 else 'r')                     # 꿰맨 입
    sp.rect(5, 8, 18, 9, 'T'); sp.rect(5, 9, 18, 9, 't')       # 모자 챙
    sp.rect(9, 5, 15, 7, 'T'); sp.rect(10, 3, 14, 4, 'T'); sp.rect(11, 1, 13, 2, 'T'); sp.set(13, 0, 'T')
    sp.rect(14, 5, 15, 7, 't')
    sp.outline()
    return sp.image(pal)


DUMMIES = {
    'FIRE': ((255, 107, 61), (200, 64, 30)), 'WATER': ((61, 165, 255), (30, 110, 200)),
    'WIND': ((95, 211, 141), (50, 150, 90)), 'EARTH': ((200, 149, 74), (140, 98, 40)),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, (draw, pal) in LOOKS.items():
        path = os.path.join(OUT, f'{name}.png')
        make_sheet(draw, pal).save(path)
        print('saved', os.path.normpath(path))
    for el, (hat, dark) in DUMMIES.items():
        sheet = Image.new('RGBA', (W * 2, H), (0, 0, 0, 0))   # 칸 0 보통, 칸 1 맞음
        sheet.paste(scarecrow(hat, dark), (0, 0))
        sheet.paste(scarecrow(hat, dark, hurt=True), (W, 0))
        path = os.path.join(OUT, f'dummy-{el.lower()}.png')
        sheet.save(path)
        print('saved', os.path.normpath(path))
