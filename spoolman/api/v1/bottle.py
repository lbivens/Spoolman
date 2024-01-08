"""Bottle related endpoints."""

import asyncio
import logging
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Message, Bottle, BottleEvent
from spoolman.database import bottle
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemCreateError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/bottle",
    tags=["bottle"],
)

# ruff: noqa: D103,B008


class BottleParameters(BaseModel):
    first_used: Optional[datetime] = Field(description="First logged occurence of bottle usage.")
    last_used: Optional[datetime] = Field(description="Last logged occurence of bottle usage.")
    resin_id: int = Field(description="The ID of the resin type of this bottle.")
    remaining_weight: Optional[float] = Field(
        ge=0,
        description=(
            "Remaining weight of resin on the bottle. Can only be used if the resin type has a weight set."
        ),
        example=800,
    )
    used_weight: Optional[float] = Field(ge=0, description="Used weight of resin on the bottle.", example=200)
    location: Optional[str] = Field(max_length=64, description="Where this bottle can be found.", example="Shelf A")
    lot_nr: Optional[str] = Field(
        max_length=64,
        description="Vendor manufacturing lot/batch number of the bottle.",
        example="52342",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this specific bottle.",
        example="",
    )
    archived: bool = Field(default=False, description="Whether this bottle is archived and should not be used anymore.")


class BottleUpdateParameters(BottleParameters):
    resin_id: Optional[int] = Field(description="The ID of the resin type of this bottle.")


class BottleUseParameters(BaseModel):
    use_length: Optional[float] = Field(description="Length of resin to reduce by, in mm.", example=2.2)
    use_weight: Optional[float] = Field(description="Resin weight to reduce by, in g.", example=5.3)


@router.get(
    "",
    name="Find bottle",
    description=(
        "Get a list of bottles that matches the search query. "
        "A websocket is served on the same path to listen for updates to any bottle, or added or deleted bottles. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Bottle]},
        404: {"model": Message},
        299: {"model": BottleEvent, "description": "Websocket message"},
    },
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    resin_name_old: Optional[str] = Query(
        alias="resin_name",
        default=None,
        title="Resin Name",
        description="See resin.name.",
        deprecated=True,
    ),
    resin_id_old: Optional[str] = Query(
        alias="resin_id",
        default=None,
        title="Resin ID",
        description="See resin.id.",
        deprecated=True,
    ),
    resin_material_old: Optional[str] = Query(
        alias="resin_material",
        default=None,
        title="Resin Material",
        description="See resin.material.",
        deprecated=True,
    ),
    vendor_name_old: Optional[str] = Query(
        alias="vendor_name",
        default=None,
        title="Vendor Name",
        description="See resin.vendor.name.",
        deprecated=True,
    ),
    vendor_id_old: Optional[str] = Query(
        alias="vendor_id",
        default=None,
        title="Vendor ID",
        description="See resin.vendor.id.",
        deprecated=True,
    ),
    resin_name: Optional[str] = Query(
        alias="resin.name",
        default=None,
        title="Resin Name",
        description=(
            "Partial case-insensitive search term for the resin name. Separate multiple terms with a comma."
            " Specify an empty string to match bottles with no resin name."
        ),
    ),
    resin_id: Optional[str] = Query(
        alias="resin.id",
        default=None,
        title="Resin ID",
        description="Match an exact resin ID. Separate multiple IDs with a comma.",
        examples=["1", "1,2"],
    ),
    resin_material: Optional[str] = Query(
        alias="resin.material",
        default=None,
        title="Resin Material",
        description=(
            "Partial case-insensitive search term for the resin material. Separate multiple terms with a comma. "
            "Specify an empty string to match bottles with no resin material."
        ),
    ),
    resin_vendor_name: Optional[str] = Query(
        alias="resin.vendor.name",
        default=None,
        title="Vendor Name",
        description=(
            "Partial case-insensitive search term for the resin vendor name. Separate multiple terms with a comma. "
            "Specify an empty string to match bottles with no vendor name."
        ),
    ),
    resin_vendor_id: Optional[str] = Query(
        alias="resin.vendor.id",
        default=None,
        title="Vendor ID",
        description=(
            "Match an exact vendor ID. Separate multiple IDs with a comma. "
            "Set it to -1 to match bottles with resins with no vendor."
        ),
        examples=["1", "1,2"],
    ),
    location: Optional[str] = Query(
        default=None,
        title="Location",
        description=(
            "Partial case-insensitive search term for the bottle location. Separate multiple terms with a comma. "
            "Specify an empty string to match bottles with no location."
        ),
    ),
    lot_nr: Optional[str] = Query(
        default=None,
        title="Lot/Batch Number",
        description=(
            "Partial case-insensitive search term for the bottle lot number. Separate multiple terms with a comma. "
            "Specify an empty string to match bottles with no lot nr."
        ),
    ),
    allow_archived: bool = Query(
        default=False,
        title="Allow Archived",
        description="Whether to include archived bottles in the search results.",
    ),
    sort: Optional[str] = Query(
        default=None,
        title="Sort",
        description=(
            'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
        ),
        example="resin.name:asc,resin.vendor.id:asc,location:desc",
    ),
    limit: Optional[int] = Query(
        default=None,
        title="Limit",
        description="Maximum number of items in the response.",
    ),
    offset: int = Query(
        default=0,
        title="Offset",
        description="Offset in the full result set if a limit is set.",
    ),
) -> JSONResponse:
    sort_by: dict[str, SortOrder] = {}
    if sort is not None:
        for sort_item in sort.split(","):
            field, direction = sort_item.split(":")
            sort_by[field] = SortOrder[direction.upper()]

    resin_id = resin_id if resin_id is not None else resin_id_old
    if resin_id is not None:
        try:
            resin_ids = [int(resin_id_item) for resin_id_item in resin_id.split(",")]
        except ValueError as e:
            raise RequestValidationError(
                [ErrorWrapper(ValueError("Invalid resin_id"), ("query", "resin_id"))],
            ) from e
    else:
        resin_ids = None

    resin_vendor_id = resin_vendor_id if resin_vendor_id is not None else vendor_id_old
    if resin_vendor_id is not None:
        try:
            resin_vendor_ids = [int(vendor_id_item) for vendor_id_item in resin_vendor_id.split(",")]
        except ValueError as e:
            raise RequestValidationError([ErrorWrapper(ValueError("Invalid vendor_id"), ("query", "vendor_id"))]) from e
    else:
        resin_vendor_ids = None

    db_items, total_count = await bottle.find(
        db=db,
        resin_name=resin_name if resin_name is not None else resin_name_old,
        resin_id=resin_ids,
        resin_material=resin_material if resin_material is not None else resin_material_old,
        vendor_name=resin_vendor_name if resin_vendor_name is not None else vendor_name_old,
        vendor_id=resin_vendor_ids,
        location=location,
        lot_nr=lot_nr,
        allow_archived=allow_archived,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Bottle.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to bottle changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("bottle",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("bottle",), websocket)


@router.get(
    "/{bottle_id}",
    name="Get bottle",
    description=(
        "Get a specific bottle. A websocket is served on the same path to listen for changes to the bottle. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": BottleEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    bottle_id: int,
) -> Bottle:
    db_item = await bottle.get_by_id(db, bottle_id)
    return Bottle.from_db(db_item)


@router.websocket(
    "/{bottle_id}",
    name="Listen to bottle changes",
)
async def notify(
    websocket: WebSocket,
    bottle_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("bottle", str(bottle_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("bottle", str(bottle_id)), websocket)


@router.post(
    "",
    name="Add bottle",
    description=(
        "Add a new bottle to the database. "
        "Only specify either remaining_weight or used_weight. "
        "If no weight is set, the bottle will be assumed to be full."
    ),
    response_model_exclude_none=True,
    response_model=Bottle,
    responses={
        400: {"model": Message},
    },
)
async def create(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: BottleParameters,
):
    if body.remaining_weight is not None and body.used_weight is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either remaining_weight or used_weight."},
        )

    try:
        db_item = await bottle.create(
            db=db,
            resin_id=body.resin_id,
            remaining_weight=body.remaining_weight,
            used_weight=body.used_weight,
            first_used=body.first_used,
            last_used=body.last_used,
            location=body.location,
            lot_nr=body.lot_nr,
            comment=body.comment,
            archived=body.archived,
        )
        return Bottle.from_db(db_item)
    except ItemCreateError:
        logger.exception("Failed to create bottle.")
        return JSONResponse(
            status_code=400,
            content={"message": "Failed to create bottle, see server logs for more information."},
        )


@router.patch(
    "/{bottle_id}",
    name="Update bottle",
    description=(
        "Update any attribute of a bottle. "
        "Only fields specified in the request will be affected. "
        "remaining_weight and used_weight can't be set at the same time."
    ),
    response_model_exclude_none=True,
    response_model=Bottle,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def update(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    bottle_id: int,
    body: BottleUpdateParameters,
):
    patch_data = body.dict(exclude_unset=True)

    if body.remaining_weight is not None and body.used_weight is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either remaining_weight or used_weight."},
        )

    if "resin_id" in patch_data and body.resin_id is None:
        raise RequestValidationError(
            [ErrorWrapper(ValueError("resin_id cannot be unset"), ("query", "resin_id"))],
        )

    try:
        db_item = await bottle.update(
            db=db,
            bottle_id=bottle_id,
            data=patch_data,
        )
    except ItemCreateError:
        logger.exception("Failed to update bottle.")
        return JSONResponse(
            status_code=400,
            content={"message": "Failed to update bottle, see server logs for more information."},
        )

    return Bottle.from_db(db_item)


@router.delete(
    "/{bottle_id}",
    name="Delete bottle",
    description="Delete a bottle.",
    responses={404: {"model": Message}},
)
async def delete(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    bottle_id: int,
) -> Message:
    await bottle.delete(db, bottle_id)
    return Message(message="Success!")


@router.put(
    "/{bottle_id}/use",
    name="Use bottle resin",
    description=(
        "Use some length or weight of resin from the bottle. Specify either a length or a weight, not both."
    ),
    response_model_exclude_none=True,
    response_model=Bottle,
    responses={
        400: {"model": Message},
        404: {"model": Message},
    },
)
async def use(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    bottle_id: int,
    body: BottleUseParameters,
):
    if body.use_weight is not None and body.use_length is not None:
        return JSONResponse(
            status_code=400,
            content={"message": "Only specify either use_weight or use_length."},
        )

    if body.use_weight is not None:
        db_item = await bottle.use_weight(db, bottle_id, body.use_weight)
        return Bottle.from_db(db_item)

    if body.use_length is not None:
        db_item = await bottle.use_length(db, bottle_id, body.use_length)
        return Bottle.from_db(db_item)

    return JSONResponse(
        status_code=400,
        content={"message": "Either use_weight or use_length must be specified."},
    )
