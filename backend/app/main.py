import os

from app.api.routes import create_app
from app.api.cubixcraft_variants import router as cubixcraft_variants_router

app = create_app(config_path=os.environ.get('CUBIXRECIPES_CONFIG'))
app.include_router(cubixcraft_variants_router)
