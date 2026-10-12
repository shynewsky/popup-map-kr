import { readFile } from 'node:fs/promises';

const file = new URL('../api/v1/popups.json', import.meta.url);
const data = JSON.parse(await readFile(file, 'utf8'));
const errors = [];
const ids = new Set();
const exactRecords = new Set();

if (data.apiVersion !== 'v1') errors.push('apiVersion must be v1');
if (!Array.isArray(data.items)) errors.push('items must be an array');

for (const [index, item] of (data.items || []).entries()) {
  const prefix = `items[${index}]`;
  for (const field of ['id','title','category','region','venue','period','verificationStatus','confidence','source']) {
    if (item[field] === undefined || item[field] === null) errors.push(`${prefix}.${field} is required`);
  }
  if (ids.has(item.id)) errors.push(`${prefix}.id is duplicated: ${item.id}`);
  ids.add(item.id);
  const exactKey = `${item.title}|${item.venue?.address}|${item.period?.start}|${item.period?.end}`.toLowerCase().replace(/\s+/g, ' ');
  if (exactRecords.has(exactKey)) errors.push(`${prefix} is an exact duplicate: ${item.title}`);
  exactRecords.add(exactKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.period?.start || '')) errors.push(`${prefix}.period.start is invalid`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.period?.end || '')) errors.push(`${prefix}.period.end is invalid`);
  if (item.period?.start > item.period?.end) errors.push(`${prefix}.period is reversed`);
  if (!Number.isFinite(item.venue?.latitude) || item.venue.latitude < 32 || item.venue.latitude > 39.5) errors.push(`${prefix}.venue.latitude is outside South Korea`);
  if (!Number.isFinite(item.venue?.longitude) || item.venue.longitude < 124 || item.venue.longitude > 132.5) errors.push(`${prefix}.venue.longitude is outside South Korea`);
  if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) errors.push(`${prefix}.confidence must be 0..1`);
  if (!/^https:\/\//.test(item.source?.url || '')) errors.push(`${prefix}.source.url must use https`);
}

if (errors.length) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validated ${data.items.length} popup records with ${ids.size} unique IDs.`);
