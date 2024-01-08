"""Helper functions for interacting with resin database objects."""

import logging
from collections.abc import Sequence
from datetime import datetime
from typing import Optional, Union

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.api.v1.models import EventType, Resin, ResinEvent
from spoolman.database import models, vendor
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int_in,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemDeleteError, ItemNotFoundError
from spoolman.math import delta_e, hex_to_rgb, rgb_to_lab
from spoolman.ws import websocket_manager


async def create(
    *,
    db: AsyncSession,
    density: float,
    name: Optional[str] = None,
    vendor_id: Optional[int] = None,
    material: Optional[str] = None,
    price: Optional[float] = None,
    weight: Optional[float] = None,
    bottle_weight: Optional[float] = None,
    article_number: Optional[str] = None,
    comment: Optional[str] = None,
    cure_temp: Optional[int] = None,
    cure_time: Optional[int] = None,
    wash_time: Optional[int] = None,
    color_hex: Optional[str] = None,
) -> models.Resin:
    """Add a new resin to the database."""
    vendor_item: Optional[models.Vendor] = None
    if vendor_id is not None:
        vendor_item = await vendor.get_by_id(db, vendor_id)

    resin = models.Resin(
        name=name,
        registered=datetime.utcnow().replace(microsecond=0),
        vendor=vendor_item,
        material=material,
        price=price,
        density=density,
        diameter=diameter,
        weight=weight,
        bottle_weight=bottle_weight,
        article_number=article_number,
        comment=comment,
        cure_temp=settings_cure_temp,
        cure_time=settings_cure_time,
        wash_time=settings_wash_time,
        color_hex=color_hex,
    )
    db.add(resin)
    await db.commit()
    await resin_changed(resin, EventType.ADDED)
    return resin


async def get_by_id(db: AsyncSession, resin_id: int) -> models.Resin:
    """Get a resin object from the database by the unique ID."""
    resin = await db.get(
        models.Resin,
        resin_id,
        options=[joinedload("*")],  # Load all nested objects as well
    )
    if resin is None:
        raise ItemNotFoundError(f"No resin with ID {resin_id} found.")
    return resin


async def find(
    *,
    db: AsyncSession,
    ids: Optional[list[int]] = None,
    vendor_name: Optional[str] = None,
    vendor_id: Optional[Union[int, Sequence[int]]] = None,
    name: Optional[str] = None,
    material: Optional[str] = None,
    article_number: Optional[str] = None,
    sort_by: Optional[dict[str, SortOrder]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[list[models.Resin], int]:
    """Find a list of resin objects by search criteria.

    Sort by a field by passing a dict with the field name as key and the sort order as value.
    The field name can contain nested fields, e.g. vendor.name.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = (
        select(models.Resin)
        .options(contains_eager(models.Resin.vendor))
        .join(models.R.vendor, isouter=True)
    )

    stmt = add_where_clause_int_in(stmt, models.Resin.id, ids)
    stmt = add_where_clause_int_opt(stmt, models.Resin.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.Resin.name, name)
    stmt = add_where_clause_str_opt(stmt, models.Resin.material, material)
    stmt = add_where_clause_str_opt(stmt, models.Resin.article_number, article_number)

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            field = parse_nested_field(models.Resin, fieldstr)
            if order == SortOrder.ASC:
                stmt = stmt.order_by(field.asc())
            elif order == SortOrder.DESC:
                stmt = stmt.order_by(field.desc())

    rows = await db.execute(stmt)
    result = list(rows.scalars().all())
    if total_count is None:
        total_count = len(result)

    return result, total_count


async def update(
    *,
    db: AsyncSession,
    resin_id: int,
    data: dict,
) -> models.Resin:
    """Update the fields of a resin object."""
    resin = await get_by_id(db, resin_id)
    for k, v in data.items():
        if k == "vendor_id":
            if v is None:
                resin.vendor = None
            else:
                resin.vendor = await vendor.get_by_id(db, v)
        else:
            setattr(resin, k, v)
    await db.commit()
    await resin_changed(resin, EventType.UPDATED)
    return resin


async def delete(db: AsyncSession, resin_id: int) -> None:
    """Delete a resin object."""
    resin = await get_by_id(db, resin_id)
    await db.delete(resin)
    try:
        await db.commit()  # Flush immediately so any errors are propagated in this request.
        await resin_changed(resin, EventType.DELETED)
    except IntegrityError as exc:
        await db.rollback()
        raise ItemDeleteError("Failed to delete resin.") from exc


logger = logging.getLogger(__name__)


async def find_materials(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of resin materials by searching for distinct values in the resin table."""
    stmt = select(models.Resin.material).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def find_article_numbers(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of resin article numbers by searching for distinct values in the resin table."""
    stmt = select(models.Resin.article_number).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def find_by_color(
    *,
    db: AsyncSession,
    color_query_hex: str,
    similarity_threshold: float = 25,
) -> list[models.Resin]:
    """Find a list of resin objects by similarity to a color.

    This performs a server-side search, where all resins are loaded into memory, making it not so efficient.
    The similarity threshold is a value between 0 and 100, where 0 means the colors must be identical and 100 means
    pretty much all colors are considered similar.
    """
    resins, _ = await find(db=db)

    color_query_lab = rgb_to_lab(hex_to_rgb(color_query_hex))

    found_resins: list[models.Resin] = []
    for resin in resins:
        if resin.color_hex is None:
            continue
        color_lab = rgb_to_lab(hex_to_rgb(resin.color_hex))
        if delta_e(color_query_lab, color_lab) <= similarity_threshold:
            found_resins.append(resin)

    return found_resins


async def resin_changed(resin: models.Resin, typ: EventType) -> None:
    """Notify websocket clients that a resin has changed."""
    await websocket_manager.send(
        ("resin", str(resin.id)),
        FilamentEvent(
            type=typ,
            resource="resin",
            date=datetime.utcnow(),
            payload=Filament.from_db(resin),
        ),
    )
