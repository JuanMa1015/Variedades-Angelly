from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session


class PageInfo(BaseModel):
    total: int
    total_pages: int
    current_page: int
    limit: int


def search_filter(term: str | None, *columns: Any) -> list[ColumnElement[bool]]:
    """Build a list of ILIKE filters for the given term across multiple columns.

    Returns an empty list when term is None or empty so callers can use
    ``*search_filter(q, Col.name, Col.code)`` directly in ``.where()``.
    """
    if not term:
        return []
    pattern = f"%{term}%"
    return [col.ilike(pattern) for col in columns]


def build_page(
    db: Session,
    query,
    page: int = 1,
    limit: int = 20,
    order_by=None,
):
    total = db.execute(
        select(func.count()).select_from(query.subquery()),
    ).scalar_one()
    total_pages = max(1, (total + limit - 1) // limit) if total > 0 else 1
    offset = (page - 1) * limit

    if order_by is not None:
        query = query.order_by(order_by)

    items = db.execute(query.offset(offset).limit(limit)).scalars().all()
    return items, PageInfo(
        total=total,
        total_pages=total_pages,
        current_page=page,
        limit=limit,
    )
