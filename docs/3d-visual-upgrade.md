# 3D visual upgrade (built from the supplied ZIP only)

Branch `feature/3d-visual-upgrade`, off `feature/dynamic-navigation-mobile-ux`. Gameplay, economy, navigation and the save format are untouched: everything here is drawing.

## What was built, against the audit

| Audit item | Label in audit | Status | Where |
|---|---|---|---|
| End caps on upgraded aisles | AVAILABLE IN ZIP | **Done.** Right-hand piece of meshes 16/17/18 -> `shelf_endcap`. Electronics, level 3+, high quality, only on ends facing an empty tile; carries a column of packs. | `build-store-assets.py`, `lib/visual.ts` `endCapSides` |
| Fridge door variety | AVAILABLE IN ZIP | **Done, and corrected.** Meshes 72-74, 80-82, 138-140 are one door at 0 / ~31 / ~50 degrees, not three widths. Built as `door_0/1/2`; doors open for shoppers standing at the cabinet. | `fridge_cabinet`, `refreshDoors` |
| Louvre wall display | AVAILABLE IN ZIP | **Already in use** (meshes 154/155 = `display_wall`, the produce rack). The audit listed it as future by mistake. | - |
| Lit ceiling bars | AVAILABLE IN ZIP | **Done.** Meshes 0 + 3 as `light_housing` / `light_diffuser`, tier 2+ (Growing Store), high quality. | `buildWorld` |
| Storefront windows | AVAILABLE IN ZIP | **Done.** Mesh 60 as `window_frame` over the glass at tier 3 (Large Supermarket), high quality. | `buildWorld` |
| Pillar | AVAILABLE IN ZIP | **Done.** Mesh 150 scaled x0.55, two against the back wall at tier 3, high quality. | `buildWorld` |
| Low / short gondola | CAN BE BUILT | **Done.** Gondola cut at 1.12 m + flat top = `shelf_low`, used for **Bakery** (double-sided bread table). | build script |
| Deli case | CAN BE BUILT | **Done.** `freezer_lite` (104 tris, no baskets) + body block + glass guard; products stand on the lid in two rows. | build script, `aisleLook` |
| Department-tinted headers | CAN BE BUILT | Already there (accent strip L3, header sign L6, gold posts L10); now batched into one draw call each. | `BoxBatch` |
| Chest freezer without 78k baskets | OPTIMIZE FIRST | The shipped `freezer_chest` was already decimated (888 tris). New `freezer_lite` is the 104-tri option used by Deli. | - |
| Cart weight | OPTIMIZE FIRST | `cart_lite` (2,152 tris, -32%) on low quality, cap 24 instead of 64. Wire carts do not decimate further without breaking the bars (see "New assets"). | `cartPlan` |
| Texture memory | OPTIMIZE FIRST | `tex/lite/` (<=512 px products, <=256 px others, no big normal maps): about 11 MB decoded vs about 47 MB. Loaded on low quality. | `texDir`, URL modifier |
| Fixture instancing | Roadmap phase 2 | **Done** for aisle fixtures, end caps, fridge doors and the small decoration boxes. | `components/game/instanced.ts` |
| Quality levels | Architecture | **Done.** `low` / `high`: `?q=low` or `?q=high`, or `localStorage["supermarket-3d-quality"]`, otherwise auto (deviceMemory <= 4, or touch device with <= 6 cores = low). | `pickQuality` |

### Visual progression as implemented
| Store tier | Look |
|---|---|
| 1 Small Shop | unchanged: plain bars, tower gondola, no caps |
| 2 Growing Store | + the ZIP's light fittings overhead |
| 3 Large Supermarket | + window frames over the storefront, + two pillars |
| Aisle L3 / L6 / L10 | accent strip (+ end caps on electronics) / department header / gold posts |
| Checkout L5 / L10 | second scanner / canopy (unchanged) |

### Department fixtures (high quality)
produce = louvre wall rack - bakery = low bread table - electronics = tall gondola + end caps - refrigerated = glass-door cabinet with opening doors - freezer = basket chest - deli = glass-guarded counter.
Low quality keeps the previous fixtures (baked-in doors, basket chest for deli, no caps).

## Measured (headless Chromium, SwiftShader, same save, median of 5 frames)
| State | draw calls base -> high / low | triangles base -> high / low |
|---|---|---|
| Tier 1, L1 | 83 -> 81 / 76 | 31.8k -> 25.3k / 25.7k |
| Tier 2, L6 | 122 -> 122 / 110 | 34.1k -> 32.2k / 28.6k |
| Tier 3, L10 | 157 -> 153 / 133 | 52.2k -> 49.8k / 44.4k |

Honest reading: instancing paid for the new detail (doors, caps, frames, pillars) rather than cutting calls on high; the real saving is on low. Gains grow with the number of aisles, because every aisle used to be its own set of draw calls. Texture memory is the big win on low (about -77%). These are SwiftShader numbers, not phone frame times.

## Corrections to the audit (found while building)
1. `display_wall` was already meshes 154/155 and in use.
2. The three "door widths" are one door at three opening angles.
3. The shipped freezer was already decimated; the 78k/47k meshes only matter if someone imports the source files raw.
4. Mesh 150 is 6.2 m tall in source units (the source store is 5.7 m high), so it is scaled x0.55.

## Not done (and why)
- Shelf tag clips (meshes 19/32): 6 cm parts, invisible at game zoom.
- Backroom crate stacks / basket stacks: no backroom exists in the game yet; baskets already exist as the `baskets` decor.
- Night-lit mode: needs lighting work, not geometry.
- Real low-poly cart: wire carts do not decimate; needs a new asset.

## NEW ASSETS NEEDED (add later; the code paths are ready to take them)
| Asset | Why | Where it plugs in |
|---|---|---|
| Bakery case / bread rack, oven | Bakery is only a low gondola now | `aisleLook("bakery")` + `PLAN` |
| Open multideck dairy case | refrigerated variety | new fixture node + anchors |
| Deli counter with slicer | deli is a chest + glass | `aisleLook("deli")` |
| Produce scale, bins, misters | produce is a rack | decor styles |
| Checkout belt, bag rack, self-checkout | checkout uses a box counter | checkout block in `buildThings` |
| Pallets, backroom racks | future backroom | new area |
| Low-poly cart (<= 600 tris), basket | replaces `cart_lite` | `cartPlan` |
| Electronics wall (TVs) | electronics is a gondola | `aisleLook("electronics")` |
| Real bottle / can / bread meshes | all product packs are boxes | `products.glb` build |
| Vending machine, plants, benches (meshes) | decor is procedural boxes | decor block |
| People with variety | people are capsules | `drawActors` |
| Atlas / KTX2 textures | smaller + one material | `build-store-assets.py` |

## Rebuild
`npm run assets3d -- /path/to/ImageToStl.com_Untitled.zip` regenerates `fixtures.glb`, `products.glb`, `inventory.json`, `tex/` and `tex/lite/`.

## Licence
The model is recorded as "Super market low poly for free" by dasy444, Sketchfab "Free Standard". I could not verify this online. **VERIFY BEFORE SHIPPING**: the repo contains GLBs and textures derived from it.
