#!/usr/bin/env python3
"""Build the runtime 3D asset set from the supplied ImageToStl FBX bundle.

  python3 scripts/build-store-assets.py /path/to/ImageToStl.com_Untitled.zip

Writes to public/assets/3d/:
  fixtures.glb   shelf / fridge / chest freezer / display / carts / POS / sign (floor-pivot, length along +X, front +Z, metres)
  products.glb   one node per product-pack mesh, UV-mapped onto a grid cell of its department texture
  tex/*.jpg      the supplied textures, ASCII-named + resized
  inventory.json every one of the 250 meshes: role, usage, bounds (+ shelf anchors derived from geometry)

IMPORTANT FACTS ABOUT THE SOURCE: the FBX files contain geometry only (no UVs, no materials, no texture links) and keep their original
scene coordinates. Roles are therefore derived from shape + position + the repeated-instance structure; UVs are generated here.
"""
from __future__ import annotations
import json, pathlib, re, struct, sys, tempfile, zipfile
import numpy as np
from PIL import Image
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fbxlib import read_mesh

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "3d"
SLOT = 3.25            # metres of fixture length that fits one game tile (tile = 3.4 m)
PACK_MAX = 0.40        # product packs are modelled oversized in the source; normalise their longest face edge to this

# ---------------------------------------------------------------- textures (Cyrillic names -> ASCII) ----------------------
TEX = {  # ascii: (source stem, max px)
  "floor_tile": ("пол плита", 512), "floor_normal": ("NormalMap пол", 512), "wall": ("стена", 512), "ceiling": ("потолок", 512),
  "ceiling_normal": ("NormalMap потолок", 512), "shelf_paint": ("полки", 512), "fridge_panel": ("холод", 512), "fridge_normal": ("NormalMap хоод", 512),
  "pos_terminal": ("касса ап", 512), "legend": ("мб", 512),
  "p_chips": ("чипси", 1024), "p_ramen": ("рамены", 1024), "p_sushi": ("суши", 1024), "p_dumpling": ("пельмени", 1024), "p_candy": ("мармелад", 1024),
  "p_meat": ("мясо", 1024), "p_fruit": ("фрукты", 1024), "p_veg": ("трава", 1024), "p_household": ("бытовое", 1024), "p_misc": ("всякое", 1024), "p_goods": ("быт2", 1024),
}
# grid (cols, rows) of product images on each sheet, and the usable region (u0,v0,u1,v1) of the sheet
GRID = {"p_chips": (4, 5), "p_ramen": (4, 6), "p_sushi": (3, 4), "p_dumpling": (3, 3), "p_candy": (3, 4), "p_meat": (3, 6), "p_fruit": (3, 4),
        "p_veg": (2, 3), "p_household": (6, 8), "p_misc": (3, 6), "p_goods": (4, 8)}
REGION = {"p_goods": (0, 0, 1, 0.84)}

def unescape(s): return re.sub(r"#U([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)

def build_textures(src: pathlib.Path):
    (OUT / "tex").mkdir(parents=True, exist_ok=True)
    found = {unescape(p.name): p for p in list(src.glob("*.jpg")) + list(src.glob("*.png"))}
    used = {}
    for name, (stem, mx) in TEX.items():
        hit = next((p for n, p in found.items() if n.rsplit(".", 1)[0] == stem), None)
        if not hit: print("missing texture", stem); continue
        im = Image.open(hit).convert("RGB"); im.thumbnail((mx, mx), Image.LANCZOS)
        im.save(OUT / "tex" / f"{name}.jpg", quality=80, optimize=True); used[name] = {"source": hit.name, "size": im.size}
    return used

# ---------------------------------------------------------------- geometry helpers --------------------------------------
class P:  # one primitive = one material
    def __init__(s, v, i, mat, uv="box", cell=None): s.v, s.i, s.mat, s.uv, s.cell = v.astype(np.float32), i.astype(np.uint32), mat, uv, cell
def unweld(v, i): return v[i], np.arange(len(i), dtype=np.uint32)
def tri_centroids(v, i): return v[i.reshape(-1, 3)].mean(1)
def keep_tris(v, i, mask):
    t = i.reshape(-1, 3)[mask]; used, inv = np.unique(t, return_inverse=True)
    return v[used], inv.reshape(-1).astype(np.uint32)
def slice_axis(v, i, ax, lo, hi):
    c = tri_centroids(v, i)[:, ax]; return keep_tris(v, i, (c >= lo) & (c < hi))
def clip_axis(v, i, ax, lo, hi):
    """Sutherland-Hodgman clip of every triangle to lo<=coord<=hi on one axis (long quads must be cut, not just filtered by centroid)."""
    T = v[i.reshape(-1, 3)]; c = T[:, :, ax]
    inside = (c >= lo).all(1) & (c <= hi).all(1); outside = (c.max(1) < lo) | (c.min(1) > hi)
    keep = [T[inside]]; todo = T[~inside & ~outside]; out = []
    for tri in todo:
        poly = [p for p in tri]
        for plane, sgn in ((lo, 1), (hi, -1)):
            nxt = []
            for a, b in zip(poly, poly[1:] + poly[:1]):
                da, db = sgn * (a[ax] - plane), sgn * (b[ax] - plane)
                if da >= 0: nxt.append(a)
                if (da >= 0) != (db >= 0): nxt.append(a + (b - a) * (da / (da - db)))
            poly = nxt
            if len(poly) < 3: break
        for k in range(1, len(poly) - 1): out.append([poly[0], poly[k], poly[k + 1]])
    allT = np.concatenate(keep + ([np.array(out)] if out else [])) if (len(keep[0]) or out) else np.zeros((0, 3, 3), np.float32)
    return allT.reshape(-1, 3).astype(np.float32), np.arange(len(allT) * 3, dtype=np.uint32)
def rot_y(v, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a); o = v.copy()
    o[:, 0] = v[:, 0] * c + v[:, 2] * s; o[:, 2] = -v[:, 0] * s + v[:, 2] * c; return o
def decimate(v, i, cell):
    """Vertex clustering: merge vertices on a `cell`-metre grid, drop degenerate triangles."""
    q = np.floor(v / cell).astype(np.int64); _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1); nv = np.zeros((len(first), 3)); cnt = np.zeros(len(first)); np.add.at(nv, inv, v); np.add.at(cnt, inv, 1)
    t = inv[i.reshape(-1, 3)]; ok = (t[:, 0] != t[:, 1]) & (t[:, 1] != t[:, 2]) & (t[:, 0] != t[:, 2])
    return keep_tris((nv / cnt[:, None]).astype(np.float32), t[ok].reshape(-1).astype(np.uint32), np.ones(ok.sum(), bool))
def face_normals(v, i):
    t = v[i.reshape(-1, 3)]; n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]); l = np.linalg.norm(n, axis=1); l[l < 1e-9] = 1
    return n / l[:, None], l / 2  # unit normals, areas

def finish(pr: P, lo, hi, tile=1.2):
    """Unweld (flat shading) and generate UVs. uv modes: box = metric box projection (tileable); front = whole texture on the +/-thin-axis faces; cell = one sheet cell on those faces."""
    v, i = unweld(pr.v, pr.i); n, _ = face_normals(v, i); nn = np.repeat(n, 3, axis=0)
    uv = np.zeros((len(v), 2), np.float32); ax = np.abs(n).argmax(1); axv = np.repeat(ax, 3)
    if pr.uv == "box":
        for a, (u, w) in enumerate([(2, 1), (0, 2), (0, 1)]):
            m = axv == a; uv[m, 0] = v[m, u] / tile; uv[m, 1] = v[m, w] / tile
    else:
        ext = hi - lo; thin = int(np.argmin(ext)); u_ax, v_ax = [a for a in (0, 1, 2) if a != thin]
        u = (v[:, u_ax] - lo[u_ax]) / max(ext[u_ax], 1e-6); w = 1 - (v[:, v_ax] - lo[v_ax]) / max(ext[v_ax], 1e-6)
        front = axv == thin
        if pr.uv == "front": uv[:, 0], uv[:, 1] = np.where(front, u, 0.5), np.where(front, w, 0.5)
        else:
            c, r, cx, cy = pr.cell; u0, v0, u1, v1 = REGION.get(pr.mat, (0, 0, 1, 1)); cw, ch = (u1 - u0) / c, (v1 - v0) / r
            uu = u0 + (cx + 0.06 + 0.88 * u) * cw; vv = v0 + (cy + 0.06 + 0.88 * w) * ch  # inset a little so neighbours never bleed in
            cu, cv = u0 + (cx + 0.5) * cw, v0 + (cy + 0.5) * ch
            uv[:, 0], uv[:, 1] = np.where(front, uu, cu), np.where(front, vv, cv)
    return v, nn.astype(np.float32), uv, i

# ---------------------------------------------------------------- glTF writer ------------------------------------------
MATS = {  # name: baseColor, metallic, roughness, texture, normalTexture, alpha, uv tile (m)
  "shelf_paint": ([1, 1, 1, 1], .1, .75, "shelf_paint", None, 0), "shelf_metal": ([.62, .66, .70, 1], .55, .45, None, None, 0),
  "back_wall": ([1, 1, 1, 1], 0, .9, "wall", None, 0), "fridge_panel": ([1, 1, 1, 1], .35, .5, "fridge_panel", "fridge_normal", 0),
  "dark_plastic": ([.12, .13, .15, 1], .2, .6, None, None, 0), "chrome": ([.78, .8, .84, 1], .85, .3, None, None, 0),
  "glass": ([.70, .88, .98, .16], .0, .1, None, None, 1), "pos": ([1, 1, 1, 1], .1, .6, "pos_terminal", None, 0),
  "counter": ([.93, .94, .96, 1], .1, .55, "shelf_paint", None, 0), "cart": ([.72, .75, .80, 1], .6, .4, None, None, 0),
  "cart_handle": ([.95, .35, .22, 1], .1, .6, None, None, 0), "sign": ([1, 1, 1, 1], 0, .6, None, None, 0),
  "bin": ([.93, .94, .96, 1], .2, .5, "shelf_paint", None, 0),
}
for k in GRID: MATS[k] = ([1, 1, 1, 1], 0, .85, k, None, 0)

def pad4(b, c=b"\0"): return b + c * ((-len(b)) % 4)

class Glb:
    def __init__(s): s.bin = bytearray(); s.views = []; s.acc = []; s.meshes = []; s.nodes = []; s.mats = {}; s.imgs = {}; s.extras = {}
    def _view(s, data, target=None):
        s.bin += b"\0" * ((-len(s.bin)) % 4); off = len(s.bin); s.bin += data
        d = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target: d["target"] = target
        s.views.append(d); return len(s.views) - 1
    def _acc(s, arr, typ, comp, target, minmax=False):
        a = {"bufferView": s._view(arr.tobytes(), target), "componentType": comp, "count": len(arr), "type": typ}
        if minmax: a["min"], a["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        s.acc.append(a); return len(s.acc) - 1
    def mat(s, name):
        if name in s.mats: return s.mats[name]
        col, me, ro, tx, nm, al = MATS[name]; m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": col, "metallicFactor": me, "roughnessFactor": ro}}
        if tx: m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": s.tex(tx)}
        if nm: m["normalTexture"] = {"index": s.tex(nm)}
        if al: m["alphaMode"] = "BLEND"; m["doubleSided"] = True
        s.mats[name] = len(s.mats); s.mats_list = getattr(s, "mats_list", []) + [m]; return s.mats[name]
    def tex(s, name):
        if name not in s.imgs: s.imgs[name] = len(s.imgs)
        return s.imgs[name]
    def add(s, name, prims, tile_for=None):
        pl = []
        allv = np.concatenate([p.v for p in prims]); lo, hi = allv.min(0), allv.max(0)
        for p in prims:
            plo, phi = (p.v.min(0), p.v.max(0)) if p.uv != "box" else (lo, hi)
            v, n, uv, i = finish(p, plo, phi, (tile_for or {}).get(p.mat, 1.2))
            pl.append({"attributes": {"POSITION": s._acc(v, "VEC3", 5126, 34962, True), "NORMAL": s._acc(n, "VEC3", 5126, 34962), "TEXCOORD_0": s._acc(uv, "VEC2", 5126, 34962)},
                       "indices": s._acc(i, "SCALAR", 5125, 34963), "material": s.mat(p.mat)})
        s.meshes.append({"name": name, "primitives": pl}); s.nodes.append({"name": name, "mesh": len(s.meshes) - 1})
    def write(s, path):
        names = sorted(s.imgs, key=s.imgs.get)
        doc = {"asset": {"version": "2.0", "generator": "SUPERmarket Empire build-store-assets.py"}, "scene": 0, "scenes": [{"nodes": list(range(len(s.nodes)))}], "nodes": s.nodes,
               "meshes": s.meshes, "materials": getattr(s, "mats_list", []), "accessors": s.acc, "bufferViews": s.views, "buffers": [{"byteLength": len(s.bin)}],
               "images": [{"uri": f"tex/{n}.jpg"} for n in names], "textures": [{"source": k, "sampler": 0} for k in range(len(names))],
               "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}], "extras": s.extras}
        j = pad4(json.dumps(doc, separators=(",", ":")).encode(), b" "); b = pad4(bytes(s.bin))
        path.write_bytes(b"glTF" + struct.pack("<II", 2, 28 + len(j) + len(b)) + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(b), 0x004E4942) + b)
        return path.stat().st_size

# ---------------------------------------------------------------- main -------------------------------------------------
def levels_of(v, i, min_area=0.12):
    """Upward-facing horizontal surfaces -> [{y, x0,x1,z0,z1}] (the shelf boards products can stand on)."""
    n, a = face_normals(v, i); c = tri_centroids(v, i); up = (n[:, 1] > 0.98); out = {}
    for y, ar, cc, t in zip(c[up, 1], a[up], c[up], i.reshape(-1, 3)[up]):
        k = round(float(y) / 0.02) * 0.02; out.setdefault(k, []).append((ar, v[t]))
    res = []
    for y, items in sorted(out.items()):
        if sum(a for a, _ in items) < min_area: continue
        pts = np.concatenate([p for _, p in items]); res.append({"y": round(y, 3), "x0": round(float(pts[:, 0].min()), 3), "x1": round(float(pts[:, 0].max()), 3), "z0": round(float(pts[:, 2].min()), 3), "z1": round(float(pts[:, 2].max()), 3)})
    return res

def main(zip_path):
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        zipfile.ZipFile(zip_path).extractall(td)
        mesh1 = next(pathlib.Path(td).glob("**/mesh-1.fbx")); src = mesh1.parent
        used_tex = build_textures(src)  # textures sit in the zip root (textures/ holds numbered duplicates)
        M = {k: read_mesh(src / ("mesh.fbx" if k == 0 else f"mesh-{k}.fbx")) for k in range(250)}
    def get(ids): return [M[k] for k in ids]
    def merge(ids):
        vs, ix, off = [], [], 0
        for v, i in get(ids): vs.append(v); ix.append(i + off); off += len(v)
        return np.concatenate(vs), np.concatenate(ix)
    def bounds(ids): v, _ = merge(ids); return v.min(0), v.max(0)
    def to_slot(parts, rot=0.0, clip=None, decim=None, floor=True):
        """clip (axis, lo, hi) in SOURCE coordinates, then rotate about Y, then pivot at the floor-contact centre."""
        out = []
        for mat, ids2, mode in parts:
            v, i = merge(ids2)
            if clip: v, i = clip_axis(v, i, *clip)
            if decim and mat in decim and len(i): v, i = decimate(v, i, decim[mat])
            out.append([mat, v, i, mode])
        out = [o for o in out if len(o[2])]
        mids = np.concatenate([o[1] for o in out]); lo0, hi0 = mids.min(0), mids.max(0); m0 = (lo0 + hi0) / 2
        for o in out:
            if rot: o[1] = rot_y(o[1] - [m0[0], 0, m0[2]], rot) + [m0[0], 0, m0[2]]
        allv = np.concatenate([o[1] for o in out]); lo2, hi2 = allv.min(0), allv.max(0); c = (lo2 + hi2) / 2; piv = np.array([c[0], lo2[1] if floor else c[1], c[2]])
        return [(mat, v - piv, i, mode) for mat, v, i, mode in out]

    inv = {k: {"id": k, "file": "mesh.fbx" if k == 0 else f"mesh-{k}.fbx", "tris": len(M[k][1]) // 3, "size": (M[k][0].max(0) - M[k][0].min(0)).round(3).tolist(),
               "center": ((M[k][0].max(0) + M[k][0].min(0)) / 2).round(3).tolist(), "role": "unclassified", "usage": "unused", "note": ""} for k in range(250)}
    def tag(ids, role, usage, note=""):
        for k in ids: inv[k].update(role=role, usage=usage, note=note)
    fx, anchors = Glb(), {}
    def emit(g, name, parts):
        prims = [P(v, i, mat, mode) for mat, v, i, mode in parts]; g.add(name, prims)
        allv = np.concatenate([p.v for p in prims]); return allv.min(0), allv.max(0)

    # ---- gondola shelf: 10 body, 11 back panel, 12 shelf boards (5 identical runs: 10-12, 13-15, 33-35, 39-41, 45-47)
    def fixture(name, specs, rot=0.0, clip=None, decim=None):
        res = to_slot(specs, rot, clip, decim); lo, hi = emit(fx, name, res)
        off = 0; vs, ix = [], []
        for r in res: vs.append(r[1]); ix.append(r[2] + off); off += len(r[1])
        anchors[name] = {"size": (hi - lo).round(3).tolist(), "levels": levels_of(np.concatenate(vs), np.concatenate(ix))}
    def around(ids, ax, length=SLOT):
        lo, hi = bounds(ids); m = (lo[ax] + hi[ax]) / 2; return (ax, m - length / 2, m + length / 2)
    fixture("shelf_bay", [("shelf_paint", [10], "box"), ("back_wall", [11], "box"), ("shelf_metal", [12], "box")], clip=around([10, 11, 12], 0))
    tag([10, 11, 12, 13, 14, 15, 33, 34, 35, 39, 40, 41, 45, 46, 47], "gondola shelf (body / back panel / shelf boards)", "used", "5 identical runs; one 3.25 m bay is cut from the centre of mesh 10-12")
    tag([16, 17, 18, 29, 30, 31, 36, 37, 38, 42, 43, 44, 48, 49, 50], "gondola end-cap / header frame (wider than body)", "partial", "geometry kept in inventory only; end panels are generated at runtime so the 3.25 m bay closes cleanly")
    # ---- refrigerated wall unit: 55 plinth, 56 glass shell, 57 cabinet, 58 kick, 59 back; doors = handle(44t)/frame(32t)/glass(2t) triplets inside the unit's z-range
    flo, fhi = bounds([55, 56, 57, 58, 59]); doors = [k for k in range(51, 106) if inv[k]["tris"] in (44, 32, 2) and flo[2] - .05 < inv[k]["center"][2] < fhi[2] + .05 and abs(inv[k]["center"][0] - 13.3) < .5]
    h = [k for k in doors if inv[k]["tris"] == 44]; fr = [k for k in doors if inv[k]["tris"] == 32]; gl = [k for k in doors if inv[k]["tris"] == 2]
    zc = sorted(inv[k]["center"][2] for k in fr); pitch = np.diff(zc).mean(); z0 = zc[0] - pitch / 2  # a 3-door bay that starts on a door boundary
    fixture("fridge_bay", [("dark_plastic", [55], "box"), ("glass", [56], "box"), ("fridge_panel", [57, 58, 59], "box"), ("chrome", h, "box"), ("dark_plastic", fr, "box"), ("glass", gl, "box")],
            rot=90, clip=(2, z0 + 0.01, z0 + 3 * pitch - 0.01))
    tag([55, 56, 57, 58, 59], "refrigerated wall cabinet (plinth / glass shell / cabinet / kick / back)", "used", "east-wall unit rotated so doors face +Z; 3 doors = 3.24 m bay")
    tag(doors, "fridge door part (handle 44 tris / frame 32 / glass 2)", "used", "the 3 doors inside the cut bay are used")
    for ids in ([75, 76, 77, 78, 79], [92, 93, 94, 95, 96], [113, 114, 115, 116, 117], [130, 131, 132, 133, 134]): tag(ids, "refrigerated wall cabinet (duplicate instance)", "partial", "identical to 55-59; one instance is enough, the bay is instanced at runtime")
    tag([k for k in range(51, 144) if inv[k]["role"] == "unclassified" and inv[k]["tris"] in (44, 32, 2) and k not in doors], "fridge door part (duplicate instance)", "partial", "identical door parts for the other fridge units")
    # ---- chest freezer: 106 base, 108 body, 109 cover, 107 wire baskets (78k tris -> decimated). 145 group is the same product, shorter.
    fixture("freezer_chest", [("dark_plastic", [106], "box"), ("counter", [108], "box"), ("glass", [109], "box"), ("shelf_metal", [107], "box")], clip=around([106, 107, 108, 109], 0), decim={"shelf_metal": 0.05})
    tag([106, 107, 108, 109], "chest freezer with wire baskets (base / body / glass cover / baskets)", "used", "mesh 107 is 78k tris; decimated by vertex clustering to a mobile budget")
    tag([144, 145, 146, 147], "chest freezer, 5.3 m variant", "partial", "same design as 106-109 (47k tris); one variant is enough")
    # ---- shallow wall display: 154 frame, 155 shelves
    fixture("display_wall", [("shelf_paint", [154], "box"), ("shelf_metal", [155], "box")], clip=around([154, 155], 0))
    tag([154, 155], "shallow wall display / produce rack", "used", "")
    # ---- shopping carts (3 identical: parts basket/handle/wheels)
    for nm, ids in (("cart_a", [20, 21, 22]), ("cart_b", [23, 24, 25])):
        fixture(nm, [("cart", [ids[0]], "box"), ("cart_handle", [ids[1]], "box"), ("dark_plastic", [ids[2]], "box")])
    tag([20, 21, 22, 23, 24, 25], "shopping cart (basket / handle / wheels)", "used", ""); tag([26, 27, 28], "shopping cart (third copy)", "partial", "duplicate of 23-25")
    # ---- POS terminal: 248 screen, 249 scanner
    fixture("pos", [("pos", [248], "front"), ("dark_plastic", [249], "box")])
    tag([248], "POS screen (textured with the supplied cash-register photo)", "used", ""); tag([249], "barcode scanner / card reader", "used", "")
    # ---- checkout counter: slice of the 108 body, without wire baskets
    fixture("checkout_counter", [("counter", [108], "box"), ("dark_plastic", [106], "box")], clip=around([106, 108], 0, 1.9))
    # ---- sign board 151 (+face 149)
    fixture("sign_board", [("sign", [151], "front")]); tag([149, 151], "store sign board (name is drawn onto it at runtime)", "used", "")
    # ---- structure
    tag([148], "east wall slab (6.1 m x 15.9 m)", "partial", "walls are generated per tier so they fit any grid; textured with стена.jpg")
    tag([150], "structural pillar", "unused", "no pillar in the tile-grid layout"); tag([54, 60, 64, 65], "west wall window panels", "unused", "walls are procedural per tier")
    tag([0, 2, 4, 6, 8], "ceiling light housing (28.2 m)", "partial", "recreated as light bars at runtime, shown when the camera is low"); tag([3, 5, 7, 9], "ceiling light diffuser", "partial", "see above")
    tag([1], "ceiling louvre grid (8 rails)", "partial", "recreated as ceiling plane with потолок.jpg")
    tag([19, 32], "shelf tag clip (tiny)", "unused", "0.06 m parts; below readable size at game zoom")

    fx_size = fx.write(OUT / "fixtures.glb")

    # ---- product packs ------------------------------------------------------------------------------------------------
    DEPT = {}  # pack id -> (texture, role)
    for k in range(175, 187): DEPT[k] = ("p_chips", "chips bag")
    for k in range(187, 199): DEPT[k] = ("p_ramen", "instant-noodle pack")
    for k in range(199, 215): DEPT[k] = ("p_sushi" if k % 2 == 0 else "p_dumpling", "sushi tray" if k % 2 == 0 else "frozen dumpling pack")
    for k in list(range(152, 163)): DEPT[k] = ("p_candy", "candy bag")
    for k in [174, 176, 177, 178] + list(range(215, 225)): DEPT[k] = ("p_meat", "meat tray")
    for k in range(163, 174): DEPT[k] = ("p_household", "household bottle")
    for k in range(225, 237): DEPT[k] = ("p_misc" if k % 2 == 0 else "p_goods", "grocery box")
    for k in range(237, 248): DEPT[k] = ("p_fruit" if k % 2 == 0 else "p_veg", "produce box")
    pk = Glb(); rng = np.random.default_rng(7); cursor = {}
    for k, (texn, role) in sorted(DEPT.items()):
        v, i = M[k]; lo, hi = v.min(0), v.max(0); ext = hi - lo; s = PACK_MAX / max(ext[0], ext[1])
        v = (v - [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2]) * s
        c, r = GRID[texn]; n = cursor.get(texn, 0); cursor[texn] = n + 1
        cx, cy = (n * 5) % c, ((n * 5) // c + n) % r   # spread successive packs over different cells of the sheet
        pk.add(f"pack_{k}", [P(v, i, texn, "cell", (c, r, cx, cy))])
        inv[k].update(role=f"{role} ({texn[2:]})", usage="used", note=f"UV-mapped to cell ({cx},{cy}) of a {c}x{r} grid on {texn[2:]} sheet; scaled x{s:.3f}")
    pk_size = pk.write(OUT / "products.glb")
    json.dump({"source": "Super market low poly for free", "creator": "dasy444", "platform": "Sketchfab", "license": "Free Standard",
               "sourceUrl": "https://sketchfab.com/3d-models/super-market-low-poly-for-free-c14deca21a994978a8aa304561aced50", "slotLengthM": SLOT, "tileM": 3.4,
               "fixtures": {"bytes": fx_size, "anchors": anchors}, "products": {"bytes": pk_size, "departments": {t: [k for k, (tt, _) in DEPT.items() if tt == t] for t in GRID}},
               "textures": used_tex, "meshes": [inv[k] for k in range(250)]}, open(OUT / "inventory.json", "w"), indent=1, ensure_ascii=False)
    from collections import Counter
    print("fixtures.glb", fx_size, "bytes; products.glb", pk_size, "bytes;", Counter(m["usage"] for m in inv.values()))
    for n, a in anchors.items(): print(n, a["size"], [l["y"] for l in a["levels"]])

if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("usage: python3 scripts/build-store-assets.py /path/to/ImageToStl.com_Untitled.zip")
    main(pathlib.Path(sys.argv[1]))
