"""Resin related endpoints."""

import asyncio
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from pydantic.error_wrappers import ErrorWrapper
from sqlalchemy.ext.asyncio import AsyncSession

from spoolman.api.v1.models import Resin, ResinEvent, Message
from spoolman.database import resin
from spoolman.database.database import get_db_session
from spoolman.database.utils import SortOrder
from spoolman.exceptions import ItemDeleteError
from spoolman.ws import websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/resin",
    tags=["resin"],
)

# ruff: noqa: D103, B008


class ResinParameters(BaseModel):
    name: Optional[str] = Field(
        max_length=64,
        description=(
            "Resin name, to distinguish this resin type among others from the same vendor."
            "Should contain its color for example."
        ),
        example="PolyTerra™ Charcoal Black",
    )
    vendor_id: Optional[int] = Field(description="The ID of the vendor of this resin type.")
    material: Optional[str] = Field(
        max_length=64,
        description="The material of this resin, e.g. PLA.",
        example="PLA",
    )
    price: Optional[float] = Field(
        ge=0,
        description="The price of this resin in the system configured currency.",
        example=20.0,
    )
    density: float = Field(gt=0, description="The density of this resin in g/cm3.", example=1.24)
    diameter: float = Field(gt=0, description="The diameter of this resin in mm.", example=1.75)
    weight: Optional[float] = Field(
        gt=0,
        description="The weight of the resin in a full bottle, in grams. (net weight)",
        example=1000,
    )
    bottle_weight: Optional[float] = Field(gt=0, description="The empty bottle weight, in grams.", example=140)
    article_number: Optional[str] = Field(
        max_length=64,
        description="Vendor article number, e.g. EAN, QR code, etc.",
        example="PM70820",
    )
    comment: Optional[str] = Field(
        max_length=1024,
        description="Free text comment about this resin type.",
        example="",
    )
    cure_temp: Optional[int] = Field(
        ge=0,
        description="Optimal temerature for curing, in °C.",
        example=210,
    )
    cure_time: Optional[int] = Field(
        ge=0,
        description="Optimal Curing Time, in s",
        example=60,
    )
    wash_time: Optional[int] = Field(
        ge=0,
        description="Optimal Washing Time, in s",
        example=60,
    )
    color_hex: Optional[str] = Field(
        description="Hexadecimal color code of the resin, e.g. FF0000 for red. Supports alpha channel at the end.",
        example="FF0000",
    )

    @validator("color_hex")
    @classmethod
    def color_hex_validator(cls, v: Optional[str]) -> Optional[str]:  # noqa: ANN102
        """Validate the color_hex field."""
        if not v:
            return None
        if v.startswith("#"):
            v = v[1:]
        v = v.upper()

        for c in v:
            if c not in "0123456789ABCDEF":
                raise ValueError("Invalid character in color code.")

        if len(v) not in (6, 8):
            raise ValueError("Color code must be 6 or 8 characters long.")

        return v


class ResinUpdateParameters(ResinParameters):
    density: Optional[float] = Field(gt=0, description="The density of this resin in g/cm3.", example=1.24)
    diameter: Optional[float] = Field(gt=0, description="The diameter of this resin in mm.", example=1.75)


@router.get(
    "",
    name="Find resins",
    description=(
        "Get a list of resins that matches the search query. "
        "A websocket is served on the same path to listen for updates to any resin, or added or deleted resins. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={
        200: {"model": list[Resin]},
        404: {"model": Message},
        299: {"model": ResinEvent, "description": "Websocket message"},
    },
)
async def find(
    *,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    vendor_name_old: Optional[str] = Query(
        alias="vendor_name",
        default=None,
        title="Vendor Name",
        description="See vendor.name.",
        deprecated=True,
    ),
    vendor_id_old: Optional[str] = Query(
        alias="vendor_id",
        default=None,
        title="Vendor ID",
        description="See vendor.id.",
        deprecated=True,
    ),
    vendor_name: Optional[str] = Query(
        alias="vendor.name",
        default=None,
        title="Vendor Name",
        description=(
            "Partial case-insensitive search term for the resin vendor name. "
            "Separate multiple terms with a comma. Specify an empty string to match resins with no vendor name."
        ),
    ),
    vendor_id: Optional[str] = Query(
        alias="vendor.id",
        default=None,
        title="Vendor ID",
        description=(
            "Match an exact vendor ID. Separate multiple IDs with a comma. "
            "Specify -1 to match resins with no vendor."
        ),
        examples=["1", "1,2"],
    ),
    name: Optional[str] = Query(
        default=None,
        title="Resin Name",
        description=(
            "Partial case-insensitive search term for the resin name. Separate multiple terms with a comma. "
            "Specify an empty string to match resins with no name."
        ),
    ),
    material: Optional[str] = Query(
        default=None,
        title="Resin Material",
        description=(
            "Partial case-insensitive search term for the resin material. Separate multiple terms with a comma. "
            "Specify an empty string to match resins with no material."
        ),
    ),
    article_number: Optional[str] = Query(
        default=None,
        title="Resin Article Number",
        description=(
            "Partial case-insensitive search term for the resin article number. "
            "Separate multiple terms with a comma. "
            "Specify an empty string to match resins with no article number."
        ),
    ),
    color_hex: Optional[str] = Query(
        default=None,
        title="Resin Color",
        description="Match resin by similar color. Slow operation!",
    ),
    color_similarity_threshold: float = Query(
        default=20.0,
        description=(
            "The similarity threshold for color matching. "
            "A value between 0.0-100.0, where 0 means match only exactly the same color."
        ),
        example=20.0,
    ),
    sort: Optional[str] = Query(
        default=None,
        title="Sort",
        description=(
            'Sort the results by the given field. Should be a comma-separate string with "field:direction" items.'
        ),
        example="vendor.name:asc,bottle_weight:desc",
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

    vendor_id = vendor_id if vendor_id is not None else vendor_id_old
    if vendor_id is not None:
        try:
            vendor_ids = [int(vendor_id_item) for vendor_id_item in vendor_id.split(",")]
        except ValueError as e:
            raise RequestValidationError([ErrorWrapper(ValueError("Invalid vendor_id"), ("query", "vendor_id"))]) from e
    else:
        vendor_ids = None

    if color_hex is not None:
        matched_resins = await resin.find_by_color(
            db=db,
            color_query_hex=color_hex,
            similarity_threshold=color_similarity_threshold,
        )
        filter_by_ids = [db_resin.id for db_resin in matched_resins]
    else:
        filter_by_ids = None

    db_items, total_count = await resin.find(
        db=db,
        ids=filter_by_ids,
        vendor_name=vendor_name if vendor_name is not None else vendor_name_old,
        vendor_id=vendor_ids,
        name=name,
        material=material,
        article_number=article_number,
        sort_by=sort_by,
        limit=limit,
        offset=offset,
    )

    # Set x-total-count header for pagination
    return JSONResponse(
        content=jsonable_encoder(
            (Resin.from_db(db_item) for db_item in db_items),
            exclude_none=True,
        ),
        headers={"x-total-count": str(total_count)},
    )


@router.websocket(
    "",
    name="Listen to resin changes",
)
async def notify_any(
    websocket: WebSocket,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("resin",), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("resin",), websocket)


@router.get(
    "/{resin_id}",
    name="Get resin",
    description=(
        "Get a specific resin. A websocket is served on the same path to listen for changes to the resin. "
        "See the HTTP Response code 299 for the content of the websocket messages."
    ),
    response_model_exclude_none=True,
    responses={404: {"model": Message}, 299: {"model": ResinEvent, "description": "Websocket message"}},
)
async def get(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    resin_id: int,
) -> Resin:
    db_item = await resin.get_by_id(db, resin_id)
    return Resin.from_db(db_item)


@router.websocket(
    "/{resin_id}",
    name="Listen to resin changes",
)
async def notify(
    websocket: WebSocket,
    resin_id: int,
) -> None:
    await websocket.accept()
    websocket_manager.connect(("resin", str(resin_id)), websocket)
    try:
        while True:
            await asyncio.sleep(0.5)
            if await websocket.receive_text():
                await websocket.send_json({"status": "healthy"})
    except WebSocketDisconnect:
        websocket_manager.disconnect(("resin", str(resin_id)), websocket)


@router.post(
    "",
    name="Add resin",
    description="Add a new resin to the database.",
    response_model_exclude_none=True,
)
async def create(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    body: ResinParameters,
) -> Resin:
    db_item = await resin.create(
        db=db,
        density=body.density,
        diameter=body.diameter,
        name=body.name,
        vendor_id=body.vendor_id,
        material=body.material,
        price=body.price,
        weight=body.weight,
        bottle_weight=body.bottle_weight,
        article_number=body.article_number,
        comment=body.comment,
        settings_cure_temp=body.settings_cure_temp,
        settings_cure_time=body.settings_cure_time,
        settings_wash_time=body.settings_wash_time,
        color_hex=body.color_hex,
    )

    return Resin.from_db(db_item)


@router.patch(
    "/{resin_id}",
    name="Update resin",
    description="Update any attribute of a resin. Only fields specified in the request will be affected.",
    response_model_exclude_none=True,
    responses={404: {"model": Message}},
)
async def update(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    resin_id: int,
    body: ResinUpdateParameters,
) -> Resin:
    patch_data = body.dict(exclude_unset=True)

    if "density" in patch_data and body.density is None:
        raise RequestValidationError([ErrorWrapper(ValueError("density cannot be unset"), ("query", "density"))])
    if "diameter" in patch_data and body.diameter is None:
        raise RequestValidationError([ErrorWrapper(ValueError("diameter cannot be unset"), ("query", "diameter"))])

    db_item = await resin.update(
        db=db,
        resin_id=resin_id,
        data=patch_data,
    )

    return Resin.from_db(db_item)


@router.delete(
    "/{resin_id}",
    name="Delete resin",
    description="Delete a resin.",
    response_model=Message,
    responses={
        403: {"model": Message},
        404: {"model": Message},
    },
)
async def delete(  # noqa: ANN201
    db: Annotated[AsyncSession, Depends(get_db_session)],
    resin_id: int,
):
    try:
        await resin.delete(db, resin_id)
    except ItemDeleteError:
        logger.exception("Failed to delete resin.")
        return JSONResponse(
            status_code=403,
            content={"message": "Failed to delete resin, see server logs for more information."},
        )
    return Message(message="Success!")
