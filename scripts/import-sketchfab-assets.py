#!/usr/bin/env python3
"""Extract only the approved Sketchfab geometry from the supplied FBX bundle.

Usage:
  python3 scripts/import-sketchfab-assets.py /path/to/ImageToStl.com_Untitled.zip

The source ZIP is never copied into the game. Selected meshes are combined,
recentered to a floor-contact pivot, normals are generated, and lightweight GLB
files are emitted under public/assets/3d/.
"""
from __future__ import annotations
import pathlib, struct, tempfile, zipfile, zlib, json
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "3d"
SELECTED = {
    "supermarket-gondola-shelf.glb": ["mesh-10.fbx","mesh-11.fbx","mesh-12.fbx","mesh-16.fbx","mesh-17.fbx","mesh-18.fbx"],
    "shopping-cart-a.glb": ["mesh-20.fbx","mesh-21.fbx","mesh-22.fbx"],
    "shopping-cart-b.glb": ["mesh-23.fbx","mesh-24.fbx","mesh-25.fbx"],
    "shallow-display-fixture.glb": ["mesh-154.fbx","mesh-155.fbx"],
}
COLORS = {
    "supermarket-gondola-shelf.glb": [0.42,0.46,0.48,1],
    "shopping-cart-a.glb": [0.38,0.43,0.45,1],
    "shopping-cart-b.glb": [0.38,0.43,0.45,1],
    "shallow-display-fixture.glb": [0.50,0.43,0.30,1],
}

class Node:
    def __init__(self,name,props,children): self.name=name; self.props=props; self.children=children

def prop(b,p):
    c=chr(b[p]); p+=1
    if c=='Y': return struct.unpack_from('<h',b,p)[0],p+2
    if c=='C': return bool(b[p]),p+1
    if c=='I': return struct.unpack_from('<i',b,p)[0],p+4
    if c=='F': return struct.unpack_from('<f',b,p)[0],p+4
    if c=='D': return struct.unpack_from('<d',b,p)[0],p+8
    if c=='L': return struct.unpack_from('<q',b,p)[0],p+8
    if c=='R':
        n=struct.unpack_from('<I',b,p)[0]; p+=4
        return b[p:p+n],p+n
    if c=='S':
        n=struct.unpack_from('<I',b,p)[0]; p+=4
        return b[p:p+n].decode('utf8','ignore'),p+n
    if c in 'fdilb':
        n=struct.unpack_from('<I',b,p)[0]
        enc=struct.unpack_from('<I',b,p+4)[0]
        comp=struct.unpack_from('<I',b,p+8)[0]
        p+=12; raw=b[p:p+comp]; p+=comp
        if enc==1: raw=zlib.decompress(raw)
        fmt={'f':'f','d':'d','i':'i','l':'q','b':'?'}[c]
        return list(struct.unpack('<'+fmt*n,raw)),p
    raise ValueError(c)

def nodes(b,start,end):
    out=[]; p=start
    while p+13<=end:
        eo,np,_=struct.unpack_from('<III',b,p); nl=b[p+12]
        if eo==0: break
        name=b[p+13:p+13+nl].decode('utf8','ignore'); q=p+13+nl; props=[]
        for _ in range(np):
            v,q=prop(b,q); props.append(v)
        out.append(Node(name,props,nodes(b,q,eo) if q<eo else [])); p=eo
    return out

def find(ns,name):
    for n in ns:
        if n.name==name: return n
        r=find(n.children,name)
        if r: return r

def read_mesh(path):
    b=path.read_bytes(); root=nodes(b,27,len(b)); g=find(root,'Geometry')
    v=np.asarray(find(g.children,'Vertices').props[0],dtype=np.float32).reshape(-1,3)
    raw=find(g.children,'PolygonVertexIndex').props[0]; tri=[]; cur=[]
    for x in raw:
        x=int(x); last=x<0; idx=-x-1 if last else x; cur.append(idx)
        if last:
            for i in range(1,len(cur)-1): tri += [cur[0],cur[i],cur[i+1]]
            cur=[]
    return v,np.asarray(tri,dtype=np.uint32)

def combine(paths):
    vs=[]; is_=[]; off=0
    for p in paths:
        v,i=read_mesh(p); vs.append(v); is_.append(i+off); off+=len(v)
    v=np.concatenate(vs); i=np.concatenate(is_)
    mn=v.min(0); mx=v.max(0)
    pivot=np.array([(mn[0]+mx[0])/2,mn[1],(mn[2]+mx[2])/2],dtype=np.float32)
    return v-pivot,i,pivot

def normals(v,i):
    n=np.zeros_like(v); a=v[i[::3]]; b=v[i[1::3]]; c=v[i[2::3]]
    cr=np.cross(b-a,c-a)
    for k in range(3): np.add.at(n,i[k::3],cr)
    l=np.linalg.norm(n,axis=1); l[l<1e-8]=1; n/=l[:,None]
    return n.astype(np.float32)

def glb(v,i,color):
    n=normals(v,i)
    inter=np.concatenate([v,n],axis=1).astype('<f4').tobytes()
    ib=i.astype('<u4').tobytes()
    iboff=(len(inter)+3)//4*4
    binbuf=inter+b'\0'*(iboff-len(inter))+ib+b'\0'*((-len(ib))%4)
    doc={
      "asset":{"version":"2.0","generator":"SUPERmarket Empire Sketchfab asset importer"},
      "scene":0,"scenes":[{"nodes":[0]}],
      "nodes":[{"mesh":0,"name":"SupermarketAsset"}],
      "meshes":[{"name":"SupermarketAsset","primitives":[{"attributes":{"POSITION":0,"NORMAL":1},"indices":2,"material":0}]}],
      "materials":[{"name":"Supermarket3DShared","pbrMetallicRoughness":{"baseColorFactor":color,"metallicFactor":0.2,"roughnessFactor":0.65},"doubleSided":True}],
      "accessors":[
        {"bufferView":0,"componentType":5126,"count":len(v),"type":"VEC3","min":v.min(0).tolist(),"max":v.max(0).tolist()},
        {"bufferView":0,"componentType":5126,"count":len(v),"type":"VEC3"},
        {"bufferView":1,"componentType":5125,"count":len(i),"type":"SCALAR"}],
      "bufferViews":[
        {"buffer":0,"byteOffset":0,"byteLength":len(inter),"byteStride":24,"target":34962},
        {"buffer":0,"byteOffset":iboff,"byteLength":len(ib),"target":34963}],
      "buffers":[{"byteLength":len(binbuf)}]
    }
    j=json.dumps(doc,separators=(',',':')).encode(); j+=b' '*((-len(j))%4)
    return b'glTF'+struct.pack('<II',2,12+8+len(j)+8+len(binbuf))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binbuf),0x004e4942)+binbuf

def main(zip_path):
    OUT.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(zip_path) as z: z.extractall(td)
        candidates=list(pathlib.Path(td).glob('**/mesh-1.fbx'))
        if not candidates: raise SystemExit("No mesh-1.fbx found in source ZIP")
        root=candidates[0].parent
        manifest=[]
        for out,files in SELECTED.items():
            v,i,pivot=combine([root/f for f in files])
            (OUT/out).write_bytes(glb(v,i,COLORS[out]))
            manifest.append({"asset":out,"sourceMeshes":files,"vertices":len(v),"triangles":len(i)//3,"pivot":pivot.tolist()})
        (OUT/'manifest.json').write_text(json.dumps({
          "source":"Super market low poly for free",
          "creator":"dasy444",
          "platform":"Sketchfab",
          "license":"Free Standard",
          "sourceUrl":"https://sketchfab.com/3d-models/super-market-low-poly-for-free-c14deca21a994978a8aa304561aced50",
          "assets":manifest
        },indent=2))

if __name__=='__main__':
    import sys
    if len(sys)!=2: raise SystemExit("usage: python3 scripts/import-sketchfab-assets.py /path/to/source.zip")
    main(pathlib.Path(sys[1]))
