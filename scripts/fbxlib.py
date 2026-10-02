"""Minimal binary-FBX geometry reader (vertices + polygon indices). The supplied ImageToStl export carries NO UVs and NO materials."""
import struct, zlib
import numpy as np

class Node:
    def __init__(self, name, props, children): self.name, self.props, self.children = name, props, children

def _prop(b, p):
    c = chr(b[p]); p += 1
    if c == 'Y': return struct.unpack_from('<h', b, p)[0], p + 2
    if c == 'C': return bool(b[p]), p + 1
    if c == 'I': return struct.unpack_from('<i', b, p)[0], p + 4
    if c == 'F': return struct.unpack_from('<f', b, p)[0], p + 4
    if c == 'D': return struct.unpack_from('<d', b, p)[0], p + 8
    if c == 'L': return struct.unpack_from('<q', b, p)[0], p + 8
    if c in 'RS':
        n = struct.unpack_from('<I', b, p)[0]; p += 4
        return (b[p:p + n] if c == 'R' else b[p:p + n].decode('utf8', 'ignore')), p + n
    if c in 'fdilb':
        n, enc, comp = struct.unpack_from('<III', b, p); p += 12
        raw = b[p:p + comp]; p += comp
        if enc == 1: raw = zlib.decompress(raw)
        return list(struct.unpack('<' + {'f': 'f', 'd': 'd', 'i': 'i', 'l': 'q', 'b': '?'}[c] * n, raw)), p
    raise ValueError(c)

def _nodes(b, start, end):
    out, p = [], start
    while p + 13 <= end:
        eo, npr, _ = struct.unpack_from('<III', b, p); nl = b[p + 12]
        if eo == 0: break
        name = b[p + 13:p + 13 + nl].decode('utf8', 'ignore'); q = p + 13 + nl; props = []
        for _ in range(npr):
            v, q = _prop(b, q); props.append(v)
        out.append(Node(name, props, _nodes(b, q, eo) if q < eo else [])); p = eo
    return out

def _find(ns, name):
    for n in ns:
        if n.name == name: return n
        r = _find(n.children, name)
        if r: return r

def read_mesh(path):
    """-> (vertices float32 Nx3, triangle indices uint32). Polygons are fan-triangulated."""
    b = open(path, 'rb').read(); root = _nodes(b, 27, len(b)); g = _find(root, 'Geometry')
    v = np.asarray(_find(g.children, 'Vertices').props[0], dtype=np.float32).reshape(-1, 3)
    tri, cur = [], []
    for x in _find(g.children, 'PolygonVertexIndex').props[0]:
        last = x < 0; cur.append(-x - 1 if last else x)
        if last:
            for i in range(1, len(cur) - 1): tri += [cur[0], cur[i], cur[i + 1]]
            cur = []
    return v, np.asarray(tri, dtype=np.uint32)

def has_uv(path):
    b = open(path, 'rb').read(); g = _find(_nodes(b, 27, len(b)), 'Geometry')
    return _find(g.children, 'LayerElementUV') is not None
