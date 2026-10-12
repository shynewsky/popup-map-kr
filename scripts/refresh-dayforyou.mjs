import { readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';

const LIST_URL = 'https://dayforyou.com/getScheduleList';
const OUTPUT = new URL('../api/v1/popups.json', import.meta.url);
const MAX_RECORDS = Number(process.env.MAX_RECORDS || 350);
const MAX_PER_REGION = Number(process.env.MAX_PER_REGION || 40);
const GEOCODE_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS || 1100);
const USER_AGENT = 'popup-map-kr-personal-project/0.1 (github.com/shynewsky/popup-map-kr)';

const regions = new Set(['서울','경기','인천','부산','대구','광주','대전','울산','세종','강원','충북','충남','전북','전남','경북','경남','제주']);
const regionAliases = {
  서울특별시:'서울', 서울:'서울', 경기도:'경기', 경기:'경기', 인천광역시:'인천', 인천:'인천',
  부산광역시:'부산', 부산:'부산', 대구광역시:'대구', 대구:'대구', 광주광역시:'광주', 광주:'광주',
  대전광역시:'대전', 대전:'대전', 울산광역시:'울산', 울산:'울산', 세종특별자치시:'세종', 세종:'세종',
  강원특별자치도:'강원', 강원도:'강원', 강원:'강원', 충청북도:'충북', 충북:'충북', 충청남도:'충남', 충남:'충남',
  전북특별자치도:'전북', 전라북도:'전북', 전북:'전북', 전라남도:'전남', 전남:'전남', 경상북도:'경북', 경북:'경북',
  경상남도:'경남', 경남:'경남', 제주특별자치도:'제주', 제주:'제주'
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const cleanText = value => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\\([\[\]])/g, '$1').replace(/\s+/g, ' ').trim();

function regionOf(text = '') {
  for (const [key, value] of Object.entries(regionAliases)) {
    if (text.includes(key)) return value;
  }
  return null;
}

function categoryOf(title) {
  if (/산리오|헬로키티|마이멜로디|짱구|캐릭터|포켓몬|카카오프렌즈|IP\b/i.test(title)) return '캐릭터·IP';
  if (/빵|베이커|케이크|떡|김밥|피자|어묵|마카롱|전복|에그|샌드|고기|갈비|붕어|호두|과자|푸드|식품|디저트|카페|커피|막걸리|야끼|꽈배기|명과/i.test(title)) return '푸드';
  if (/의류|패션|구두|슈즈|핸드백|가방|골프|웨어|막스마라|노비스|무스너클|헬렌카민스키|에코백|캐리어|부츠|모자/i.test(title)) return '패션';
  if (/뷰티|향수|코스메틱|립|스킨|헤어|콜라겐/i.test(title)) return '뷰티';
  if (/리빙|가구|홈|생활|덴비|인테리어|침구/i.test(title)) return '리빙';
  if (/전시|체험|쇼룸|아트/i.test(title)) return '전시·체험';
  return '기타';
}

function venueOf(address) {
  const cleaned = address.replace(/\s+(지하\s*\d*층|지하\d+층|\d+층|B\d층|\dF|B\dF).*$/i, '').replace(/,$/, '');
  const position = cleaned.search(/현대프리미엄아울렛|현대백화점|현대아울렛|신세계백화점|롯데백화점|AK플라자|스타필드|커넥트현대|더현대|무신사|대전신세계|신세계\s/);
  return position >= 0 ? cleaned.slice(position).trim() : cleaned.split(/\s+/).slice(-2).join(' ');
}

function baseAddress(address) {
  const cleaned = address.replace(/,.*$/, '').replace(/\s+(지하\s*\d*층|지하\d+층|\d+층|B\d층|\dF|B\dF).*$/i, '').trim();
  const match = cleaned.match(/^(.+?(?:대로|로|길)\s*\d+(?:-\d+)?)/);
  return match ? match[1] : cleaned;
}

function fetchDayForYou(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    // This compatibility exception is scoped to DayForYou, whose public endpoint
    // currently serves an incomplete certificate chain to Node.js clients.
    const request = https.get(url, {
      headers:{ 'User-Agent':USER_AGENT, Accept:'text/html' },
      rejectUnauthorized:false
    }, response => {
      const status = response.statusCode || 0;
      if ([301,302,303,307,308].includes(status) && response.headers.location) {
        response.resume();
        if (redirects >= 3) return reject(new Error('Too many DayForYou redirects'));
        return resolve(fetchDayForYou(new URL(response.headers.location, url), redirects + 1));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        if (status < 200 || status >= 300) return reject(new Error(`DayForYou returned ${status}`));
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.setTimeout(20000, () => request.destroy(new Error('DayForYou request timed out')));
    request.on('error', reject);
  });
}

async function geocode(address) {
  const queries = [...new Set([address, baseAddress(address)])];
  for (const query of queries) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (response.ok) {
      const rows = await response.json();
      if (rows.length) return { latitude:Number(rows[0].lat), longitude:Number(rows[0].lon), displayName:rows[0].display_name };
    }
    await sleep(250);
  }
  return null;
}

function parse(html) {
  const regex = /<li id="schedule_(\d+)" class="schedule_box">([\s\S]*?)<p class="popupDate">\s*(\d{4}-\d{2}-\d{2})~\s*(\d{4}-\d{2}-\d{2})<\/p>[\s\S]*?<\/li>/g;
  const records = [];
  let match;
  while ((match = regex.exec(html))) {
    const block = match[2];
    const title = (block.match(/<li class="popupTitle">[\s\S]*?<b>([\s\S]*?)<\/b>/) || [])[1];
    const address = (block.match(/<li class="popupLocation">[\s\S]*?<p>([\s\S]*?)&nbsp;/) || [])[1];
    const image = (block.match(/<img class="thumbnail_img" src="([^"]*)"/) || [])[1];
    if (!title || !address) continue;
    records.push({
      seq: match[1], title: cleanText(title), address: cleanText(address), start: match[3], end: match[4],
      imageUrl: image?.startsWith('http') ? image : null,
      sourceUrl: `https://dayforyou.com/getDetail?scheduleSeq=${match[1]}`
    });
  }
  return records;
}

async function main() {
  const previous = JSON.parse(await readFile(OUTPUT, 'utf8'));
  const coordinateCache = new Map(previous.items.map(item => [item.venue.address, {
    latitude:item.venue.latitude, longitude:item.venue.longitude, displayName:item.venue.address
  }]));

  const html = await fetchDayForYou(LIST_URL);
  const today = todayKst();
  const unique = new Map();
  for (const record of parse(html)) {
    if (record.end < today) continue;
    if (!/(팝업|POP\s*-?\s*UP|Pop\s*-?\s*Up|popup|콜라보)/i.test(record.title)) continue;
    const key = `${record.title}|${record.address}|${record.start}|${record.end}`.toLowerCase().replace(/\s+/g, ' ');
    if (!unique.has(key)) unique.set(key, record);
  }

  const perRegion = new Map();
  const selected = [];
  for (const record of unique.values()) {
    const region = regionOf(record.address);
    if (!region || !regions.has(region)) continue;
    if ((perRegion.get(region) || 0) >= MAX_PER_REGION) continue;
    selected.push({ ...record, region });
    perRegion.set(region, (perRegion.get(region) || 0) + 1);
    if (selected.length >= MAX_RECORDS) break;
  }

  const missingAddresses = [...new Set(selected.map(x => x.address).filter(address => !coordinateCache.has(address)))];
  for (const [index, address] of missingAddresses.entries()) {
    const result = await geocode(address);
    if (result) coordinateCache.set(address, result);
    console.log(`[geocode ${index + 1}/${missingAddresses.length}] ${result ? 'ok' : 'skip'} ${address}`);
    await sleep(GEOCODE_DELAY_MS);
  }

  const now = new Date().toISOString();
  const items = selected.filter(x => coordinateCache.has(x.address)).map(record => {
    const geo = coordinateCache.get(record.address);
    return {
      id:`dayforyou-${record.seq}`, title:record.title, brandName:null, category:categoryOf(record.title), region:record.region,
      venue:{ name:venueOf(record.address), address:record.address, latitude:geo.latitude, longitude:geo.longitude },
      period:{ start:record.start, end:record.end }, verificationStatus:'auto_parsed', confidence:0.74,
      imageUrl:record.imageUrl, source:{ name:'데이포유', type:'aggregator', url:record.sourceUrl },
      firstSeenAt: previous.items.find(x => x.id === `dayforyou-${record.seq}`)?.firstSeenAt || now,
      lastVerifiedAt:now
    };
  });

  const output = {
    apiVersion:'v1', generatedAt:now,
    license:'Source-dependent. Each record includes its source URL.',
    sourceSummary:[{ name:'데이포유', type:'aggregator', url:LIST_URL, records:items.length }],
    items
  };
  await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${items.length} unique popup records from ${coordinateCache.size} geocoded addresses.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
