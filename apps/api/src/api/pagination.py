from __future__ import annotations

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session


class PageInfo(BaseModel):
    total: int
    total_pages: int
    current_page: int
    limit: int


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
