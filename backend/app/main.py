import os

from app.api.routes import create_app
from app.api.cubixcraft_variants import router as cubixcraft_variants_router
from app.api.item_intelligence import router as item_intelligence_router
from app.api.version import router as version_router

app = create_app(config_path=os.environ.get('CUBIXRECIPES_CONFIG'))
app.include_router(cubixcraft_variants_router)
app.include_router(item_intelligence_router)
app.include_router(version_router)
