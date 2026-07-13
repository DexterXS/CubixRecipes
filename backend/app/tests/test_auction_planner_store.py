from app.storage.auction_planner import AuctionPlannerStore


def test_auction_planner_store_persists_day_folders(tmp_path):
    store = AuctionPlannerStore(tmp_path / "auction_planner.json")
    state = {
        "dayFolders": [
            {
                "id": "day-1",
                "title": "12 июля",
                "auctions": [
                    {
                        "id": "1",
                        "baseStartPrice": 500,
                        "items": [{"uid": "stone"}],
                    }
                ],
            }
        ],
        "selectedDayFolderId": "day-1",
        "selectedAuctionId": "1",
        "workflowMode": "install",
        "uiMode": "normal",
        "commandStage": "create",
    }

    saved = store.save_state(state)
    reloaded = AuctionPlannerStore(tmp_path / "auction_planner.json").get_state()

    assert saved["schemaVersion"] == 1
    assert reloaded["state"]["selectedDayFolderId"] == "day-1"
    assert reloaded["state"]["dayFolders"][0]["auctions"][0]["baseStartPrice"] == 500


def test_auction_planner_store_bounds_nested_lists(tmp_path):
    store = AuctionPlannerStore(tmp_path / "auction_planner.json")
    state = {
        "dayFolders": [
            {
                "id": "day-1",
                "auctions": [
                    {
                        "id": "1",
                        "items": [{"uid": str(index)} for index in range(80)],
                    }
                    for _ in range(130)
                ],
            }
            for _ in range(400)
        ]
    }

    saved = store.save_state(state)

    assert len(saved["state"]["dayFolders"]) == 365
    assert len(saved["state"]["dayFolders"][0]["auctions"]) == 120
    assert len(saved["state"]["dayFolders"][0]["auctions"][0]["items"]) == 64


def test_auction_planner_store_persists_command_profile_modes(tmp_path):
    store = AuctionPlannerStore(tmp_path / "auction_planner.json")
    state = {
        "dayFolders": [],
        "commandProfile": {
            "mode": "existing",
            "playerName": "DexterXS",
            "stateFilters": ["ACTIVE", "PAUSED"],
            "modes": {
                "existing": {
                    "entries": [
                        {
                            "id": "giveItem",
                            "kind": "template",
                            "command": "giveItem",
                            "label": "Give with nick",
                            "template": "/give {player} {itemId} {quantity} {meta}",
                            "scope": "item",
                            "enabled": True,
                        },
                        {
                            "id": "custom-1",
                            "kind": "custom",
                            "label": "Say done",
                            "template": "/say done",
                            "scope": "file",
                            "enabled": True,
                        },
                    ],
                }
            },
        },
    }

    saved = store.save_state(state)
    profile = saved["state"]["commandProfile"]

    assert profile["mode"] == "existing"
    assert profile["playerName"] == "DexterXS"
    assert profile["stateFilters"] == ["ACTIVE", "PAUSED"]
    assert profile["modes"]["existing"]["entries"][0]["template"].startswith("/give {player}")
    assert any(entry["kind"] == "custom" for entry in profile["modes"]["existing"]["entries"])
