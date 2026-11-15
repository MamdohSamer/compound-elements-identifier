import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const OUT_FILE = path.join(DATA_DIR, 'pubchem_100k.tsv.gz');

// Curated high-CID essential compounds (drugs, metabolites, natural products, reference compounds)
const EXTRA_CIDS = [
  176, 702, 962, 1254, 1983, 2244, 2519, 3672, 4091, 5779, 5793, 6683,
  36314, 60823, 969516, 5280443, 5280343, 5280863, 5281607, 5281612,
  6321424, 10975654, 11524279, 121304016, 441199, 444795, 445154,
  54670067, 5311052, 65036, 1548943, 448537, 135398744, 9871508,
  5284371, 5362129, 135398658, 135413536, 145068, 216326, 3081361,
  46507015, 11485656, 71616, 6857489, 16051927, 441300, 156414,
  6436, 107985, 446157, 10113978, 123620, 446220, 16129704,
  119607, 135398513, 135398740, 24776445, 73292, 644073, 5281004,
  643961, 444031, 441207, 644241, 135410875, 9865515, 25102847
];

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

async function fetchBatch(cids, attempt = 1) {
  const url = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/property/Title,MolecularFormula,MolecularWeight,ConnectivitySMILES/CSV';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `cid=${cids.join(',')}`,
    });
    if (res.status === 503 || res.status === 429) {
      if (attempt <= 5) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        return fetchBatch(cids, attempt + 1);
      }
      return [];
    }
    if (!res.ok) {
      return [];
    }
    const text = await res.text();
    const lines = text.trim().split('\n');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length >= 5) {
        const cid = Number(cols[0]);
        const title = (cols[1] || '').replace(/[\t\r\n]+/g, ' ').trim();
        const formula = (cols[2] || '').replace(/[\t\r\n\s]+/g, '').trim();
        const mw = (cols[3] || '').trim();
        const smiles = (cols[4] || '').replace(/[\t\r\n]+/g, ' ').trim();
        if (cid && formula && smiles) {
          rows.push({ cid, formula, title, mw, smiles });
        }
      }
    }
    return rows;
  } catch (err) {
    if (attempt <= 4) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return fetchBatch(cids, attempt + 1);
    }
    return [];
  }
}

async function main() {
  const maxCid = 112000;
  const batchSize = 1000;
  const batches = [];

  for (let start = 1; start <= maxCid; start += batchSize) {
    const end = Math.min(start + batchSize - 1, maxCid);
    const arr = [];
    for (let c = start; c <= end; c++) arr.push(c);
    batches.push(arr);
  }
  batches.push(EXTRA_CIDS);

  const map = new Map();
  const concurrency = 4;
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const myIdx = idx++;
      const batch = batches[myIdx];
      const rows = await fetchBatch(batch);
      for (const r of rows) {
        map.set(r.cid, r);
      }
      if ((myIdx + 1) % 20 === 0 || myIdx === batches.length - 1) {
        console.log(`Processed batch ${myIdx + 1}/${batches.length} — total compounds: ${map.size}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const sorted = Array.from(map.values()).sort((a, b) => a.cid - b.cid);
  const lines = ['cid\tformula\ttitle\tmw\tsmiles'];
  for (const r of sorted) {
    lines.push(`${r.cid}\t${r.formula}\t${r.title}\t${r.mw}\t${r.smiles}`);
  }
  const tsv = lines.join('\n');
  const gz = zlib.gzipSync(Buffer.from(tsv, 'utf8'), { level: 9 });
  fs.writeFileSync(OUT_FILE, gz);
  console.log(`Saved ${sorted.length} compounds to ${OUT_FILE} (${(gz.length / 1024 / 1024).toFixed(2)} MB)`);
}

main();
