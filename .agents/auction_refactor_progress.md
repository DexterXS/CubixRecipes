# Auction Refactor Progress

## Goal
Rebuild the frontend Auctions workspace into a local day-folder command planner with a ribbon menu, while preserving the existing `/aca` command behavior.

## Step Counter
1. Done: day-folder data model, helpers, and focused tests.
2. Done: migrated `AuctionBuilder` state from flat `auctions` to `dayFolders`.
3. Done: added ribbon shell and day actions.
4. Done: replaced the old auction plan sidebar with day-folder cards.
5. Done: added selected-day details panel.
6. Done: split server ID and price detail blocks into focused panels without keeping a permanent lower command-preview panel.
7. Done: added normal/expert mode and lazy graph rendering.
8. Done: added opened-folder mode so a day folder can be opened to inspect, select, add, copy, delete, configure, edit items, and open commands for its internal auctions.
9. Done: removed the old inline selected-auction editor area and the permanent bottom command preview from the auction workspace.
10. Done: polished responsive CSS without starting a local dev server.
11. Done: frontend tests, frontend build, file-size report, and `git diff --check`.
12. Done: docs/tree/changelog updated for this continuation; changes are ready for the project `test` delivery flow.
13. Done: added the first structural pass from the supplemental plan: explicit folder list -> opened folder -> opened lot navigation.
14. Done: added regular/planned folder categories, planned-folder graph isolation, opened-lot zones, and context status bar.
15. Done: added the dedicated global graphs workspace with graph summary, folder queue, and graph-only routing instead of mixing the selected-day detail panel into the graph tab.
16. Done: extracted `AuctionWorkspaceView` so the main builder routes state/actions while a dedicated view component owns the lot, graph, folder, and folder-list composition.
17. Done: refined the opened-folder lot workflow with ribbon start/end time controls, folder-delete visibility limited to the folder grid, a selected-lot quick settings panel, and explicit lot apply/save refresh behavior without changing `/aca` command behavior.
18. Done: replaced raw minute entry in the Auctions ribbon with a day/hour/minute duration picker that stays bidirectionally synced with the end-time control.
19. Done: replaced the mostly inert Commands ribbon with folder-grid-only generate/download actions, added a saved backend command-generation profile, then refined it into dynamic create/rename/delete modes with status filters, player target, per-command ordering, custom commands, grouped/per-lot generation, and live preview.
20. Done: polished the Auctions folder cards and resized the command generator modal so controls and preview stay within the visible dialog.
21. Done: removed the unused ID-row, inventory-clear, and built-in give-item command templates from the generator while preserving migration safety for old saved profiles.
22. Done: added colored multi-status chips, a command variable help panel, and a per-lot `Добавить предмет` toggle that controls `/aca addItem` output for mixed ready/not-ready lots.
23. Done: added a persistent left-side lot database with deduped folder lots, detached lot records, search, 4x16 icon paging, hover details, and drag/drop into visible day folders.
24. Next: refine visuals for the graph/sidebar balance and continue reducing oversized auction modules without changing `/aca` command behavior.
