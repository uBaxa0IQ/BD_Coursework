"""Нормализация числовых полей из БД (NaN, Infinity) для API."""
from __future__ import annotations

import math
from decimal import Decimal
from typing import Any, Mapping, MutableMapping, TypeVar

T = TypeVar("T", bound=MutableMapping[str, Any])


def clean_numeric(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        if value.is_nan() or value.is_infinite():
            return None
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, str):
        s = value.strip().lower()
        if s in ("nan", "inf", "-inf", "infinity", "-infinity"):
            return None
    return value


def sanitize_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {k: clean_numeric(v) for k, v in row.items()}


def sanitize_rows(rows: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [sanitize_row(r) for r in rows]
