/** Called only after full decoder validation. Preserve encoded pixels/color/alpha;
 * remove descriptive metadata rather than recompressing a larger/lossy document. */
export function stripImageMetadata(
  bytes: Buffer,
  mime: string,
  orientation = 1,
): Buffer {
  if (mime === "image/jpeg") {
    const parts = [bytes.subarray(0, 2)];
    let offset = 2;
    while (offset < bytes.length) {
      const start = offset;
      if (bytes[offset++] !== 255) throw new Error("Invalid JPEG marker");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) {
        parts.push(bytes.subarray(start));
        break;
      }
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length)
        throw new Error("Invalid JPEG segment");
      if (
        !(
          (marker >= 0xe1 && marker <= 0xef && marker !== 0xe2) ||
          marker === 0xfe
        )
      )
        parts.push(bytes.subarray(start, offset + length));
      offset += length;
    }
    // Retain only orientation from EXIF (no GPS, camera, author, thumbnail).
    if (orientation > 1 && orientation <= 8) {
      const exif = Buffer.from(
        "ffe100224578696600004d4d002a00000008000101120003000000010001000000000000",
        "hex",
      );
      exif.writeUInt16BE(orientation, 28);
      parts.splice(1, 0, exif);
    }
    return Buffer.concat(parts);
  }
  if (mime === "image/png") {
    const parts = [bytes.subarray(0, 8)];
    let offset = 8;
    const keep = new Set([
      "IHDR",
      "PLTE",
      "IDAT",
      "IEND",
      "tRNS",
      "iCCP",
      "sRGB",
      "gAMA",
      "cHRM",
      "cICP",
    ]);
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) throw new Error("Invalid PNG chunk");
      const name = bytes.toString("ascii", offset + 4, offset + 8);
      if (name === "acTL")
        throw new Error("Animated PNG images are not supported.");
      if (keep.has(name)) parts.push(bytes.subarray(offset, end));
      offset = end;
      if (name === "IEND") break;
    }
    return Buffer.concat(parts);
  }
  const parts: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) throw new Error("Invalid WebP chunk");
    const name = bytes.toString("ascii", offset, offset + 4);
    if (name !== "EXIF" && name !== "XMP ") {
      const part = Buffer.from(bytes.subarray(offset, end));
      if (name === "VP8X") part[8] &= ~0x0c;
      parts.push(part);
    }
    offset = end;
  }
  const result = Buffer.concat([bytes.subarray(0, 12), ...parts]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}
