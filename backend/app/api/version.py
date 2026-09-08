from __future__ import annotations

import os

from fastapi import APIRouter

router = APIRouter(prefix='/api', tags=['version'])


def _current_version() -> str:
    return (
        os.environ.get('RAILWAY_GIT_COMMIT_SHA', '').strip()
        or os.environ.get('SOURCE_VERSION', '').strip()
        or os.environ.get('GIT_COMMIT_SHA', '').strip()
        or 'dev'
    )


@router.get('/version')
def app_version():
    return {'version': _current_version()}
