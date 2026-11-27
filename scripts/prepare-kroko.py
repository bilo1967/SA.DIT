#!/usr/bin/env python3
"""Prepare the pinned CC-BY-SA Kroko Italian Community 128 streaming model."""
from pathlib import Path
from urllib.request import urlopen
import hashlib
import json
import struct

NAME = "Kroko-IT-Community-128-L-Streaming-001.data"
URL = "https://huggingface.co/Banafo/Kroko-ASR/resolve/main/" + NAME
SHA256 = "5ca623167ca622f2cf4b2f2eecf4442024f7a1ddf98555491424d51c9b5a18d5"
DIR = Path("models/kroko-it")
DIR.mkdir(parents=True, exist_ok=True)
target = DIR / NAME
if not target.exists():
    print("Downloading", URL, flush=True)
    with urlopen(URL, timeout=90) as response, target.open("wb") as out:
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
sha = hashlib.sha256(target.read_bytes()).hexdigest()
if sha != SHA256:
    target.unlink(missing_ok=True)
    raise SystemExit(f"Model SHA-256 mismatch: {sha}")
data = target.read_bytes()
length = struct.unpack_from("<I", data)[0]
header = json.loads(data[4:4 + length])
if not header.get("free", False):
    raise SystemExit("Not a public Community model")
offset = 4 + length
for name in ("encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"):
    count = struct.unpack_from("<I", data, offset)[0]
    offset += 4
    if count <= 0 or offset + count > len(data):
        raise SystemExit(f"Invalid Kroko container block {name}")
    (DIR / name).write_bytes(data[offset:offset + count])
    offset += count
target.unlink()
print("Kroko Italian Community model prepared.")
