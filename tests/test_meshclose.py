"""Fermeture de maillages : sphère trouée + sommets en double + pièce flottante + triangles retournés -> surface fermée."""
import numpy as np, sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[1]))
from forge import meshclose as mc

def sphere(n=24):
    u = np.linspace(0, np.pi, n); v = np.linspace(0, 2 * np.pi, 2 * n, endpoint=False)
    V = [[0, 1, 0]]
    for a in u[1:-1]:
        for b in v: V.append([np.sin(a) * np.cos(b), np.cos(a), np.sin(a) * np.sin(b)])
    V.append([0, -1, 0]); V = np.array(V); m = 2 * n; F = []
    for j in range(m): F.append([0, 1 + j, 1 + (j + 1) % m])
    for i in range(n - 3):
        for j in range(m):
            a = 1 + i * m + j; b = 1 + i * m + (j + 1) % m; c = a + m; d = b + m; F += [[a, c, b], [b, c, d]]
    last = len(V) - 1; base = 1 + (n - 3) * m
    for j in range(m): F.append([last, base + (j + 1) % m, base + j])
    return V, np.array(F)

def test_close():
    V, F = sphere(); assert mc.stats(V, F)["watertight"]
    rng = np.random.default_rng(1)
    # trous : on retire des triangles voisins (2 trous) ; faces retournées ; doublons ; pièce flottante ; sommets dupliqués
    ctr = V[F].mean(1); k1 = np.linalg.norm(ctr - [1, 0, 0], axis=1) < .35; k2 = np.linalg.norm(ctr - [0, -1, 0], axis=1) < .25
    F2 = F[~(k1 | k2)].copy(); fl = rng.random(len(F2)) < .1; F2[fl] = F2[fl][:, [0, 2, 1]]
    F2 = np.vstack([F2, F2[:20]])
    Vd = np.vstack([V, V[:50]]); F2[F2 == 3] = len(V) + 3     # un sommet dupliqué utilisé par certains triangles
    tri = np.array([[5, 5.1, 5], [5.1, 5, 5], [5, 5, 5.1]]).astype(float)
    Vd = np.vstack([Vd, tri]); F2 = np.vstack([F2, [len(Vd) - 3, len(Vd) - 2, len(Vd) - 1]])
    assert not mc.stats(Vd, F2)["watertight"]
    V3, F3, _, r = mc.close(Vd, F2)
    assert r["after"]["watertight"], r
    assert r["after"]["components"] == 1, r
    vol = np.einsum("ij,ij->i", V3[F3[:, 0]], np.cross(V3[F3[:, 1]], V3[F3[:, 2]])).sum() / 6
    assert 3.9 < vol < 4.4, vol      # volume de la sphère unité = 4,19
    # repli volumique
    V4, F4, _, r2 = mc.close(Vd, F2, mode="voxel", res=60)
    assert r2["after"]["watertight"]
    print("OK", mc.report_text(r))
test_close()
