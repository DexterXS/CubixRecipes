# wipe-update

## When to use
- Use this skill when adding or debugging the wipe update workflow that refreshes itempanel CSV, mod icon archives, itempanel NBT dumps, and the combined NEI item catalog.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/items/item_catalog.py`.
- Read `backend/app/api/routes.py` itempanel/admin routes.
- Read `frontend/src/pages/App.tsx` wipe update, NEI, and item catalog loading sections.

## Steps
1. Treat `itempanel.csv`, `itempanel_icons`, mod icon ZIPs, and `itempanel.nbt` as separate sources feeding one combined item catalog.
2. Keep upload routes thin: validate file type, write bytes through the owning service, rescan, and return summary data.
3. Merge NBT stacks by numeric `Item ID` + `meta` from CSV; keep NBT variants as distinct raw entries with `.withTag(...)`.
4. Make NEI read the backend combined catalog first and use static `itempanel.csv` only as fallback.
5. Include resolved `icon_url` in catalog entries and seed frontend icon caches from it, including NBT variants, so stale `null` icon cache entries cannot keep NEI or drafts blank after an update.
6. Treat an empty backend itempanel atlas as missing and fall back to the static base `/itempanel-atlas.json`; the mod-icon atlas is an override layer, not a replacement for the default itempanel atlas.
7. Pass generated mod-icon atlas styles into craft-grid rendering anywhere NEI/held-item rendering uses them, or placed items can show `?` even while the NEI icon is visible.
8. Preserve `entry.raw` for NBT item suggestions and editor insertion; do not rebuild NBT variants from `key/meta`, because that drops `.withTag(...)`.
9. Keep the wipe update UI step-based and explicit: CSV, icons, generated atlases, NBT, final catalog check.
10. Add focused backend tests for catalog merging and API upload, plus frontend tests for the wipe update window.

## Common mistakes
- Using the icon catalog as the only item source; it contains only rows with matched icon files.
- Replacing normal key/meta rows with NBT variants instead of adding NBT variants as separate entries.
- Loading static `/itempanel.csv` or `/itempanel-atlas.json` before the backend catalog, which can hide server-side updates.
- Parsing NBT as text; NEI dumps are gzip-compressed binary NBT.
- Returning only `has_icon` from the combined catalog; the frontend also needs `icon_url` to overwrite stale missing-icon cache values.
- Accepting an empty `/api/itempanel/atlas` as authoritative; this disables the static base atlas.
- Rendering generated mod-icon atlas sprites in NEI but not in `RecipeGrid`.
- Rebuilding an NBT catalog entry as `<mod:item:meta>` inside search suggestions or editors, which makes the NBT tree appear empty.

## Done criteria
- The combined catalog includes CSV-only, icon-backed, and NBT-backed items.
- Uploading CSV or NBT immediately updates the backend catalog and frontend NEI state.
- The wipe update window shows each step status and a final catalog summary.
