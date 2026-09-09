import os

from app.services.production_asset_sync import install_itempanel_mirror_patch, sync_on_startup

install_itempanel_mirror_patch()
_sync_result = sync_on_startup()
if _sync_result is not None:
    print(f'[production-asset-sync] {_sync_result}', flush=True)

from app.api.routes import create_app
from app.api.cubixcraft_variants import router as cubixcraft_variants_router
from app.api.item_intelligence import router as item_intelligence_router
from app.api.item_intelligence_bootstrap import router as item_intelligence_bootstrap_router
from app.api.item_intelligence_enrichment import router as item_intelligence_enrichment_router
from app.api.item_intelligence_lazy import router as item_intelligence_lazy_router
from app.api.item_intelligence_prices import router as item_intelligence_prices_router
from app.api.version import router as version_router

app = create_app(config_path=os.environ.get('CUBIXRECIPES_CONFIG'))
app.include_router(cubixcraft_variants_router)
app.include_router(item_intelligence_router)
app.include_router(item_intelligence_bootstrap_router)
app.include_router(item_intelligence_enrichment_router)
app.include_router(item_intelligence_lazy_router)
app.include_router(item_intelligence_prices_router)
app.include_router(version_router)
