/**
 * Store navigation. One source of truth for "where can people walk", derived from whatever the player has placed.
 *
 * Coordinates are TILE-CENTRE coordinates, the same space the simulation and the 3D scene use: tile (i, j) is centred on (i, j) and spans
 * [i-0.5, i+0.5] on both axes. The street is at y > rows - 0.5 and the shop door is the middle of the south edge of the entrance tile (0, rows-1).
 *
 * Nothing in here knows about specific shelves or routes. A layout goes in (item tiles), a blocked-tile grid comes out, and every route is a search
 * on that grid from wherever the walker currently stands, so moving a shelf changes the routes with no waypoints to edit.
 */
export interface Pt { x: number; y: number }
/** Tiles per second. A tile is ~3.4 m, so 0.8 is roughly twice a real stroll: lively on screen without looking like a sprint. */
export const WALK_SPEED = 0.8;
/** Body radius used for clearance when smoothing a route (tiles, ~0.7 m). */
export const AGENT_R = 0.2;
export const MAX_QUEUE_SLOTS = 24;

export interface NavGrid { cols: number; rows: number; blocked: Uint8Array; hash: number; version: number }
export interface Stand extends Pt { fx: number; fy: number }
export interface Layout {
  grid: NavGrid; version: number;
  /** BFS tile distances between the entrance "E", shelves and checkouts (Infinity = unreachable). Used to plan trips. */
  dist: Record<string, Record<string, number>>;
  /** Free tiles near each checkout (caps its queue). */
  spots: Record<string, number>;
  /** Sales boost per shelf from decor next to it. */
  boost: Record<string, number>;
  /** Tiles reachable on foot from the door (1 = reachable). */
  reach: Uint8Array;
  /** Standing points in front of each shelf / checkout / restocker desk that a walker can reach, with the direction they face. */
  access: Record<string, Stand[]>;
  /** Ordered queue positions for each checkout: slot 0 is the till, higher slots line up behind it along open floor. */
  slots: Record<string, Pt[]>;
  /** Reachable floor tiles (for wandering staff). */
  floor: Pt[];
}

export const doorOf = (rows: number): Pt => ({ x: 0, y: rows - 0.5 });
export const entranceTile = (rows: number): Pt => ({ x: 0, y: rows - 1 });
/** Where people appear on the pavement / disappear to, spread a little by id so they don't stack. */
export const streetPoint = (rows: number, seed: number): Pt => ({ x: -0.9 + ((((seed | 0) * 2654435761) >>> 0) % 1000) / 1000 * 2.0, y: rows + 0.75 });

const N4: [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];       // north first: queues form away from the back wall
const N8: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];

export const tileIdx = (g: NavGrid, i: number, j: number) => j * g.cols + i;
export const inGridTile = (g: NavGrid, i: number, j: number) => i >= 0 && j >= 0 && i < g.cols && j < g.rows;
export const isFree = (g: NavGrid, i: number, j: number) => inGridTile(g, i, j) && g.blocked[tileIdx(g, i, j)] === 0;
export const tileOf = (v: number) => Math.floor(v + 0.5);

export function layoutHash(cols: number, rows: number, items: { x: number; y: number; id?: string }[][]): number {
  let h = 2166136261 ^ (cols * 31 + rows);
  items.forEach((list, k) => { h = Math.imul(h ^ (0xa5 + k), 16777619); for (const i of list) { h = Math.imul(h ^ (i.x + 1), 16777619); h = Math.imul(h ^ (i.y + 1) + 977, 16777619); if (i.id) for (let c = 0; c < i.id.length; c++) h = Math.imul(h ^ i.id.charCodeAt(c), 16777619); } });
  return h >>> 0;
}

export function buildGrid(cols: number, rows: number, blockers: Pt[], hash: number, version: number): NavGrid {
  const blocked = new Uint8Array(cols * rows);
  for (const b of blockers) if (b.x >= 0 && b.y >= 0 && b.x < cols && b.y < rows) blocked[b.y * cols + b.x] = 1;
  blocked[(rows - 1) * cols] = 0; // the entrance tile can never be built on
  return { cols, rows, blocked, hash, version };
}

/** Does a disc of radius r centred on p overlap a blocked tile or the outer wall? */
function discHits(g: NavGrid, px: number, py: number, r: number): boolean {
  const i0 = Math.floor(px - r + 0.5), i1 = Math.floor(px + r + 0.5), j0 = Math.floor(py - r + 0.5), j1 = Math.floor(py + r + 0.5);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (isFree(g, i, j)) continue;
    const dx = Math.max(Math.abs(px - i) - 0.5, 0), dy = Math.max(Math.abs(py - j) - 0.5, 0);
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
export function segmentClear(g: NavGrid, a: Pt, b: Pt, r = AGENT_R): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(len / 0.1));
  for (let k = 0; k <= n; k++) { const f = k / n; if (discHits(g, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, r)) return false; }
  return true;
}

/** Dijkstra over free tiles (8-way, no corner cutting). Grids are tiny (<= ~80 tiles) so a linear scan beats a heap. Returns tile indices start..goal. */
function tileRoute(g: NavGrid, start: number, goals: Set<number>): number[] | null {
  const n = g.cols * g.rows, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[start] = 0;
  for (;;) {
    let u = -1, best = Infinity; for (let k = 0; k < n; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
    if (u < 0) return null;
    if (goals.has(u)) { const out: number[] = []; for (let k = u; k >= 0; k = prev[k]) out.push(k); return out.reverse(); }
    done[u] = 1; const ui = u % g.cols, uj = (u / g.cols) | 0;
    for (const [dx, dy, w] of N8) {
      const vi = ui + dx, vj = uj + dy; if (!isFree(g, vi, vj)) continue;
      if (dx !== 0 && dy !== 0 && (!isFree(g, ui + dx, uj) || !isFree(g, ui, uj + dy))) continue;
      const v = tileIdx(g, vi, vj); if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
}
/** Nearest free tile to a blocked one (e.g. the player built on the spot where someone is standing). Flood ignores obstacles. */
function nearestFree(g: NavGrid, i: number, j: number): number {
  const seen = new Set<number>(), q: number[] = [];
  const ci = Math.max(0, Math.min(g.cols - 1, i)), cj = Math.max(0, Math.min(g.rows - 1, j)); q.push(tileIdx(g, ci, cj)); seen.add(q[0]);
  for (let h = 0; h < q.length; h++) { const u = q[h], ui = u % g.cols, uj = (u / g.cols) | 0; if (isFree(g, ui, uj)) return u;
    for (const [dx, dy] of N4) { const vi = ui + dx, vj = uj + dy; if (inGridTile(g, vi, vj)) { const v = tileIdx(g, vi, vj); if (!seen.has(v)) { seen.add(v); q.push(v); } } } }
  return -1;
}

/** String-pull a tile route into the fewest waypoints that still keep AGENT_R clear of every blocked tile. */
function pull(g: NavGrid, pts: Pt[]): Pt[] {
  const out: Pt[] = []; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !segmentClear(g, pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
  return out;
}
export interface Route { path: Pt[]; to: Pt }
/**
 * Route from a position to the cheapest of `targets` (points that must lie on free tiles). Returns waypoints to walk through, or null when none
 * of them can be reached. Always starts from `from`, never from a stored route.
 */
export function findRoute(g: NavGrid, from: Pt, targets: Pt[]): Route | null {
  if (!targets.length) return null;
  const goalTile = new Map<number, Pt>(); for (const t of targets) { const ti = tileOf(t.x), tj = tileOf(t.y); if (isFree(g, ti, tj) && !goalTile.has(tileIdx(g, ti, tj))) goalTile.set(tileIdx(g, ti, tj), t); }
  if (!goalTile.size) return null;
  let si = tileOf(from.x), sj = tileOf(from.y), lead: Pt[] = [];
  if (!isFree(g, si, sj)) { const e = nearestFree(g, si, sj); if (e < 0) return null; si = e % g.cols; sj = (e / g.cols) | 0; lead = [{ x: si, y: sj }]; }
  const r = tileRoute(g, tileIdx(g, si, sj), new Set(goalTile.keys())); if (!r) return null;
  const to = goalTile.get(r[r.length - 1])!;
  const pts: Pt[] = [from, ...lead, ...r.slice(1, -1).map((k) => ({ x: k % g.cols, y: (k / g.cols) | 0 })), to];
  // the lead-in tile centre stays a hard waypoint so someone standing inside a new obstacle steps out the shortest way
  const path = lead.length ? [lead[0], ...pull(g, [lead[0], ...pts.slice(2)])] : pull(g, pts);
  return { path, to };
}
export const routeLength = (from: Pt, path: Pt[]) => { let L = 0, p = from; for (const q of path) { L += Math.hypot(q.x - p.x, q.y - p.y); p = q; } return L; };

/** Advance along a path by `d` tiles. Returns the new position, waypoint index and whether the end was reached. */
export function advance(x: number, y: number, path: Pt[], pi: number, d: number): { x: number; y: number; pi: number; done: boolean } {
  while (pi < path.length && d > 0) {
    const w = path[pi], dx = w.x - x, dy = w.y - y, len = Math.hypot(dx, dy);
    if (len <= d) { x = w.x; y = w.y; d -= len; pi++; } else { x += (dx / len) * d; y += (dy / len) * d; d = 0; }
  }
  return { x, y, pi, done: pi >= path.length };
}

function bfsDist(g: NavGrid, src: Pt[]): Int32Array {
  const d = new Int32Array(g.cols * g.rows).fill(-1), q: number[] = [];
  for (const s of src) if (isFree(g, s.x, s.y)) { const k = tileIdx(g, s.x, s.y); if (d[k] < 0) { d[k] = 0; q.push(k); } }
  for (let h = 0; h < q.length; h++) { const u = q[h], ui = u % g.cols, uj = (u / g.cols) | 0;
    for (const [dx, dy] of N4) if (isFree(g, ui + dx, uj + dy)) { const v = tileIdx(g, ui + dx, uj + dy); if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } } }
  return d;
}

/** Reachable standing points beside a blocked tile, each 0.22 tiles into the neighbouring tile, plus the direction to face the tile. */
export function standPoints(g: NavGrid, reach: Uint8Array | null, it: Pt): Stand[] {
  return N4.flatMap(([dx, dy]) => { const i = it.x + dx, j = it.y + dy; if (!isFree(g, i, j) || (reach && !reach[tileIdx(g, i, j)])) return []; return [{ x: i - dx * 0.22, y: j - dy * 0.22, fx: -dx, fy: -dy }]; });
}

/** Positions for a queue: slot 0 at the till, then a chain of open tiles leading away from it, two people per tile. */
function queueChain(g: NavGrid, k: Pt, reach: Uint8Array, entrance: Pt): Pt[] {
  let head: [number, number] | null = null, dir: [number, number] = [0, -1];
  for (const [dx, dy] of N4) { const i = k.x + dx, j = k.y + dy; if (isFree(g, i, j) && reach[tileIdx(g, i, j)] && !(i === entrance.x && j === entrance.y)) { head = [i, j]; dir = [dx, dy]; break; } }
  if (!head) { for (const [dx, dy] of N4) { const i = k.x + dx, j = k.y + dy; if (isFree(g, i, j) && reach[tileIdx(g, i, j)]) { head = [i, j]; dir = [dx, dy]; break; } } }
  if (!head) return [];
  const tiles: [number, number][] = [head], seen = new Set<number>([tileIdx(g, head[0], head[1]), tileIdx(g, k.x, k.y)]);
  while (tiles.length * 2 < MAX_QUEUE_SLOTS && tiles.length < 12) {
    const [ci, cj] = tiles[tiles.length - 1], left: [number, number] = [dir[1], -dir[0]], right: [number, number] = [-dir[1], dir[0]];
    let moved = false;
    for (const [dx, dy] of [dir, left, right]) { const i = ci + dx, j = cj + dy;
      if (isFree(g, i, j) && reach[tileIdx(g, i, j)] && !seen.has(tileIdx(g, i, j)) && !(i === entrance.x && j === entrance.y)) { tiles.push([i, j]); seen.add(tileIdx(g, i, j)); dir = [dx, dy]; moved = true; break; } }
    if (!moved) break;
  }
  const poly: Pt[] = [{ x: head[0] + (k.x - head[0]) * 0.12, y: head[1] + (k.y - head[1]) * 0.12 }, ...tiles.slice(1).map(([i, j]) => ({ x: i, y: j }))];
  const slots: Pt[] = []; let seg = 0, along = 0;
  for (let s = 0; s < MAX_QUEUE_SLOTS; s++) {
    const want = s * 0.5; // tiles of queue per person: two to a tile
    while (seg < poly.length - 1) { const L = Math.hypot(poly[seg + 1].x - poly[seg].x, poly[seg + 1].y - poly[seg].y); if (want - along <= L) break; along += L; seg++; }
    if (seg >= poly.length - 1) { slots.push(poly[poly.length - 1]); continue; }
    const a = poly[seg], b = poly[seg + 1], L = Math.hypot(b.x - a.x, b.y - a.y) || 1, f = Math.max(0, Math.min(1, (want - along) / L));
    slots.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return slots;
}

let cache: Layout | null = null, versionCounter = 0;
/** Rebuilds only when the layout actually changed (hash of tile positions), and bumps `version` so walkers know to re-route. */
export function analyzeStore(cols: number, rows: number, aisles: (Pt & { id: string })[], checkouts: (Pt & { id: string })[], restockers: (Pt & { id?: string })[], decors: Pt[]): Layout {
  const hash = layoutHash(cols, rows, [aisles, checkouts, restockers, decors]);
  if (cache && cache.grid.hash === hash) return cache;
  const g = buildGrid(cols, rows, [...aisles, ...checkouts, ...restockers, ...decors], hash, ++versionCounter), ent = entranceTile(rows);
  const reach = Uint8Array.from(bfsDist(g, [ent]), (v) => (v >= 0 ? 1 : 0));
  const items = [...aisles, ...checkouts];
  const front = (i: Pt): Pt[] => N4.map(([dx, dy]) => ({ x: i.x + dx, y: i.y + dy }));
  const pois = [{ id: "E", acc: [ent] }, ...items.map((i) => ({ id: i.id, acc: front(i) }))];
  const fields = pois.map((p) => bfsDist(g, p.acc)), dist: Layout["dist"] = {};
  pois.forEach((p, a) => { dist[p.id] = {}; pois.forEach((q) => { let m = Infinity; for (const t of q.acc) if (isFree(g, t.x, t.y)) { const v = fields[a][tileIdx(g, t.x, t.y)]; if (v >= 0) m = Math.min(m, v); } dist[p.id][q.id] = m; }); });
  const spots: Layout["spots"] = {}, boost: Layout["boost"] = {};
  for (const k of checkouts) { let n = 0; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (Math.abs(dx) + Math.abs(dy) <= 3 && isFree(g, k.x + dx, k.y + dy)) n++; spots[k.id] = n; }
  for (const a of aisles) boost[a.id] = 1 + 0.1 * Math.min(5, decors.filter((d) => Math.abs(d.x - a.x) + Math.abs(d.y - a.y) <= 2).length);
  const access: Layout["access"] = {};
  for (const it of items) access[it.id] = standPoints(g, reach, it);
  for (const r of restockers) if (r.id) access["desk" + r.id] = standPoints(g, null, r); // staff desks need not be reachable by customers
  const slots: Layout["slots"] = {}; for (const k of checkouts) slots[k.id] = queueChain(g, k, reach, ent);
  const floor: Pt[] = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (isFree(g, i, j) && reach[tileIdx(g, i, j)] && !(i === ent.x && j === ent.y)) floor.push({ x: i, y: j });
  cache = { grid: g, version: g.version, dist, spots, boost, reach, access, slots, floor };
  return cache;
}
