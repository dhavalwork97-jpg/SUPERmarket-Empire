# Sketchfab 3D support assets

These are the selected geometry pieces from the supplied Sketchfab FBX bundle.

## Approved source meshes

- Gondola shelf: mesh-10, mesh-11, mesh-12, mesh-16, mesh-17, mesh-18 — 3,052 triangles combined.
- Shopping cart A: mesh-20, mesh-21, mesh-22 — 3,148 triangles combined.
- Shopping cart B: mesh-23, mesh-24, mesh-25 — 3,148 triangles combined.
- Shallow display fixture: mesh-154, mesh-155 — 1,120 triangles combined.

The source FBX files are not copied into the game. The importer recenters each combined asset to a floor-contact pivot, computes normals, removes exporter camera/light nodes, and writes lightweight GLB runtime assets.

## Rebuild the selected assets

Run:

`python3 scripts/import-sketchfab-assets.py /path/to/ImageToStl.com_Untitled.zip`

The command writes the four GLBs and `manifest.json` to `public/assets/3d/`.

## Runtime design

The selected 3D meshes are support geometry only. Existing aisle artwork, characters, checkouts, environment and simulation remain the primary game systems. The WebGL layer is intentionally lightweight and does not add a 3D engine dependency.

## Provenance

Source: **Super market low poly for free**  
Creator: **dasy444**  
Platform: **Sketchfab**  
License captured during audit: **Free Standard**

Raw source assets should not be redistributed as a standalone downloadable asset pack. Keep the original download and this provenance record for project records.
