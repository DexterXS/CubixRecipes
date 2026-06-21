# wipe-update

## When to use
- Use this skill when adding or debugging the wipe update workflow that refreshes itempanel CSV, post-line itempanel JSON/SNBT, mod icon archives, generated atlases, and the combined NEI item catalog.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/items/itempanel_merge.py`.
- Read `backend/app/items/item_catalog.py`.
- Read `backend/app/api/routes.py` itempanel/admin routes.
- Read `frontend/src/pages/App.tsx` wipe update, NEI, and item catalog loading sections.

## Steps
1. Treat `itempanel.csv`, `itempanel.json`, `itempanel_icons`, and mod icon ZIPs as separate sources feeding one combined item catalog.
2. Keep upload routes thin: validate file type, write bytes through the owning service, invalidate stale `itempanel_merged.csv`, rescan, and return summary data.
3. Merge only when the admin explicitly presses `Объединить файлы`: CSV rows and non-empty JSON/SNBT lines must have equal counts and match by row order.
4. Write `itempanel_merged.csv` with original CSV fields plus `SNBT`, `SNBT ID`, `SNBT Damage`, `SNBT Has NBT`, `ID Match`, and `Meta Match`.
5. Extract real NBT from the top-level `tag:{...}` inside each SNBT line; use the CSV item key/meta for the item raw and append `.withTag(tag)` only when the tag exists.
6. Make NEI read the backend combined catalog first and use static `itempanel.csv` only as fallback.
7. Include resolved `icon_url` in catalog entries and seed frontend icon caches from it, including NBT variants, so stale `null` icon cache entries cannot keep NEI or drafts blank after an update.
8. Treat an empty backend itempanel atlas as missing and fall back to the static base `/itempanel-atlas.json`; the mod-icon atlas is an override layer, not a replacement for the default itempanel atlas.
9. Pass generated mod-icon atlas styles into craft-grid rendering anywhere NEI/held-item rendering uses them, or placed items can show `?` even while the NEI icon is visible.
10. Preserve `entry.raw` for NBT item suggestions and editor insertion; do not rebuild NBT variants from `key/meta`, because that drops `.withTag(...)` and leaves the NBT tree empty.
11. Treat NBT UI markers as actual `nbt_raw` or `.withTag(...)` only; `meta > 0` and CSV `has_nbt` alone must not create a yellow NBT outline.
12. Keep the wipe update UI step-based and explicit: CSV, icons, generated atlases, JSON/SNBT, merge button, open merged CSV, final catalog check.
13. For mod icon archives, allow mixed ZIPs when at least one valid icon exists, but provide an explicit cleanup action that rewrites the archive to keep only root PNGs or PNGs under the matching `modid_x32/` / `modid_x256/` folder; archive changes must invalidate generated atlas files.
14. Add focused backend tests for catalog merging, archive cleanup, and API upload/merge, plus frontend tests for the wipe update window and atlas panel.

## Common mistakes
- Using the icon catalog as the only item source; it contains only rows with matched icon files.
- Merging automatically on upload and leaving the admin unsure whether CSV and JSON were actually combined.
- Loading static `/itempanel.csv` or `/itempanel-atlas.json` before the backend catalog, which can hide server-side updates.
- Reintroducing binary `itempanel.nbt` upload in this workflow; the current source is line-based `itempanel.json` containing SNBT strings.
- Returning only `has_icon` from the combined catalog; the frontend also needs `icon_url` to overwrite stale missing-icon cache values.
- Accepting an empty `/api/itempanel/atlas` as authoritative; this disables the static base atlas.
- Rendering generated mod-icon atlas sprites in NEI but not in `RecipeGrid`.
- Rejecting mixed mod icon ZIPs that contain valid icons; admins need to upload them first and then use the cleanup action to remove unrelated entries.
- Keeping stale generated atlas manifests after uploading, deleting, or cleaning an archive.
- Rebuilding an NBT catalog entry as `<mod:item:meta>` inside search suggestions or editors, which makes the NBT tree appear empty.
- Using CSV `has_nbt` or meta-only variants as proof of real NBT; yellow outlines require `nbt_raw` or `.withTag(...)`.
- Hiding the merged output; admins need an `Открыть объединенный файл` action to inspect `itempanel_merged.csv`.

## Done criteria
- The combined catalog includes CSV-only, icon-backed, and SNBT-backed items.
- Uploading CSV or JSON updates source status but does not silently merge; pressing `Объединить файлы` creates `itempanel_merged.csv`.
- NBT-backed catalog rows expose `raw` with `.withTag(...)` and `nbt_raw`, so input/output item editors open with a populated NBT tree.
- The wipe update window shows each step status, merged-file status, and a final catalog summary.
