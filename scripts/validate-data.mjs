import { readFile } from 'node:fs/promises';

const file = new URL('../api/v1/popups.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const errors = [];
const ids = new Set();
const exactRecords = new Set();
const canonicalGroups = new Map();

function normalizedTitle(value) {
  return value.toLowerCase()
    .replace(/pop\s*-?\s*up(?:\s*store)?|팝업\s*스토어|팝업|open|오픈|신규|행사|기념|프로모션|이벤트/gi, '')
    .replace(/[\p{P}\p{S}\s]/gu, '');
}

function brandHint(value) {
  const match = value.match(/^\s*[\[【「](.*?)[\]】」]/);
  if (!match) return null;
  const hint = normalizedTitle(match[1]);
  return hint && !/^(popup|store)+$/.test(hint) ? hint : null;
}

function bigramDice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = value => {
    const result = new Set();
    for (let i = 0; i < value.length - 1; i++) result.add(value.slice(i, i + 2));
    return result;
  };
  const left = pairs(a);
  const right = pairs(b);
  let shared = 0;
  for (const pair of left) if (right.has(pair)) shared++;
  return (2 * shared) / (left.size + right.size);
}

function samePopupTitle(leftTitle, rightTitle) {
  const leftBrand = brandHint(leftTitle);
  const rightBrand = brandHint(rightTitle);
  if (leftBrand && rightBrand && leftBrand === rightBrand) return true;
  const left = normalizedTitle(leftTitle);
  const right = normalizedTitle(rightTitle);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 3 && (left.includes(right) || right.includes(left))) return true;
  return bigramDice(left, right) >= 0.72;
}

if (data.apiVersion !== 'v1') errors.push('apiVersion must be v1');
if (!Array.isArray(data.items)) errors.push('items must be an array');

for (const [index, item] of (data.items || []).entries()) {
  const prefix = `items[${index}]`;
  for (const field of ['id','title','category','region','venue','period','verificationStatus','confidence','source','sources','lastVerifiedAt']) {
    if (item[field] === undefined || item[field] === null) errors.push(`${prefix}.${field} is required`);
  }
  if (ids.has(item.id)) errors.push(`${prefix}.id is duplicated: ${item.id}`);
  ids.add(item.id);
  const exactKey = `${item.title}|${item.venue?.address}|${item.period?.start}|${item.period?.end}`.toLowerCase().replace(/\s+/g, ' ');
  if (exactRecords.has(exactKey)) errors.push(`${prefix} is an exact duplicate: ${item.title}`);
  exactRecords.add(exactKey);
  const groupKey = `${item.venue?.address}|${item.period?.start}|${item.period?.end}`.toLowerCase().replace(/\s+/g, '');
  const group = canonicalGroups.get(groupKey) || [];
  const similar = group.find(candidate => samePopupTitle(candidate.title, item.title));
  if (similar) errors.push(`${prefix} is a near duplicate of ${similar.id}: ${item.title}`);
  group.push(item);
  canonicalGroups.set(groupKey, group);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.period?.start || '')) errors.push(`${prefix}.period.start is invalid`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.period?.end || '')) errors.push(`${prefix}.period.end is invalid`);
  if (item.period?.start > item.period?.end) errors.push(`${prefix}.period is reversed`);
  if (!Number.isFinite(item.venue?.latitude) || item.venue.latitude < 32 || item.venue.latitude > 39.5) errors.push(`${prefix}.venue.latitude is outside South Korea`);
  if (!Number.isFinite(item.venue?.longitude) || item.venue.longitude < 124 || item.venue.longitude > 132.5) errors.push(`${prefix}.venue.longitude is outside South Korea`);
  if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) errors.push(`${prefix}.confidence must be 0..1`);
  if (!/^https:\/\//.test(item.source?.url || '')) errors.push(`${prefix}.source.url must use https`);
  if (!Array.isArray(item.sources) || !item.sources.length) {
    errors.push(`${prefix}.sources must contain at least one source`);
  } else {
    for (const [sourceIndex, source] of item.sources.entries()) {
      if (!/^https:\/\//.test(source?.url || '')) errors.push(`${prefix}.sources[${sourceIndex}].url must use https`);
    }
    if (!item.sources.some(source => source.url === item.source?.url)) errors.push(`${prefix}.source must be included in sources`);
  }
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validated ${data.items.length} popup records with ${ids.size} unique IDs.`);
