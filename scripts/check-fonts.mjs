import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredCharacters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789äöüÄÖÜéèàçêôœ’€'];
const knownTags = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT',
  'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function uintBase128(buffer, state) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    if (state.offset >= buffer.length) throw new Error('truncated UIntBase128 value');
    const byte = buffer[state.offset++];
    if (index === 0 && byte === 0x80) throw new Error('invalid UIntBase128 leading zero');
    if (value & 0xfe000000) throw new Error('UIntBase128 overflow');
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value >>> 0;
  }
  throw new Error('UIntBase128 is too long');
}

function woff2Tables(font) {
  if (font.length < 48 || font.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = font.readUInt16BE(12);
  const compressedLength = font.readUInt32BE(20);
  const state = { offset: 48 };
  const tables = [];

  for (let index = 0; index < numTables; index += 1) {
    if (state.offset >= font.length) throw new Error('truncated table directory');
    const flags = font[state.offset++];
    const tagIndex = flags & 0x3f;
    const transformVersion = flags >>> 6;
    let tag;
    if (tagIndex === 0x3f) {
      if (state.offset + 4 > font.length) throw new Error('truncated custom table tag');
      tag = font.toString('ascii', state.offset, state.offset + 4);
      state.offset += 4;
    } else {
      tag = knownTags[tagIndex];
      if (!tag) throw new Error(`unknown table tag index ${tagIndex}`);
    }
    const originalLength = uintBase128(font, state);
    // glyf and loca use transform version 0 for their transformed representation.
    const transformed = (tag === 'glyf' || tag === 'loca') ? transformVersion === 0 : transformVersion !== 0;
    const storedLength = transformed ? uintBase128(font, state) : originalLength;
    tables.push({ tag, transformVersion, originalLength, storedLength });
  }

  const compressedStart = state.offset;
  const compressedEnd = compressedStart + compressedLength;
  if (compressedEnd > font.length) throw new Error('truncated compressed font data');
  const data = brotliDecompressSync(font.subarray(compressedStart, compressedEnd));
  let offset = 0;
  for (const table of tables) {
    if (offset + table.storedLength > data.length) throw new Error(`truncated ${table.tag} table data`);
    table.data = data.subarray(offset, offset + table.storedLength);
    offset += table.storedLength;
  }
  return tables;
}

function cmapSubtables(cmap) {
  if (cmap.length < 4) throw new Error('truncated cmap header');
  const count = cmap.readUInt16BE(2);
  if (4 + count * 8 > cmap.length) throw new Error('truncated cmap encoding records');
  const subtables = [];
  for (let index = 0; index < count; index += 1) {
    const record = 4 + index * 8;
    const platform = cmap.readUInt16BE(record);
    const encoding = cmap.readUInt16BE(record + 2);
    const offset = cmap.readUInt32BE(record + 4);
    if (offset + 2 > cmap.length) continue;
    const format = cmap.readUInt16BE(offset);
    if (format === 4 || format === 12) subtables.push({ platform, encoding, format, data: cmap.subarray(offset) });
  }
  return subtables;
}

function mappedByFormat4(data, codePoint) {
  if (data.length < 16) return false;
  const length = data.readUInt16BE(2);
  const size = Math.min(length, data.length);
  const segCount = data.readUInt16BE(6) / 2;
  const endCodes = 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const deltas = startCodes + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  if (!Number.isInteger(segCount) || rangeOffsets + segCount * 2 > size) return false;
  for (let index = 0; index < segCount; index += 1) {
    const end = data.readUInt16BE(endCodes + index * 2);
    const start = data.readUInt16BE(startCodes + index * 2);
    if (codePoint < start || codePoint > end) continue;
    const delta = data.readInt16BE(deltas + index * 2);
    const rangeOffsetAddress = rangeOffsets + index * 2;
    const rangeOffset = data.readUInt16BE(rangeOffsetAddress);
    if (rangeOffset === 0) return ((codePoint + delta) & 0xffff) !== 0;
    const glyphAddress = rangeOffsetAddress + rangeOffset + (codePoint - start) * 2;
    if (glyphAddress + 2 > size) return false;
    const glyph = data.readUInt16BE(glyphAddress);
    return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
  }
  return false;
}

function mappedByFormat12(data, codePoint) {
  if (data.length < 16) return false;
  const length = data.readUInt32BE(4);
  const size = Math.min(length, data.length);
  const groups = data.readUInt32BE(12);
  if (16 + groups * 12 > size) return false;
  for (let index = 0; index < groups; index += 1) {
    const group = 16 + index * 12;
    const start = data.readUInt32BE(group);
    const end = data.readUInt32BE(group + 4);
    if (codePoint >= start && codePoint <= end) return data.readUInt32BE(group + 8) + codePoint - start !== 0;
  }
  return false;
}

function missingCharacters(filename) {
  const tables = woff2Tables(fs.readFileSync(filename));
  const cmap = tables.find(table => table.tag === 'cmap');
  if (!cmap) throw new Error('missing cmap table');
  if (cmap.transformVersion !== 0) throw new Error('cmap table is transformed');
  const subtables = cmapSubtables(cmap.data);
  const unicodeSubtables = subtables.filter(({ platform, encoding }) => platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)));
  if (!unicodeSubtables.length) throw new Error('cmap has no Unicode platform 0 or Windows Unicode format 4 or 12 subtable');
  return requiredCharacters.filter(character => !unicodeSubtables.some(table => (
    table.format === 4 ? mappedByFormat4(table.data, character.codePointAt(0)) : mappedByFormat12(table.data, character.codePointAt(0))
  )));
}

function fontFiles() {
  const supplied = process.argv.slice(2);
  if (supplied.length) {
    if (supplied[0] !== '--files' || supplied.length === 1) throw new Error('usage: node scripts/check-fonts.mjs [--files <font.woff2> ...]');
    return supplied.slice(1).map(file => path.resolve(process.cwd(), file));
  }
  const css = fs.readFileSync(path.join(root, 'fonts.css'), 'utf8');
  const files = [...new Set([...css.matchAll(/src:\s*url\(['"]?([^'")]+\.woff2)['"]?\)/g)].map(match => (
    path.resolve(root, match[1].replace(/^\//, ''))
  )))];
  if (!files.length) throw new Error('fonts.css contains no WOFF2 src URLs');
  return files;
}

const failures = [];
let files;
try {
  files = fontFiles();
  for (const file of files) {
    try {
      const missing = missingCharacters(file);
      if (missing.length) failures.push(`${path.relative(process.cwd(), file) || path.basename(file)}: missing ${missing.join(' ')}`);
    } catch (error) {
      failures.push(`${path.relative(process.cwd(), file) || path.basename(file)}: ${error.message}`);
    }
  }
} catch (error) {
  failures.push(error.message);
}

if (failures.length) {
  console.error(`Font coverage check failed:\n${failures.map(message => `- ${message}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Font coverage OK: ${files.map(file => path.relative(root, file)).join(', ')}`);
}
