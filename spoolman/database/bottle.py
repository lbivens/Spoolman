"""Helper functions for interacting with bottle database objects."""

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Optional, Union

import sqlalchemy
from sqlalchemy import case, func
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import contains_eager, joinedload

from spoolman.api.v1.models import EventType, Bottle, BottleEvent
from spoolman.database import resin, models
from spoolman.database.utils import (
    SortOrder,
    add_where_clause_int,
    add_where_clause_int_opt,
    add_where_clause_str,
    add_where_clause_str_opt,
    parse_nested_field,
)
from spoolman.exceptions import ItemCreateError, ItemNotFoundError
from spoolman.math import weight_from_length
from spoolman.ws import websocket_manager


def utc_timezone_naive(dt: datetime) -> datetime:
    """Convert a datetime object to UTC and remove timezone info."""
    return dt.astimezone(tz=timezone.utc).replace(tzinfo=None)


async def create(
    *,
    db: AsyncSession,
    resin_id: int,
    remaining_weight: Optional[float] = None,
    used_weight: Optional[float] = None,
    first_used: Optional[datetime] = None,
    last_used: Optional[datetime] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    comment: Optional[str] = None,
    archived: bool = False,
) -> models.Bottle:
    """Add a new bottle to the database. Leave weight empty to assume full bottle."""
    resin_item = await resin.get_by_id(db, resin_id)
    if used_weight is None:
        if remaining_weight is not None:
            if resin_item.weight is None:
                raise ItemCreateError("remaining_weight can only be used if the resin type has a weight set.")
            used_weight = max(resin_item.weight - remaining_weight, 0)
        else:
            used_weight = 0

    # Convert datetime values to UTC and remove timezone info
    if first_used is not None:
        first_used = utc_timezone_naive(first_used)
    if last_used is not None:
        last_used = utc_timezone_naive(last_used)

    bottle = models.Bottle(
        resin=resin_item,
        registered=datetime.utcnow().replace(microsecond=0),
        used_weight=used_weight,
        first_used=first_used,
        last_used=last_used,
        location=location,
        lot_nr=lot_nr,
        comment=comment,
        archived=archived,
    )
    db.add(bottle)
    await db.commit()
    await bottle_changed(bottle, EventType.ADDED)
    return bottle


async def get_by_id(db: AsyncSession, bottle_id: int) -> models.Bottle:
    """Get a bottle object from the database by the unique ID."""
    bottle = await db.get(
        models.Bottle,
        bottle_id,
        options=[joinedload("*")],  # Load all nested objects as well
    )
    if bottle is None:
        raise ItemNotFoundError(f"No bottle with ID {bottle_id} found.")
    return bottle


async def find(
    *,
    db: AsyncSession,
    resin_name: Optional[str] = None,
    resin_id: Optional[Union[int, Sequence[int]]] = None,
    resin_material: Optional[str] = None,
    vendor_name: Optional[str] = None,
    vendor_id: Optional[Union[int, Sequence[int]]] = None,
    location: Optional[str] = None,
    lot_nr: Optional[str] = None,
    allow_archived: bool = False,
    sort_by: Optional[dict[str, SortOrder]] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> tuple[list[models.Bottle], int]:
    """Find a list of bottle objects by search criteria.

    Sort by a field by passing a dict with the field name as key and the sort order as value.
    The field name can contain nested fields, e.g. resin.name.

    Returns a tuple containing the list of items and the total count of matching items.
    """
    stmt = (
        sqlalchemy.select(models.Bottle)
        .join(models.Bottle.resin, isouter=True)
        .join(models.models.Resin.vendor, isouter=True)
        .options(contains_eager(models.Bottle.resin).contains_eager(models.models.Resin.vendor))
    )

    stmt = add_where_clause_int(stmt, models.Bottle.resin_id, resin_id)
    stmt = add_where_clause_int_opt(stmt, models.models.Resin.vendor_id, vendor_id)
    stmt = add_where_clause_str(stmt, models.Vendor.name, vendor_name)
    stmt = add_where_clause_str_opt(stmt, models.models.Resin.name, resin_name)
    stmt = add_where_clause_str_opt(stmt, models.models.Resin.material, resin_material)
    stmt = add_where_clause_str_opt(stmt, models.Bottle.location, location)
    stmt = add_where_clause_str_opt(stmt, models.Bottle.lot_nr, lot_nr)

    if not allow_archived:
        # Since the archived field is nullable, and default is false, we need to check for both false or null
        stmt = stmt.where(
            sqlalchemy.or_(
                models.Bottle.archived.is_(False),
                models.Bottle.archived.is_(None),
            ),
        )

    total_count = None

    if limit is not None:
        total_count_stmt = stmt.with_only_columns(func.count(), maintain_column_froms=True)
        total_count = (await db.execute(total_count_stmt)).scalar()

        stmt = stmt.offset(offset).limit(limit)

    if sort_by is not None:
        for fieldstr, order in sort_by.items():
            if fieldstr == "remaining_weight":
                stmt = stmt.add_columns((models.models.Resin.weight - models.Bottle.used_weight).label("remaining_weight"))
                field = sqlalchemy.column("remaining_weight")
            else:
                field = parse_nested_field(models.Bottle, fieldstr)

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
    bottle_id: int,
    data: dict,
) -> models.Bottle:
    """Update the fields of a bottle object."""
    bottle = await get_by_id(db, bottle_id)
    for k, v in data.items():
        if k == "resin_id":
            bottle.resin = await resin.get_by_id(db, v)
        elif k == "remaining_weight":
            if bottle.resin.weight is None:
                raise ItemCreateError("remaining_weight can only be used if the resin type has a weight set.")
            bottle.used_weight = max(bottle.resin.weight - v, 0)
        elif isinstance(v, datetime):
            setattr(bottle, k, utc_timezone_naive(v))
        else:
            setattr(bottle, k, v)
    await db.commit()
    await bottle_changed(bottle, EventType.UPDATED)
    return bottle


async def delete(db: AsyncSession, bottle_id: int) -> None:
    """Delete a bottle object."""
    bottle = await get_by_id(db, bottle_id)
    await db.delete(bottle)
    await bottle_changed(bottle, EventType.DELETED)


async def use_weight_safe(db: AsyncSession, bottle_id: int, weight: float) -> None:
    """Consume resin from a bottle by weight in a way that is safe against race conditions.

    Args:
        db (AsyncSession): Database session
        bottle_id (int): Bottle ID
        weight (float): Resin weight to consume, in grams
    """
    await db.execute(
        sqlalchemy.update(models.Bottle)
        .where(models.Bottle.id == bottle_id)
        .values(
            used_weight=case(
                (models.Bottle.used_weight + weight >= 0.0, models.Bottle.used_weight + weight),  # noqa: PLR2004
                else_=0.0,  # Set used_weight to 0 if the result would be negative
            ),
        ),
    )


async def use_weight(db: AsyncSession, bottle_id: int, weight: float) -> models.Bottle:
    """Consume resin from a bottle by weight.

    Increases the used_weight attribute of the bottle.
    Updates the first_used and last_used attributes where appropriate.

    Args:
        db (AsyncSession): Database session
        bottle_id (int): Bottle ID
        weight (float): Resin weight to consume, in grams

    Returns:
        models.Bottle: Updated bottle object
    """
    await use_weight_safe(db, bottle_id, weight)

    bottle = await get_by_id(db, bottle_id)

    if bottle.first_used is None:
        bottle.first_used = datetime.utcnow().replace(microsecond=0)
    bottle.last_used = datetime.utcnow().replace(microsecond=0)

    await db.commit()
    await bottle_changed(bottle, EventType.UPDATED)
    return bottle


async def use_length(db: AsyncSession, bottle_id: int, length: float) -> models.Bottle:
    """Consume resin from a bottle by length.

    Increases the used_weight attribute of the bottle.
    Updates the first_used and last_used attributes where appropriate.

    Args:
        db (AsyncSession): Database session
        bottle_id (int): Bottle ID
        length (float): Length of resin to consume, in mm

    Returns:
        models.Bottle: Updated bottle object
    """
    # Get resin diameter and density
    result = await db.execute(
        sqlalchemy.select(models.models.Resin.diameter, models.models.Resin.density)
        .join(models.Bottle, models.Bottle.resin_id == models.models.Resin.id)
        .where(models.Bottle.id == bottle_id),
    )
    try:
        resin_info = result.one()
    except NoResultFound as exc:
        raise ItemNotFoundError("Resin not found for bottle.") from exc

    # Calculate and use weight
    weight = weight_from_length(
        length=length,
        diameter=resin_info[0],
        density=resin_info[1],
    )
    await use_weight_safe(db, bottle_id, weight)

    # Get bottle with new weight and update first_used and last_used
    bottle = await get_by_id(db, bottle_id)

    if bottle.first_used is None:
        bottle.first_used = datetime.utcnow().replace(microsecond=0)
    bottle.last_used = datetime.utcnow().replace(microsecond=0)

    await db.commit()
    await bottle_changed(bottle, EventType.UPDATED)
    return bottle


async def find_locations(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of bottle locations by searching for distinct values in the bottle table."""
    stmt = sqlalchemy.select(models.Bottle.location).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def find_lot_numbers(
    *,
    db: AsyncSession,
) -> list[str]:
    """Find a list of bottle lot numbers by searching for distinct values in the bottle table."""
    stmt = sqlalchemy.select(models.Bottle.lot_nr).distinct()
    rows = await db.execute(stmt)
    return [row[0] for row in rows.all() if row[0] is not None]


async def bottle_changed(bottle: models.Bottle, typ: EventType) -> None:
    """Notify websocket clients that a bottle has changed."""
    await websocket_manager.send(
        ("bottle", str(bottle.id)),
        BottleEvent(
            type=typ,
            resource="bottle",
            date=datetime.utcnow(),
            payload=Bottle.from_db(bottle),
        ),
    )
