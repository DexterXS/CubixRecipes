# Auction Refactor Progress

## Goal
Rebuild the frontend Auctions workspace into a local day-folder command planner with a ribbon menu, while preserving the existing `/aca` command behavior.

## Step Counter
1. Done: day-folder data model, helpers, and focused tests.
2. Done: migrated `AuctionBuilder` state from flat `auctions` to `dayFolders`.
3. Done: added ribbon shell and day actions.
4. Done: replaced the old auction plan sidebar with day-folder cards.
5. Done: added selected-day details panel.
6. Done: split server ID and price detail blocks into focused panels; command preview component is prepared for a later safe JSX swap.
7. Done: added normal/expert mode and lazy graph rendering.
8. Done: polished responsive CSS without starting a local dev server.
9. Done: frontend tests, frontend build, file-size report, and `git diff --check`.
10. Done: docs/tree/changelog updated; changes committed and pushed through the project `test` delivery flow.
