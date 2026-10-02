"use client";
/**
 * The 3D supermarket. Everything in the world is built from the supplied FBX meshes (converted to /assets/3d/*.glb by scripts/build-store-assets.py)
 * plus a few procedural helpers where the FBX bundle has no model (walls/floor, people, small decor). Game tiles are TILE metres square.
 * Gameplay stays in the Zustand store; this component only draws state and reports taps as tile coordinates.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AisleState, AisleType, CheckoutState, DecorState, RestockerState } from "@/types/game";
import { AISLE_DEFS } from "@/lib/constants";

export const TILE = 3.4;
export type Actor = { id: string; kind: "customer" | "cashier" | "restocker" | "cleaner" | "guard" | "manager"; x: number; y: number; cart?: boolean; angry?: boolean; thief?: boolean; scale?: number; seed: number };
export type Marker = { id: string; x: number; y: number; h?: number; html: string; cls?: string };
export type Float3D = { id: number; x: number; y: number; amt: string; age: number };
type Props = { cols: number; rows: number; tier: number; name: string; aisles: AisleState[]; checkouts: CheckoutState[]; restockers: RestockerState[]; decors: DecorState[];
  cleanliness: number; actors: Actor[]; markers: Marker[]; floats: Float3D[]; selected: { kind: string; id: string } | null; buildMode: boolean; onTile: (x: number, y: number) => void };

const FIXTURE: Record<AisleType, string> = { produce: "display_wall", bakery: "shelf_bay", electronics: "shelf_bay", refrigerated: "fridge_bay", freezer: "freezer_chest", deli: "freezer_chest" };
const DEPT: Record<AisleType, string[]> = { produce: ["p_fruit", "p_veg"], bakery: ["p_candy", "p_chips"], electronics: ["p_household", "p_goods"], refrigerated: ["p_sushi", "p_dumpling"], freezer: ["p_dumpling", "p_ramen"], deli: ["p_meat", "p_sushi"] };
const ACCENT: Record<AisleType, number> = { produce: 0x4ade80, bakery: 0xfb923c, electronics: 0x60a5fa, refrigerated: 0x22d3ee, freezer: 0xa5b4fc, deli: 0xf87171 };
const FLOOR_TINT: Record<AisleType, number> = { produce: 0xcdeccf, bakery: 0xf6dfc4, electronics: 0xcfe0f6, refrigerated: 0xcdeef2, freezer: 0xdadcf8, deli: 0xf5d3d3 };
const hash = (n: number) => { let x = Math.imul(n | 0, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; return (x % 100000) / 100000; };
const strHash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
const wp = (t: number) => (t + 0.5) * TILE;

type Assets = { fx: THREE.Group; pk: THREE.Group; inv: any };
let assetsP: Promise<Assets> | null = null;
function loadAssets(): Promise<Assets> {
  if (!assetsP) { const l = new GLTFLoader(); assetsP = Promise.all([l.loadAsync("/assets/3d/fixtures.glb"), l.loadAsync("/assets/3d/products.glb"), fetch("/assets/3d/inventory.json").then((r) => r.json())]).then(([f, p, inv]) => { for (const g of [f.scene, p.scene]) g.traverse((o: any) => { if (o.geometry) o.userData.shared = true; }); return { fx: f.scene, pk: p.scene, inv }; }); assetsP.catch(() => (assetsP = null)); }
  return assetsP;
}
function tex(url: string, repeat?: [number, number], srgb = true) {
  const t = new THREE.TextureLoader().load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(...repeat); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function labelTexture(text: string, bg: string, fg = "#fff", w = 512, h = 160) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d")!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(0, 0, w, h * 0.12); g.fillStyle = fg; g.font = `800 ${h * 0.52}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function blobTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, "rgba(15,23,42,.55)"); r.addColorStop(1, "rgba(15,23,42,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
const disposeTree = (o: THREE.Object3D) => o.traverse((c: any) => { if (c.geometry && !c.userData.shared) c.geometry.dispose(); });

export default function Store3DScene(props: Props) {
  const host = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), latest = useRef(props), eng = useRef<{ sync: () => void; cam: (a: string) => void } | null>(null);
  latest.current = props;
  useEffect(() => { eng.current?.sync(); });
  useEffect(() => {
    const el = host.current!, ov = overlay.current!; let dead = false, raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0xbfd6de);
    el.prepend(renderer.domElement); renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;border-radius:inherit";
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8e99a6, 1.25)); const sun = new THREE.DirectionalLight(0xfff4e0, 1.6); sun.position.set(-14, 26, 18); scene.add(sun); scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const world = new THREE.Group(), things = new THREE.Group(), blob = blobTexture(); scene.add(world, things);
    const blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }), blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const view = { tx: 0, tz: 0, yaw: 0, yawT: 0, pitch: 0.92, dist: 30, fit: 30, W: 20, D: 12 };
    let A: Assets | null = null, worldKey = "", layoutKey = "", fillKey = "", selKey = "";
    const ceiling = new THREE.Group(); scene.add(ceiling);
    const packMeshes = new Map<string, THREE.InstancedMesh>(); const packsGroup = new THREE.Group(); scene.add(packsGroup);
    const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.18 })); grid.position.y = 0.03; scene.add(grid);
    const hover = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 0.2, TILE - 0.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.35, depthWrite: false })); hover.position.y = 0.05; hover.visible = false; scene.add(hover);
    const ring = new THREE.Mesh(new THREE.RingGeometry(TILE * 0.46, TILE * 0.5, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfbbf24 })); ring.position.y = 0.06; ring.visible = false; scene.add(ring);

    // ---------------------------------------------------------------- people: instanced low-poly figures (no humans exist in the FBX bundle)
    const CAP = 128, mk = (g: THREE.BufferGeometry) => { const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), CAP); m.count = 0; m.frustumCulled = false; m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); scene.add(m); return m; };
    const torso = mk(new THREE.CapsuleGeometry(0.24, 0.5, 2, 8).translate(0, 1.1, 0)), head = mk(new THREE.IcosahedronGeometry(0.15, 1).translate(0, 1.67, 0)), hair = mk(new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.7, 0));
    const legL = mk(new THREE.BoxGeometry(0.14, 0.7, 0.16).translate(-0.09, -0.35, 0)), legR = mk(new THREE.BoxGeometry(0.14, 0.7, 0.16).translate(0.09, -0.35, 0)), shadowIM = new THREE.InstancedMesh(blobGeo, blobMat, CAP); shadowIM.frustumCulled = false; scene.add(shadowIM);
    const cartParts: THREE.InstancedMesh[] = [];
    const ROLE: Record<Actor["kind"], number> = { customer: 0, cashier: 0x2563eb, restocker: 0xf97316, cleaner: 0x14b8a6, guard: 0x1e293b, manager: 0x7c3aed };
    const PAL = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xec4899, 0x8b5cf6, 0x06b6d4, 0xf97316, 0x94a3b8, 0xa16207], SKIN = [0xf5d0b0, 0xd9a07a, 0x9a6a47, 0x6b4430, 0xefc3a0], HAIR = [0x1f1a17, 0x4a2c17, 0x8a5a2b, 0xc9a24a, 0x333333];
    const motion = new Map<string, { x: number; z: number; h: number; ph: number; seen: number }>();
    const tmp = new THREE.Object3D(), col = new THREE.Color();

    // ---------------------------------------------------------------- static world
    const matCache: Record<string, THREE.Material> = {};
    const stdMat = (k: string, c: number, r = 0.8, m = 0) => (matCache[k] ??= new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); return b; };
    function buildWorld(p: Props) {
      world.children.slice().forEach((c) => { world.remove(c); disposeTree(c); }); ceiling.clear();
      const W = p.cols * TILE, D = p.rows * TILE, H = 3.4; view.W = W; view.D = D;
      const floorMat = new THREE.MeshStandardMaterial({ map: tex("/assets/3d/tex/floor_tile.jpg", [W / 2.4, D / 2.4]), normalMap: tex("/assets/3d/tex/floor_normal.jpg", [W / 2.4, D / 2.4], false), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.55, metalness: 0.05 });
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat); floor.position.set(W / 2, 0, D / 2); world.add(floor);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, D + 80).rotateX(-Math.PI / 2), stdMat("asph", 0x6b7480, 1)); ground.position.set(W / 2, -0.04, D / 2 + 8); world.add(ground);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(W + 6, 5).rotateX(-Math.PI / 2), stdMat("pave", 0xcfd3d8, 0.95)); walk.position.set(W / 2, -0.02, D + 3); world.add(walk);
      const wallMap = tex("/assets/3d/tex/wall.jpg", [W / 3, 1.2]), tints = [0xffffff, 0xeaf4ff, 0xfff2dc], wallMat = new THREE.MeshStandardMaterial({ map: wallMap, color: tints[p.tier % 3], roughness: 0.9 });
      const wall = (w: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; world.add(m); const t = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.12), stdMat("trim" + p.tier, [0x38bdf8, 0x22c55e, 0xf59e0b][p.tier % 3], 0.5)); t.position.set(x, 0.11, z); t.rotation.y = ry; t.translateZ(0.06); world.add(t); };
      wall(W, W / 2, 0, 0); wall(D, 0, D / 2, Math.PI / 2); wall(D, W, D / 2, -Math.PI / 2);   // single-sided: walls facing the camera are culled, so the room is always open from the front
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.16, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
      const front = (x0: number, x1: number) => { const w = x1 - x0; const k = box(w, 0.9, 0.18, stdMat("knee", 0xf1f5f9, 0.6), (x0 + x1) / 2, 0, D); world.add(k); const g = new THREE.Mesh(new THREE.PlaneGeometry(w, H - 0.9), glass); g.position.set((x0 + x1) / 2, 0.9 + (H - 0.9) / 2, D); world.add(g); };
      front(TILE, W); const post = (x: number) => world.add(box(0.2, H, 0.2, stdMat("post", 0x334155, 0.4, 0.5), x, 0, D)); post(0.1); post(TILE); const lin = box(TILE, 0.3, 0.3, stdMat("lintel", 0x334155, 0.4, 0.5), TILE / 2, H - 0.3, D); world.add(lin);
      const mat = box(TILE - 0.4, 0.04, 1.6, stdMat("mat", 0x1f2937, 1), TILE / 2, 0, D - 0.4); world.add(mat);
      if (A) {   // store sign (mesh 151) on the back wall, name drawn on it
        const s = A.fx.getObjectByName("sign_board")!.clone(true) as THREE.Mesh; const sm = (s.material as THREE.MeshStandardMaterial).clone(); sm.map = labelTexture(p.name.toUpperCase(), "#1e40af"); sm.needsUpdate = true; s.material = sm;
        const bb = new THREE.Box3().setFromObject(s), sz = bb.getSize(new THREE.Vector3()), f = Math.min(1, (W * 0.5) / sz.x); s.scale.setScalar(f); s.position.set(W / 2, H - 0.3 - sz.y * f, 0.35 * f); world.add(s);
      }
      // ceiling is back-face only (invisible from above) with the supplied ceiling texture + light bars; hidden at steep pitch anyway
      const cm = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex("/assets/3d/tex/ceiling.jpg", [W / 2, D / 2]), side: THREE.FrontSide, roughness: 1 })); cm.position.set(W / 2, H + 0.6, D / 2); ceiling.add(cm);
      for (let r = 0; r < p.rows; r++) { const l = box(W * 0.9, 0.06, 0.3, new THREE.MeshBasicMaterial({ color: 0xffffff }), W / 2, H + 0.52, wp(r)); ceiling.add(l); }
      // department floor mats + grid
      const gp: number[] = []; for (let x = 0; x <= p.cols; x++) gp.push(x * TILE, 0, 0, x * TILE, 0, D); for (let z = 0; z <= p.rows; z++) gp.push(0, 0, z * TILE, W, 0, z * TILE); grid.geometry.dispose(); grid.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
      // dirt decals (cleanliness)
      const dirty = Math.max(0, 0.85 - p.cleanliness) / 0.85, nD = Math.floor(dirty * p.cols * p.rows * 1.2);
      for (let n = 0; n < nD; n++) { const d = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blob, color: 0x6b4f2a, transparent: true, depthWrite: false, opacity: 0.8 })); d.scale.setScalar(1.2 + hash(n * 3) * 1.2); d.position.set(hash(n * 7 + 1) * W, 0.02, hash(n * 11 + 5) * D); world.add(d); }
      const fit = Math.max(D * 1.25, (W * 1.0) / Math.max(0.8, camera.aspect)) / (2 * Math.tan((camera.fov * Math.PI) / 360)); view.fit = fit * 1.12; view.dist = view.fit; view.tx = W / 2; view.tz = D / 2 + 0.5;
    }

    // ---------------------------------------------------------------- fixtures per tile (shelves, fridges, checkouts, decor)
    const clone = (n: string) => A!.fx.getObjectByName(n)!.clone(true);
    function addBlob(g: THREE.Group, w: number, d: number, x = 0, z = 0) { const b = new THREE.Mesh(blobGeo, blobMat); b.scale.set(w, 1, d); b.position.set(x, 0.015, z); g.add(b); }
    const deptSign = (t: AisleType) => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), new THREE.MeshStandardMaterial({ map: labelTexture(`${AISLE_DEFS[t].emoji} ${AISLE_DEFS[t].name}`, "#" + ACCENT[t].toString(16).padStart(6, "0"), "#0f172a", 512, 116), roughness: 0.5 })); return m; };
    function buildThings(p: Props) {
      things.children.slice().forEach((c) => { things.remove(c); disposeTree(c); });
      const tint = (x: number, y: number, c: number) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE - 0.1, TILE - 0.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false })); m.position.set(wp(x), 0.012, wp(y)); things.add(m); };
      for (const a of p.aisles) {
        const g = new THREE.Group(); g.position.set(wp(a.x), 0, wp(a.y)); tint(a.x, a.y, FLOOR_TINT[a.type]);
        const f = clone(FIXTURE[a.type]); const single = FIXTURE[a.type] !== "shelf_bay"; f.position.z = single ? -0.8 : 0; g.add(f); addBlob(g, 3.8, 1.8, 0, single ? -0.5 : 0);
        const hex = ACCENT[a.type];
        if (a.level >= 3) g.add(box(3.25, 0.05, 0.12, new THREE.MeshBasicMaterial({ color: hex }), 0, single ? 2.3 : 2.32, single ? -0.45 : 0.55));        // L3: lit accent strip
        if (a.level >= 6) { const s = deptSign(a.type); s.position.set(0, 2.75, single ? -0.8 : 0); g.add(s); }                                              // L6: department header sign
        if (a.level >= 10) { for (const sx of [-1.7, 1.7]) g.add(box(0.1, 2.4, 0.1, stdMat("gold", 0xf5c542, 0.3, 0.8), sx, 0, single ? -0.8 : 0)); }        // L10: gold end posts
        if (!single) for (const sx of [-1.64, 1.64]) g.add(box(0.06, 2.0, 1.06, stdMat("endp", 0xf8fafc, 0.5), sx, 0, 0));                                     // close the cut bay
        things.add(g);
      }
      for (const k of p.checkouts) {
        const g = new THREE.Group(); g.position.set(wp(k.x), 0, wp(k.y)); tint(k.x, k.y, 0xe2e8f0); const c = clone("checkout_counter"); c.position.set(0, 0, 0.55); g.add(c);
        const pos = clone("pos"); pos.position.set(-0.3, 0.88, 0.55); pos.scale.setScalar(0.75); pos.rotation.y = Math.PI; g.add(pos);
        g.add(box(1.7, 0.05, 0.5, stdMat("belt", 0x111827, 0.9), 0, 0.88, 0.25));                                                                                // belt
        if (k.level >= 5) { const p2 = clone("pos"); p2.position.set(0.5, 0.88, 0.55); p2.scale.setScalar(0.75); p2.rotation.y = Math.PI; g.add(p2); }              // express: second scanner
        if (k.level >= 10) { g.add(box(2.1, 0.08, 1.3, new THREE.MeshBasicMaterial({ color: 0xfef08a }), 0, 2.6, 0.5)); for (const sx of [-1, 1]) g.add(box(0.06, 2.6, 0.06, stdMat("post", 0x334155, 0.4, 0.5), sx, 0, 0.9)); }
        addBlob(g, 2.4, 1.4, 0, 0.5);
        for (let i = 0; i < 3; i++) g.add(box(0.05, 0.9, 0.05, stdMat("stan", 0xb91c1c, 0.4, 0.4), -0.6 + (i % 2) * 1.3, 0, -0.6 - i * 0.3 + 0.0));   // queue guide posts
        things.add(g);
      }
      for (const r of p.restockers) { if (r.level <= 0) continue; const g = new THREE.Group(); g.position.set(wp(r.x), 0, wp(r.y)); tint(r.x, r.y, 0xfde7c8); const c = clone("cart_b"); c.rotation.y = 0.5; g.add(c); g.add(box(0.5, 0.35, 0.5, stdMat("crate", 0xd97706, 0.8), 0.9, 0, 0.3)); g.add(box(0.5, 0.35, 0.5, stdMat("crate", 0xd97706, 0.8), 0.9, 0.35, 0.3)); addBlob(g, 2, 1.5); things.add(g); }
      for (const d of p.decors) {
        const g = new THREE.Group(); g.position.set(wp(d.x), 0, wp(d.y)); const s = d.style ?? "plant", leaf = stdMat("leaf", 0x22a05a, 0.9), pot = stdMat("pot", 0xb45309, 0.7);
        if (s === "plant" || s === "plant-tall") { const h = s === "plant" ? 1 : 1.9; g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.45, 10), pot)).position.y = 0.22; for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 - i * 0.05, 1), leaf); b.position.set((i - 1) * 0.1, 0.55 + h * 0.3 * (i + 0.6), 0); g.add(b); } }
        else if (s === "bench") { g.add(box(1.6, 0.1, 0.5, stdMat("wood", 0xa16207, 0.8), 0, 0.45, 0)); for (const sx of [-0.7, 0.7]) g.add(box(0.1, 0.45, 0.45, stdMat("bench", 0x334155, 0.5, 0.4), sx, 0, 0)); g.add(box(1.6, 0.5, 0.08, stdMat("wood", 0xa16207, 0.8), 0, 0.55, -0.22)); }
        else if (s === "vending") { g.add(box(0.95, 1.9, 0.8, stdMat("vend", 0xdc2626, 0.4, 0.3), 0, 0, 0)); g.add(box(0.7, 1.1, 0.04, new THREE.MeshBasicMaterial({ color: 0xbfe6f5 }), 0, 0.55, 0.41)); }
        else if (s === "sign") { g.add(box(0.08, 1.5, 0.08, stdMat("post", 0x334155, 0.4, 0.5), 0, 0, 0)); const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.06), new THREE.MeshStandardMaterial({ map: labelTexture("SALE", "#dc2626", "#fff", 256, 160) })); b.position.y = 1.7; g.add(b); }
        else if (s === "baskets") { for (let i = 0; i < 3; i++) { const c = clone("cart_b"); c.scale.setScalar(0.8); c.position.set(0, i * 0.04, -0.3 + i * 0.35); g.add(c); } }
        else { g.add(box(1.2, 0.8, 0.6, stdMat("cdy", 0xec4899, 0.6), 0, 0, 0)); }
        addBlob(g, 1.4, 1.0); things.add(g);
      }
    }

    // ---------------------------------------------------------------- products: instanced packs placed on the fixture shelf boards found in the geometry
    const PLAN: Record<string, { sides: number; y: (l: number) => boolean; inset: number }> = { shelf_bay: { sides: 2, y: (l) => l > 0.3 && l < 2.0, inset: 0.14 }, display_wall: { sides: 1, y: (l) => l > 0.3 && l < 2.0, inset: 0.12 }, fridge_bay: { sides: 1, y: (l) => l > 0.4 && l < 2.3, inset: 0.18 }, freezer_chest: { sides: 1, y: (l) => l > 0.4 && l < 0.7, inset: 0.3 } };
    function slotsFor(a: AisleState) {
      const fx = FIXTURE[a.type], plan = PLAN[fx], anc = A!.inv.fixtures.anchors[fx], depts: Record<string, number[]> = A!.inv.products.departments, ids = DEPT[a.type].flatMap((t) => depts[t].slice(0, a.level >= 3 ? 4 : 3));
      const single = fx !== "shelf_bay", zOff = single ? -0.8 : 0, out: { id: number; m: THREE.Matrix4 }[] = []; let n = 0;
      const lv = (anc.levels as { y: number; x0: number; x1: number; z0: number; z1: number }[]).filter((l) => plan.y(l.y));
      for (const l of lv) for (let side = 0; side < plan.sides; side++) {
        const front = side === 0, z = (front ? l.z1 - plan.inset : l.z0 + plan.inset) + zOff, count = 9;
        for (let i = 0; i < count; i++) { const id = ids[(n * 7 + i * 3 + side) % ids.length]; tmp.position.set(-1.44 + i * 0.36 + hash(strHash(a.id) + n) * 0.03, l.y + 0.005, z); tmp.rotation.set(0, front ? 0 : Math.PI, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); out.push({ id, m: tmp.matrix.clone() }); n++; }
      }
      return out;
    }
    function buildProducts(p: Props) {
      const counts = new Map<number, number>(), root = new THREE.Matrix4();
      for (const a of p.aisles) {
        const slots = slotsFor(a); const pct = a.maxStock ? Math.max(0, Math.min(1, a.stock / a.maxStock)) : 0, show = pct <= 0 ? 0 : Math.max(1, Math.ceil(pct * slots.length));
        const order = slots.map((_, i) => i).sort((u, v) => hash(u * 31 + strHash(a.id)) - hash(v * 31 + strHash(a.id)));
        root.makeTranslation(wp(a.x), 0, wp(a.y));
        for (let k = 0; k < show; k++) { const s = slots[order[k]], key = "pack_" + s.id; let im = packMeshes.get(key); if (!im) { const src = A!.pk.getObjectByName(key) as THREE.Mesh; im = new THREE.InstancedMesh(src.geometry, src.material, 1400); im.frustumCulled = false; im.userData.shared = true; packMeshes.set(key, im); packsGroup.add(im); }
          const c = counts.get(s.id) ?? 0; im.setMatrixAt(c, new THREE.Matrix4().multiplyMatrices(root, s.m)); counts.set(s.id, c + 1); }
      }
      packMeshes.forEach((im, key) => { im.count = counts.get(Number(key.slice(5))) ?? 0; im.instanceMatrix.needsUpdate = true; });
    }

    // ---------------------------------------------------------------- people + carts
    function ensureCarts() { if (cartParts.length || !A) return; const c = A.fx.getObjectByName("cart_a")!; c.traverse((o: any) => { if (o.isMesh) { const im = new THREE.InstancedMesh(o.geometry, o.material, 64); im.count = 0; im.frustumCulled = false; im.userData.shared = true; scene.add(im); cartParts.push(im); } }); }
    function drawActors(dt: number, t: number) {
      const L = latest.current, seen = t; let n = 0, nc = 0; const set = (im: THREE.InstancedMesh, i: number, c: number) => { col.setHex(c); im.setColorAt(i, col); };
      for (const a of L.actors) {
        if (n >= CAP) break; let m = motion.get(a.id); const tx = wp(a.x), tz = wp(a.y);
        if (!m) { m = { x: tx, z: tz, h: Math.PI, ph: hash(a.seed) * 6, seen }; motion.set(a.id, m); } m.seen = seen;
        const dx = tx - m.x, dz = tz - m.z, dist = Math.hypot(dx, dz), k = 1 - Math.exp(-dt * 7); m.x += dx * k; m.z += dz * k; const sp = (dist * k) / Math.max(dt, 1e-3);
        if (dist > 0.05) { let dh = Math.atan2(dx, dz) - m.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); m.h += dh * (1 - Math.exp(-dt * 9)); }
        const walking = sp > 0.5; if (walking) m.ph += dt * 9; const bob = walking ? Math.abs(Math.sin(m.ph)) * 0.04 : 0, sc = a.scale ?? 1, sw = walking ? Math.sin(m.ph) * 0.5 : 0;
        const shirt = a.kind === "customer" ? (a.angry ? 0xdc2626 : a.thief ? 0x111827 : PAL[Math.floor(hash(a.seed) * PAL.length)]) : ROLE[a.kind], skin = SKIN[Math.floor(hash(a.seed + 1) * SKIN.length)], hr = a.kind === "guard" ? 0x0f172a : HAIR[Math.floor(hash(a.seed + 2) * HAIR.length)];
        tmp.rotation.set(0, m.h, 0); tmp.position.set(m.x, bob, m.z); tmp.scale.setScalar(sc * 0.95); tmp.updateMatrix(); torso.setMatrixAt(n, tmp.matrix); head.setMatrixAt(n, tmp.matrix); hair.setMatrixAt(n, tmp.matrix);
        set(torso, n, shirt); set(head, n, skin); set(hair, n, hr);
        const pants = a.kind === "guard" || a.kind === "manager" ? 0x1e293b : 0x334155; tmp.position.set(m.x, bob + 0.72 * sc * 0.95, m.z); tmp.rotation.set(0, m.h, 0); tmp.rotateX(sw); tmp.updateMatrix(); legL.setMatrixAt(n, tmp.matrix); set(legL, n, pants);
        tmp.rotation.set(0, m.h, 0); tmp.rotateX(-sw); tmp.updateMatrix(); legR.setMatrixAt(n, tmp.matrix); set(legR, n, pants);
        tmp.position.set(m.x, 0.01, m.z); tmp.rotation.set(0, 0, 0); tmp.scale.set(0.9, 1, 0.9); tmp.updateMatrix(); shadowIM.setMatrixAt(n, tmp.matrix);
        if (a.cart && cartParts.length && nc < 64) { tmp.position.set(m.x + Math.sin(m.h) * 0.75, 0, m.z + Math.cos(m.h) * 0.75); tmp.rotation.set(0, m.h + Math.PI, 0); tmp.scale.setScalar(1); tmp.updateMatrix(); cartParts.forEach((im) => im.setMatrixAt(nc, tmp.matrix)); nc++; }
        n++;
      }
      for (const im of [torso, head, hair, legL, legR, shadowIM]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
      cartParts.forEach((im) => { im.count = nc; im.instanceMatrix.needsUpdate = true; });
      if (motion.size > n + 40) motion.forEach((v, k) => { if (v.seen < seen - 3) motion.delete(k); });
    }

    // ---------------------------------------------------------------- DOM markers (level badges, queue tags, bubbles, +$ floats) projected every frame
    const pool = new Map<string, HTMLDivElement>(), v3 = new THREE.Vector3();
    function drawMarkers() {
      const L = latest.current, w = el.clientWidth, h = el.clientHeight, used = new Set<string>(); const place = (id: string, x: number, y: number, hh: number, html: string, cls: string, extra?: (d: HTMLDivElement) => void) => {
        v3.set(wp(x), hh, wp(y)).project(camera); let d = pool.get(id); if (!d) { d = document.createElement("div"); pool.set(id, d); ov.appendChild(d); } if (d.dataset.h !== html) { d.innerHTML = html; d.dataset.h = html; } d.className = "m3d " + cls;
        const off = v3.z > 1 ? "none" : "block"; d.style.display = off; d.style.transform = `translate(-50%,-100%) translate(${((v3.x + 1) / 2) * w}px,${((1 - v3.y) / 2) * h}px)`; extra?.(d); used.add(id); };
      for (const m of L.markers) place("k" + m.id, m.x, m.y, m.h ?? 2.5, m.html, m.cls ?? "");
      for (const f of L.floats) place("f" + f.id, f.x, f.y, 2.2 + f.age * 1.4, `+${f.amt}`, "m3d-float", (d) => { d.style.opacity = String(Math.min(1, 1.6 - f.age / 1.2)); });
      pool.forEach((d, k) => { if (!used.has(k)) { d.remove(); pool.delete(k); } });
    }

    // ---------------------------------------------------------------- camera + input
    const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
    const toTile = (cx: number, cy: number) => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(plane, hit)) return null; const x = Math.floor(hit.x / TILE), y = Math.floor(hit.z / TILE), L = latest.current; return x >= 0 && y >= 0 && x < L.cols && y < L.rows ? { x, y } : null; };
    const ptrs = new Map<number, { x: number; y: number }>(); let down: { x: number; y: number; t: number; moved: boolean } | null = null, pinch = 0, twist = 0;
    const clampView = () => { view.tx = Math.max(0, Math.min(view.W, view.tx)); view.tz = Math.max(0, Math.min(view.D + 2, view.tz)); view.dist = Math.max(view.fit * 0.32, Math.min(view.fit * 1.25, view.dist)); view.pitch = Math.max(0.5, Math.min(1.25, view.pitch)); };
    const pan = (dx: number, dy: number) => {   // content follows the finger: right=(cos,-sin) on the ground, forward=(-sin,-cos)
      const k = (2 * view.dist * Math.tan((camera.fov * Math.PI) / 360)) / el.clientHeight, c = Math.cos(view.yaw), s = Math.sin(view.yaw), kf = k / Math.sin(view.pitch);
      view.tx += -c * dx * k - s * dy * kf; view.tz += s * dx * k - c * dy * kf;
    };
    const cv = renderer.domElement;
    cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; else { down = null; const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); twist = Math.atan2(b.y - a.y, b.x - a.x); } });
    cv.addEventListener("pointermove", (e) => {
      const prev = ptrs.get(e.pointerId); if (!prev) { if (latest.current.buildMode && e.pointerType === "mouse") { const t = toTile(e.clientX, e.clientY); hover.visible = !!t; if (t) hover.position.set(wp(t.x), 0.05, wp(t.y)); } return; }
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x); view.dist *= pinch / Math.max(d, 1); view.yawT -= ang - twist; view.yaw = view.yawT; pinch = d; twist = ang; clampView(); return; }
      if (down && !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.moved = true;
      if (down?.moved) { if (e.buttons === 2 || e.shiftKey) { view.yawT -= dx * 0.01; view.yaw = view.yawT; view.pitch += dy * 0.006; } else pan(dx, dy); clampView(); }
    });
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); if (down && !down.moved && performance.now() - down.t < 500) { const t = toTile(e.clientX, e.clientY); if (t) latest.current.onTile(t.x, t.y); } if (ptrs.size === 0) down = null; };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => { e.preventDefault(); view.dist *= Math.exp(e.deltaY * 0.0012); clampView(); }, { passive: false });

    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    const sync = () => {
      const L = latest.current; if (!A) return;
      const wk = `${L.cols}x${L.rows}|${L.tier}|${L.name}|${Math.round(L.cleanliness * 8)}`; if (wk !== worldKey) { worldKey = wk; buildWorld(L); layoutKey = ""; }
      const lk = [...L.aisles.map((a) => `${a.id}${a.type}${a.x},${a.y}:${Math.min(a.level, 10) >= 6 ? 3 : a.level >= 3 ? 2 : 1}${a.level >= 10 ? "g" : ""}`), ...L.checkouts.map((k) => `${k.id}${k.x},${k.y}:${k.level >= 10 ? 3 : k.level >= 5 ? 2 : 1}`), ...L.restockers.map((r) => `${r.id}${r.x},${r.y}${r.level > 0}`), ...L.decors.map((d) => `${d.id}${d.x},${d.y}${d.style}`)].join("|");
      if (lk !== layoutKey) { layoutKey = lk; buildThings(L); fillKey = ""; }
      const fk = L.aisles.map((a) => `${a.id}:${a.maxStock ? Math.round((a.stock / a.maxStock) * 14) : 0}:${a.level >= 3}`).join("|") + layoutKey.length; if (fk !== fillKey) { fillKey = fk; buildProducts(L); }
      const sk = `${L.selected?.id ?? ""}${L.buildMode}`; if (sk !== selKey) { selKey = sk; grid.visible = L.buildMode; hover.visible = false; const s = L.selected && [...L.aisles, ...L.checkouts, ...L.restockers, ...L.decors].find((i) => i.id === L.selected!.id); ring.visible = !!s; if (s) ring.position.set(wp(s.x), 0.06, wp(s.y)); }
    };
    eng.current = { sync, cam: (a) => { if (a === "l") view.yawT += Math.PI / 4; if (a === "r") view.yawT -= Math.PI / 4; if (a === "in") view.dist *= 0.8; if (a === "out") view.dist *= 1.25; if (a === "home") { view.dist = view.fit; view.tx = view.W / 2; view.tz = view.D / 2 + 0.5; view.yawT = 0; view.pitch = 0.92; } clampView(); } };
    loadAssets().then((a) => { if (dead) return; A = a; ensureCarts(); sync(); }).catch((e) => console.error("3D assets failed to load", e));

    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000); last = now; if (document.hidden) return;
      view.yaw += (view.yawT - view.yaw) * (1 - Math.exp(-dt * 8)); const cp = Math.cos(view.pitch);
      camera.position.set(view.tx + view.dist * Math.sin(view.yaw) * cp, view.dist * Math.sin(view.pitch), view.tz + view.dist * Math.cos(view.yaw) * cp); camera.lookAt(view.tx, 0, view.tz);
      ceiling.visible = view.pitch < 0.62; if (A) { drawActors(dt, now / 1000); } camera.updateMatrixWorld(); drawMarkers(); renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); pool.forEach((d) => d.remove()); eng.current = null; };
  }, []);
  const b = (a: string, t: string, l: string) => <button type="button" className="cam3d-btn" aria-label={l} title={l} onClick={() => eng.current?.cam(a)}>{t}</button>;
  return <div ref={host} className="stage3d"><div ref={overlay} className="m3d-layer" /><div className="cam3d">{b("l", "⟲", "Rotate left")}{b("r", "⟳", "Rotate right")}{b("in", "+", "Zoom in")}{b("out", "−", "Zoom out")}{b("home", "⌂", "Reset view")}</div></div>;
}
