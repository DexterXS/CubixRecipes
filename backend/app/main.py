import os

from app.api.routes import create_app

app = create_app(config_path=os.environ.get('CUBIXRECIPES_CONFIG'))
