from __future__ import annotations

import gzip
import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any


TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12


@dataclass(frozen=True)
class NbtValue:
    tag_type: int
    value: Any


@dataclass(frozen=True)
class NbtList:
    child_type: int
    values: list[NbtValue]


@dataclass(frozen=True)
class ItemPanelNbtStack:
    legacy_id: int
    meta: int
    count: int
    nbt_raw: str | None
    tag_json: Any | None = None


class _NbtReader:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.offset = 0

    def read(self, length: int) -> bytes:
        if self.offset + length > len(self.data):
            raise ValueError('Unexpected end of NBT data')
        chunk = self.data[self.offset:self.offset + length]
        self.offset += length
        return chunk

    def u8(self) -> int:
        return self.read(1)[0]

    def i8(self) -> int:
        return struct.unpack('>b', self.read(1))[0]

    def i16(self) -> int:
        return struct.unpack('>h', self.read(2))[0]

    def u16(self) -> int:
        return struct.unpack('>H', self.read(2))[0]

    def i32(self) -> int:
        return struct.unpack('>i', self.read(4))[0]

    def i64(self) -> int:
        return struct.unpack('>q', self.read(8))[0]

    def f32(self) -> float:
        return struct.unpack('>f', self.read(4))[0]

    def f64(self) -> float:
        return struct.unpack('>d', self.read(8))[0]

    def string(self) -> str:
        length = self.u16()
        return self.read(length).decode('utf-8', errors='replace')


def read_itempanel_nbt(path: Path) -> list[ItemPanelNbtStack]:
    if not path.is_file():
        return []
    return read_itempanel_nbt_bytes(path.read_bytes())


def read_itempanel_nbt_bytes(data: bytes) -> list[ItemPanelNbtStack]:
    if data.startswith(b'\x1f\x8b'):
        data = gzip.decompress(data)
    reader = _NbtReader(data)
    root_type = reader.u8()
    if root_type != TAG_COMPOUND:
        raise ValueError('Itempanel NBT root must be a compound tag')
    reader.string()
    root = _read_payload(reader, root_type)
    stacks = _extract_item_stacks(root)
    if reader.offset != len(data):
        raise ValueError('Trailing bytes after itempanel NBT payload')
    return stacks


def _read_payload(reader: _NbtReader, tag_type: int) -> NbtValue:
    if tag_type == TAG_BYTE:
        return NbtValue(tag_type, reader.i8())
    if tag_type == TAG_SHORT:
        return NbtValue(tag_type, reader.i16())
    if tag_type == TAG_INT:
        return NbtValue(tag_type, reader.i32())
    if tag_type == TAG_LONG:
        return NbtValue(tag_type, reader.i64())
    if tag_type == TAG_FLOAT:
        return NbtValue(tag_type, reader.f32())
    if tag_type == TAG_DOUBLE:
        return NbtValue(tag_type, reader.f64())
    if tag_type == TAG_BYTE_ARRAY:
        length = reader.i32()
        values = [struct.unpack('>b', reader.read(1))[0] for _ in range(length)]
        return NbtValue(tag_type, values)
    if tag_type == TAG_STRING:
        return NbtValue(tag_type, reader.string())
    if tag_type == TAG_LIST:
        child_type = reader.u8()
        length = reader.i32()
        return NbtValue(tag_type, NbtList(child_type, [_read_payload(reader, child_type) for _ in range(length)]))
    if tag_type == TAG_COMPOUND:
        compound: dict[str, NbtValue] = {}
        while True:
            child_type = reader.u8()
            if child_type == TAG_END:
                break
            name = reader.string()
            compound[name] = _read_payload(reader, child_type)
        return NbtValue(tag_type, compound)
    if tag_type == TAG_INT_ARRAY:
        length = reader.i32()
        return NbtValue(tag_type, [reader.i32() for _ in range(length)])
    if tag_type == TAG_LONG_ARRAY:
        length = reader.i32()
        return NbtValue(tag_type, [reader.i64() for _ in range(length)])
    raise ValueError(f'Unsupported NBT tag type: {tag_type}')


def _extract_item_stacks(root: NbtValue) -> list[ItemPanelNbtStack]:
    if root.tag_type != TAG_COMPOUND or not isinstance(root.value, dict):
        return []
    list_tag = root.value.get('list')
    if list_tag is None or list_tag.tag_type != TAG_LIST or not isinstance(list_tag.value, NbtList):
        return []
    stacks: list[ItemPanelNbtStack] = []
    for item in list_tag.value.values:
        if item.tag_type != TAG_COMPOUND or not isinstance(item.value, dict):
            continue
        legacy_id = _number(item.value.get('id'))
        if legacy_id is None:
            continue
        meta = _number(item.value.get('Damage')) or 0
        count = _number(item.value.get('Count')) or 1
        tag = item.value.get('tag')
        stacks.append(ItemPanelNbtStack(
            legacy_id=legacy_id,
            meta=meta,
            count=count,
            nbt_raw=serialize_nbt(tag) if tag is not None else None,
            tag_json=to_plain_nbt(tag) if tag is not None else None,
        ))
    return stacks


def _number(value: NbtValue | None) -> int | None:
    if value is None or not isinstance(value.value, (int, float)):
        return None
    return int(value.value)


def serialize_nbt(value: NbtValue | None) -> str:
    if value is None:
        return ''
    if value.tag_type == TAG_COMPOUND and isinstance(value.value, dict):
        parts = [f'{_format_key(key)}: {serialize_nbt(child)}' for key, child in value.value.items()]
        return '{' + ', '.join(parts) + '}'
    if value.tag_type == TAG_LIST and isinstance(value.value, NbtList):
        return '[' + ', '.join(serialize_nbt(child) for child in value.value.values) + ']'
    if value.tag_type == TAG_BYTE_ARRAY:
        return '[' + ', '.join(f'{int(item)} as byte' for item in value.value) + ']'
    if value.tag_type == TAG_INT_ARRAY:
        return '[' + ', '.join(str(int(item)) for item in value.value) + ']'
    if value.tag_type == TAG_LONG_ARRAY:
        return '[' + ', '.join(f'{int(item)} as long' for item in value.value) + ']'
    if value.tag_type == TAG_STRING:
        return json.dumps(str(value.value), ensure_ascii=False)
    if value.tag_type == TAG_BYTE:
        return f'{int(value.value)} as byte'
    if value.tag_type == TAG_SHORT:
        return f'{int(value.value)} as short'
    if value.tag_type == TAG_LONG:
        return f'{int(value.value)} as long'
    if value.tag_type == TAG_FLOAT:
        return f'{_format_float(value.value)} as float'
    if value.tag_type == TAG_DOUBLE:
        return f'{_format_float(value.value)} as double'
    return str(value.value)


def to_plain_nbt(value: NbtValue | None) -> Any:
    if value is None:
        return None
    if value.tag_type == TAG_COMPOUND and isinstance(value.value, dict):
        return {key: to_plain_nbt(child) for key, child in value.value.items()}
    if value.tag_type == TAG_LIST and isinstance(value.value, NbtList):
        return [to_plain_nbt(child) for child in value.value.values]
    return value.value


def _format_key(value: str) -> str:
    if re.match(r'^[A-Za-z0-9_.+-]+$', value):
        return value
    return json.dumps(value, ensure_ascii=False)


def _format_float(value: object) -> str:
    number = float(value)
    if number.is_integer():
        return f'{number:.1f}'
    return repr(number)
