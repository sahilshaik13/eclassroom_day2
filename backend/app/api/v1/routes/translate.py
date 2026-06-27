"""Translate dynamic text for the frontend (database content, etc.)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import get_current_user, TokenData
from app.core.response import success, error
from app.services.translate_service import translate_texts

router = APIRouter(prefix="/translate", tags=["translate"])


class TranslateRequest(BaseModel):
    texts: list[str] = Field(default_factory=list, max_length=50)
    target_lang: str = "ar"


@router.post("")
async def translate(body: TranslateRequest, _user: TokenData = Depends(get_current_user)):
    if not body.texts:
        return success({"translations": []})

    if len(body.texts) > 50:
        return error("TOO_MANY", "Maximum 50 texts per request", 400)

    try:
        translations = translate_texts(body.texts, body.target_lang)
        return success({"translations": translations})
    except Exception:
        return error("TRANSLATE_FAILED", "Could not translate text", 502)
