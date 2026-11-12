const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const DB_PATH = path.join(DATA_DIR, 'filaments.db');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS manufacturers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    country TEXT DEFAULT '',
    empty_spool_weight_g INTEGER DEFAULT 200,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS filaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer_id INTEGER NOT NULL,
    material TEXT NOT NULL DEFAULT 'PLA',
    series TEXT DEFAULT '',
    color_name TEXT NOT NULL,
    color_hex TEXT NOT NULL DEFAULT '#FF5F1F',
    purchase_price REAL NOT NULL,
    initial_weight_g REAL NOT NULL,
    price_per_kg REAL NOT NULL,
    remaining_weight_g REAL NOT NULL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (manufacturer_id) REFERENCES manufacturers(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    print_time TEXT DEFAULT '',
    image_data TEXT DEFAULT '',
    threemf_filename TEXT DEFAULT '',
    threemf_stored_name TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    filament_id INTEGER,
    label TEXT DEFAULT '',
    weight_g REAL NOT NULL,
    snapshot_name TEXT DEFAULT '',
    snapshot_material TEXT DEFAULT '',
    snapshot_color_hex TEXT DEFAULT '#FF5F1F',
    snapshot_price_per_kg REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Ensure image_data, print_time, and 3mf columns exist on projects table (for existing databases)
const projCols = db.prepare(`PRAGMA table_info(projects)`).all();
if (!projCols.some(c => c.name === 'image_data')) {
  db.exec(`ALTER TABLE projects ADD COLUMN image_data TEXT DEFAULT ''`);
}
if (!projCols.some(c => c.name === 'print_time')) {
  db.exec(`ALTER TABLE projects ADD COLUMN print_time TEXT DEFAULT ''`);
}
if (!projCols.some(c => c.name === 'threemf_filename')) {
  db.exec(`ALTER TABLE projects ADD COLUMN threemf_filename TEXT DEFAULT ''`);
}
if (!projCols.some(c => c.name === 'threemf_stored_name')) {
  db.exec(`ALTER TABLE projects ADD COLUMN threemf_stored_name TEXT DEFAULT ''`);
}

// Ensure snapshot_material column exists on project_items table
const itemCols = db.prepare(`PRAGMA table_info(project_items)`).all();
if (!itemCols.some(c => c.name === 'snapshot_material')) {
  db.exec(`ALTER TABLE project_items ADD COLUMN snapshot_material TEXT DEFAULT ''`);
  db.exec(`
    UPDATE project_items
    SET snapshot_material = COALESCE(
      (SELECT f.material FROM filaments f WHERE f.id = project_items.filament_id),
      ''
    )
  `);
}

// Seed default settings if missing
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('electricity_price_per_kwh', '0.35');
insertSetting.run('printer_power_kwh', '0.12');
insertSetting.run('printer_name', '');

// Seed default manufacturers if table is empty
const countRow = db.prepare('SELECT COUNT(*) as count FROM manufacturers').get();
if (countRow.count === 0) {
  const defaultManufacturers = [
    { name: 'Bambu Lab', country: 'CN', weight: 250 },
    { name: 'Prusament (Prusa)', country: 'CZ', weight: 200 },
    { name: 'eSUN', country: 'CN', weight: 220 },
    { name: 'SUNLU', country: 'CN', weight: 195 },
    { name: 'Polymaker', country: 'CN/US', weight: 140 },
    { name: 'Extrudr', country: 'AT', weight: 230 },
    { name: 'Das Filament', country: 'DE', weight: 210 },
    { name: 'Eryone', country: 'CN', weight: 200 },
    { name: 'Elegoo', country: 'CN', weight: 160 },
    { name: 'Overture', country: 'US/CN', weight: 185 },
    { name: 'Creality', country: 'CN', weight: 190 },
    { name: 'Anycubic', country: 'CN', weight: 190 },
    { name: 'Redline Filament', country: 'NL/DE', weight: 220 },
    { name: 'FormFutura', country: 'NL', weight: 210 },
    { name: 'Geeetech', country: 'CN', weight: 200 },
    { name: 'Fiberlogy', country: 'PL', weight: 240 }
  ];

  const insertMfg = db.prepare(
    'INSERT INTO manufacturers (name, country, empty_spool_weight_g) VALUES (?, ?, ?)'
  );
  for (const m of defaultManufacturers) {
    insertMfg.run(m.name, m.country, m.weight);
  }

  const getMfgId = db.prepare('SELECT id FROM manufacturers WHERE name = ?');
  const bambuId = getMfgId.get('Bambu Lab')?.id || 1;
  const prusaId = getMfgId.get('Prusament (Prusa)')?.id || 2;
  const extrudrId = getMfgId.get('Extrudr')?.id || 6;
  const sunluId = getMfgId.get('SUNLU')?.id || 4;

  const insertFilament = db.prepare(`
    INSERT INTO filaments (
      manufacturer_id, material, series, color_name, color_hex,
      purchase_price, initial_weight_g, price_per_kg, remaining_weight_g, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertFilament.run(bambuId, 'PLA', 'Matte', 'Charcoal Black', '#26292e', 19.99, 1000, 19.99, 780, 'Standard Schwarz für Gehäuse');
  insertFilament.run(prusaId, 'PETG', 'Standard', 'Prusa Orange', '#ff6b1a', 29.99, 1000, 29.99, 640, 'Für mechanische Teile & Halterungen');
  insertFilament.run(extrudrId, 'ASA', 'DuraPro', 'Verkehrsweiß', '#FFFFFF', 26.90, 750, Number(((26.90 / 750) * 1000).toFixed(2)), 520, '750g Spule, UV-beständig');
  insertFilament.run(sunluId, 'PLA+', 'High Speed', 'Jade Grün', '#00D13B', 14.50, 1000, 14.50, 160, 'Fast aufgebraucht');
}

// Seed an example project if projects table is empty and filaments exist
const projCount = db.prepare('SELECT COUNT(*) as count FROM projects').get();
if (projCount.count === 0) {
  const existingFilaments = db.prepare(`
    SELECT f.*, m.name AS manufacturer_name
    FROM filaments f
    JOIN manufacturers m ON m.id = f.manufacturer_id
    ORDER BY f.id ASC
    LIMIT 2
  `).all();

  if (existingFilaments.length > 0) {
    const pRes = db.prepare(
      'INSERT INTO projects (name, notes) VALUES (?, ?)'
    ).run('Teebox', '2 Druckplatten + AMS Akzentfarbe');
    const projId = Number(pRes.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO project_items (
        project_id, filament_id, label, weight_g,
        snapshot_name, snapshot_color_hex, snapshot_price_per_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const f1 = existingFilaments[0];
    insertItem.run(
      projId,
      f1.id,
      'Platte 1 – Korpus & Fächer',
      165,
      `${f1.manufacturer_name} ${f1.material} (${f1.color_name})`,
      f1.color_hex,
      f1.price_per_kg
    );

    const f2 = existingFilaments[1] || existingFilaments[0];
    insertItem.run(
      projId,
      f2.id,
      'Platte 2 – Deckel / AMS Akzent',
      58,
      `${f2.manufacturer_name} ${f2.material} (${f2.color_name})`,
      f2.color_hex,
      f2.price_per_kg
    );
  }
}

function sendJson(res, statusCode, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Ungültiges JSON-Format'));
      }
    });
    req.on('error', reject);
  });
}

function parseRawBody(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Datei ist zu groß (max. 100 MB).'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function formatSecondsToPrintTime(seconds) {
  const sec = Math.round(Number(seconds) || 0);
  if (sec <= 0) return '';
  const totalMinutes = Math.max(1, Math.round(sec / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function hexToRgb(hex) {
  const clean = String(hex || '').trim().replace(/^#/, '').slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
}

function findBestMatchingSpool(materialType, colorHex, allFilaments) {
  const normMat = String(materialType || '').trim().toLowerCase();
  if (!normMat || !Array.isArray(allFilaments) || allFilaments.length === 0) return null;

  // 1. Exact material match (case-insensitive)
  let candidates = allFilaments.filter(
    f => String(f.material || '').trim().toLowerCase() === normMat
  );

  // 2. Base material match (e.g. "PLA Matte" or "PLA+" matching "PLA")
  if (candidates.length === 0) {
    const baseMat = normMat.split(/[\s+-]/)[0];
    if (baseMat) {
      candidates = allFilaments.filter(f => {
        const fMat = String(f.material || '').trim().toLowerCase();
        return fMat === baseMat || fMat.startsWith(baseMat + ' ') || fMat.startsWith(baseMat + '+') || fMat.startsWith(baseMat + '-');
      });
    }
  }

  if (candidates.length === 0) return null;

  const targetRgb = hexToRgb(colorHex);
  if (!targetRgb) return candidates[0];

  let best = candidates[0];
  let bestDist = Infinity;
  for (const cand of candidates) {
    const rgb = hexToRgb(cand.color_hex);
    if (!rgb) continue;
    const dist =
      Math.pow(rgb.r - targetRgb.r, 2) +
      Math.pow(rgb.g - targetRgb.g, 2) +
      Math.pow(rgb.b - targetRgb.b, 2);
    if (dist < bestDist) {
      bestDist = dist;
      best = cand;
    }
  }
  return best;
}

function parseXmlAttributes(tagStr) {
  const attrs = {};
  const re = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tagStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function parseSliceInfoXml(xml) {
  const plateBlocks = [...String(xml || '').matchAll(/<plate\b[^>]*>([\s\S]*?)<\/plate>/gi)];
  let totalSec = 0;
  const extractedFilaments = [];

  if (plateBlocks.length > 0) {
    plateBlocks.forEach((match, idx) => {
      const block = match[1];
      let plateIndex = idx + 1;
      let plateName = '';

      const metaMatches = [...block.matchAll(/<metadata\b([^>]*)\/?>/gi)];
      for (const mm of metaMatches) {
        const attrs = parseXmlAttributes(mm[1]);
        if (attrs.key === 'index' && attrs.value) {
          plateIndex = Number(attrs.value) || plateIndex;
        } else if (attrs.key === 'prediction' && attrs.value) {
          const sec = Number(attrs.value);
          if (Number.isFinite(sec) && sec > 0) {
            totalSec += sec;
          }
        } else if ((attrs.key === 'plate_name' || attrs.key === 'name') && attrs.value) {
          plateName = attrs.value.trim();
        }
      }

      const objNames = [...block.matchAll(/<object\b([^>]*)\/?>/gi)]
        .map(om => parseXmlAttributes(om[1]))
        .filter(a => a.name && a.skipped !== 'true')
        .map(a => a.name.replace(/\.(stl|step|stp|obj|3mf)$/i, '').trim())
        .filter(Boolean);
      const uniqueObjNames = [...new Set(objNames)];
      const objSuffix =
        uniqueObjNames.length === 1 && !/^object_\d+$/i.test(uniqueObjNames[0])
          ? uniqueObjNames[0]
          : '';

      const filMatches = [...block.matchAll(/<filament\b([^>]*)\/?>/gi)];
      for (const fm of filMatches) {
        const attrs = parseXmlAttributes(fm[1]);
        const usedG = Number(attrs.used_g);
        if (!Number.isFinite(usedG) || usedG <= 0) continue;

        const type = String(attrs.type || 'PLA').trim();
        const rawColor = String(attrs.color || '#FF5F1F').trim();
        const colorHex = rawColor.startsWith('#') ? rawColor.slice(0, 7) : `#${rawColor.slice(0, 6)}`;
        const slotId = attrs.id || '';

        let labelPrefix = `Platte ${plateIndex}`;
        if (plateName) {
          labelPrefix = `Platte ${plateIndex} (${plateName})`;
        } else if (objSuffix) {
          labelPrefix = `Platte ${plateIndex} – ${objSuffix}`;
        }

        const label =
          filMatches.length > 1 && slotId
            ? `${labelPrefix} · AMS #${slotId} (${type})`
            : `${labelPrefix} (${type})`;

        extractedFilaments.push({
          label,
          material: type,
          color_hex: /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : '#FF5F1F',
          weight_g: Number(usedG.toFixed(1))
        });
      }
    });
  }

  return { totalSec, extractedFilaments };
}

function inspectThreeMfFile(filePath) {
  const result = {
    thumbnailDataUrl: '',
    printTime: '',
    totalSeconds: 0,
    filaments: []
  };

  let entries = [];
  try {
    const listOut = execFileSync('unzip', ['-Z1', filePath], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    entries = listOut
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  } catch (err) {
    return result;
  }

  // 1. Extract Thumbnail Image (Bambu Studio / OrcaSlicer / PrusaSlicer)
  const preferredThumbs = [
    'Metadata/plate_1.png',
    'Auxiliaries/.thumbnails/thumbnail_3mf.png',
    'Auxiliaries/.thumbnails/thumbnail_middle.png',
    'Metadata/thumbnail.png',
    '3D/Metadata/thumbnail.png',
    'Metadata/top_1.png'
  ];

  let chosenThumb = preferredThumbs.find(t => entries.includes(t));
  if (!chosenThumb) {
    chosenThumb = entries.find(e => /^Metadata\/plate_\d+\.png$/i.test(e) && !e.includes('small'));
  }
  if (!chosenThumb) {
    chosenThumb = entries.find(e => /\.png$/i.test(e) && /thumb|plate/i.test(e));
  }

  if (chosenThumb) {
    try {
      const imgBuf = execFileSync('unzip', ['-p', filePath, chosenThumb], {
        maxBuffer: 15 * 1024 * 1024
      });
      if (imgBuf && imgBuf.length > 0) {
        result.thumbnailDataUrl = `data:image/png;base64,${imgBuf.toString('base64')}`;
      }
    } catch (_) {
      // Ignore thumbnail extraction error
    }
  }

  // 2. Extract Slice Info (Metadata/slice_info.config) if already sliced
  let parsed = { totalSec: 0, extractedFilaments: [] };
  if (entries.includes('Metadata/slice_info.config')) {
    try {
      const xml = execFileSync('unzip', ['-p', filePath, 'Metadata/slice_info.config'], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      parsed = parseSliceInfoXml(xml);
    } catch (_) {}
  }

  // 3. If the .3mf is unsliced (e.g. MakerWorld download or normal Save in Bambu Studio),
  //    run Bambu Studio CLI headless slicer to compute exact print time & filament weights!
  const bambuCliBin = '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
  if (parsed.extractedFilaments.length === 0 && fs.existsSync(bambuCliBin)) {
    const cliDataDir = '/tmp/spoolmate_bambu_datadir';
    const tmpOutDir = `/tmp/spoolmate_slice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      fs.mkdirSync(cliDataDir, { recursive: true });
      fs.mkdirSync(tmpOutDir, { recursive: true });
      execFileSync(
        bambuCliBin,
        ['--datadir', cliDataDir, '--slice', '0', '--outputdir', tmpOutDir, '--export-3mf', 'sliced.3mf', filePath],
        { timeout: 45000, stdio: 'ignore' }
      );
      const sliced3mfPath = path.join(tmpOutDir, 'sliced.3mf');
      if (fs.existsSync(sliced3mfPath)) {
        const slicedXml = execFileSync('unzip', ['-p', sliced3mfPath, 'Metadata/slice_info.config'], {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024
        });
        parsed = parseSliceInfoXml(slicedXml);
      }
    } catch (_) {
      // Ignore CLI slice error and fall back below
    } finally {
      try {
        fs.rmSync(tmpOutDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  if (parsed.totalSec > 0) {
    result.totalSeconds = parsed.totalSec;
    result.printTime = formatSecondsToPrintTime(parsed.totalSec);
  }
  result.filaments = parsed.extractedFilaments;

  return result;
}

function computePricePerKg(purchasePrice, initialWeightG) {
  const price = Number(purchasePrice);
  const weight = Number(initialWeightG);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Bitte einen gültigen Preis eingeben.');
  }
  if (!Number.isFinite(weight) || weight <= 0) {
    throw new Error('Die Menge muss größer als 0 g sein.');
  }
  return Number(((price / weight) * 1000).toFixed(2));
}

function listManufacturers() {
  return db.prepare(`
    SELECT
      m.id,
      m.name,
      m.country,
      m.empty_spool_weight_g,
      m.created_at,
      COUNT(f.id) AS spool_count
    FROM manufacturers m
    LEFT JOIN filaments f ON f.manufacturer_id = m.id
    GROUP BY m.id
    ORDER BY m.name COLLATE NOCASE ASC
  `).all();
}

function listFilaments() {
  return db.prepare(`
    SELECT
      f.*,
      m.name AS manufacturer_name,
      m.empty_spool_weight_g AS manufacturer_spool_weight_g
    FROM filaments f
    JOIN manufacturers m ON m.id = f.manufacturer_id
    ORDER BY f.id DESC
  `).all();
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return {
    electricity_price_per_kwh: Number(map.electricity_price_per_kwh ?? 0.35),
    printer_power_kwh: Number(map.printer_power_kwh ?? 0.12),
    printer_name: String(map.printer_name ?? '')
  };
}

function parsePrintTimeToHours(raw) {
  const str = String(raw || '').trim().toLowerCase().replace(',', '.');
  if (!str) return 0;

  // Format HH:MM (e.g. "6:30" or "06:30")
  const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
  if (colonMatch) {
    return Number(colonMatch[1]) + Number(colonMatch[2]) / 60;
  }

  let totalHours = 0;
  let matchedUnit = false;

  const daysMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:d|t|tag|tage)\b/);
  if (daysMatch) {
    totalHours += Number(daysMatch[1]) * 24;
    matchedUnit = true;
  }

  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:h|std|stunde|stunden)\b/);
  if (hoursMatch) {
    totalHours += Number(hoursMatch[1]);
    matchedUnit = true;
  }

  const minsMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute|minuten)\b/);
  if (minsMatch) {
    totalHours += Number(minsMatch[1]) / 60;
    matchedUnit = true;
  }

  if (matchedUnit) {
    return totalHours;
  }

  // Fallback: plain number = hours (e.g. "6.5")
  const num = Number(str);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function listProjects() {
  const settings = getSettings();
  const projects = db.prepare(`
    SELECT * FROM projects ORDER BY id DESC
  `).all();

  const items = db.prepare(`
    SELECT
      pi.*,
      f.material AS filament_material,
      f.series AS filament_series,
      f.color_name AS filament_color_name,
      f.color_hex AS filament_color_hex,
      f.price_per_kg AS filament_price_per_kg,
      f.remaining_weight_g AS filament_remaining_weight_g,
      m.name AS manufacturer_name
    FROM project_items pi
    LEFT JOIN filaments f ON f.id = pi.filament_id
    LEFT JOIN manufacturers m ON m.id = f.manufacturer_id
    ORDER BY pi.id ASC
  `).all();

  const itemsByProject = new Map();
  for (const row of items) {
    const pricePerKg = row.filament_id
      ? Number(row.filament_price_per_kg)
      : Number(row.snapshot_price_per_kg);
    const colorHex = row.filament_id
      ? row.filament_color_hex
      : row.snapshot_color_hex;
    const filamentDisplayName = row.filament_id
      ? `${row.manufacturer_name} — ${row.filament_material} ${row.filament_color_name}`
      : `${row.snapshot_name} (gelöscht)`;
    const weightG = Number(row.weight_g) || 0;
    const cost = Number(((weightG / 1000) * pricePerKg).toFixed(4));

    const enriched = {
      id: row.id,
      project_id: row.project_id,
      filament_id: row.filament_id,
      material: row.filament_id ? row.filament_material : (row.snapshot_material || ''),
      label: row.label || '',
      weight_g: weightG,
      price_per_kg: pricePerKg,
      color_hex: colorHex || '#FF5F1F',
      filament_name: filamentDisplayName,
      remaining_weight_g: row.filament_id ? Number(row.filament_remaining_weight_g) : null,
      cost
    };

    if (!itemsByProject.has(row.project_id)) {
      itemsByProject.set(row.project_id, []);
    }
    itemsByProject.get(row.project_id).push(enriched);
  }

  return projects.map(p => {
    const pItems = itemsByProject.get(p.id) || [];
    const totalWeightG = Number(pItems.reduce((sum, i) => sum + i.weight_g, 0).toFixed(1));
    const materialCost = Number(pItems.reduce((sum, i) => sum + i.cost, 0).toFixed(2));
    const printHours = parsePrintTimeToHours(p.print_time);
    const energyKwh = Number((printHours * settings.printer_power_kwh).toFixed(3));
    const energyCost = Number((energyKwh * settings.electricity_price_per_kwh).toFixed(2));
    const totalCost = Number((materialCost + energyCost).toFixed(2));

    return {
      ...p,
      items: pItems,
      total_weight_g: totalWeightG,
      material_cost: materialCost,
      print_time_hours: Number(printHours.toFixed(2)),
      energy_kwh: energyKwh,
      energy_cost: energyCost,
      total_cost: totalCost
    };
  });
}

function getFilamentSnapshot(filamentId) {
  return db.prepare(`
    SELECT f.*, m.name AS manufacturer_name
    FROM filaments f
    JOIN manufacturers m ON m.id = f.manufacturer_id
    WHERE f.id = ?
  `).get(filamentId);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // API Routes
    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      return sendJson(res, 200, {
        manufacturers: listManufacturers(),
        filaments: listFilaments(),
        projects: listProjects(),
        settings: getSettings()
      });
    }

    // --- Settings API ---
    if (pathname === '/api/settings' && req.method === 'GET') {
      return sendJson(res, 200, getSettings());
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await parseBody(req);
      const pricePerKwh = Number(body.electricity_price_per_kwh);
      const powerKwh = Number(body.printer_power_kwh);
      const printerName = String(body.printer_name || '').trim();

      if (!Number.isFinite(pricePerKwh) || pricePerKwh < 0) {
        return sendJson(res, 400, { error: 'Bitte einen gültigen Strompreis (€/kWh) eingeben.' });
      }
      if (!Number.isFinite(powerKwh) || powerKwh < 0) {
        return sendJson(res, 400, { error: 'Bitte einen gültigen Stromverbrauch (kWh) eingeben.' });
      }

      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      upsert.run('electricity_price_per_kwh', String(pricePerKwh));
      upsert.run('printer_power_kwh', String(powerKwh));
      upsert.run('printer_name', printerName);

      return sendJson(res, 200, {
        settings: getSettings(),
        projects: listProjects()
      });
    }

    // --- Manufacturers API ---
    if (pathname === '/api/manufacturers' && req.method === 'GET') {
      return sendJson(res, 200, listManufacturers());
    }

    if (pathname === '/api/manufacturers' && req.method === 'POST') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const country = String(body.country || '').trim();
      const emptySpoolWeight = body.empty_spool_weight_g ? Number(body.empty_spool_weight_g) : 200;

      if (!name) {
        return sendJson(res, 400, { error: 'Name des Herstellers darf nicht leer sein.' });
      }

      try {
        const result = db.prepare(
          'INSERT INTO manufacturers (name, country, empty_spool_weight_g) VALUES (?, ?, ?)'
        ).run(name, country, emptySpoolWeight);
        return sendJson(res, 201, {
          id: Number(result.lastInsertRowid),
          manufacturers: listManufacturers()
        });
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) {
          return sendJson(res, 409, { error: 'Dieser Hersteller existiert bereits.' });
        }
        throw err;
      }
    }

    const mfgMatch = pathname.match(/^\/api\/manufacturers\/(\d+)$/);
    if (mfgMatch) {
      const mfgId = Number(mfgMatch[1]);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const name = String(body.name || '').trim();
        const country = String(body.country || '').trim();
        const emptySpoolWeight = body.empty_spool_weight_g ? Number(body.empty_spool_weight_g) : 200;

        if (!name) {
          return sendJson(res, 400, { error: 'Name des Herstellers darf nicht leer sein.' });
        }

        try {
          db.prepare(
            'UPDATE manufacturers SET name = ?, country = ?, empty_spool_weight_g = ? WHERE id = ?'
          ).run(name, country, emptySpoolWeight, mfgId);
          return sendJson(res, 200, {
            manufacturers: listManufacturers(),
            filaments: listFilaments(),
            projects: listProjects()
          });
        } catch (err) {
          if (String(err.message).includes('UNIQUE')) {
            return sendJson(res, 409, { error: 'Ein Hersteller mit diesem Namen existiert bereits.' });
          }
          throw err;
        }
      }

      if (req.method === 'DELETE') {
        const usage = db.prepare('SELECT COUNT(*) as cnt FROM filaments WHERE manufacturer_id = ?').get(mfgId);
        if (usage && usage.cnt > 0) {
          return sendJson(res, 400, {
            error: `Hersteller kann nicht gelöscht werden, da noch ${usage.cnt} Spule(n) zugeordnet sind.`
          });
        }
        db.prepare('DELETE FROM manufacturers WHERE id = ?').run(mfgId);
        return sendJson(res, 200, { manufacturers: listManufacturers() });
      }
    }

    // --- Filaments API ---
    if (pathname === '/api/filaments' && req.method === 'GET') {
      return sendJson(res, 200, listFilaments());
    }

    if (pathname === '/api/filaments' && req.method === 'POST') {
      const body = await parseBody(req);
      const manufacturerId = Number(body.manufacturer_id);
      const material = String(body.material || 'PLA').trim() || 'PLA';
      const series = String(body.series || '').trim();
      const colorName = String(body.color_name || '').trim();
      const colorHex = String(body.color_hex || '#FF5F1F').trim();
      const purchasePrice = Number(body.purchase_price);
      const initialWeightG = Number(body.initial_weight_g);
      const remainingWeightG =
        body.remaining_weight_g !== undefined && body.remaining_weight_g !== ''
          ? Number(body.remaining_weight_g)
          : initialWeightG;
      const notes = String(body.notes || '').trim();

      if (!manufacturerId) {
        return sendJson(res, 400, { error: 'Bitte einen Hersteller auswählen.' });
      }
      if (!colorName) {
        return sendJson(res, 400, { error: 'Bitte eine Farbbezeichnung eingeben.' });
      }

      let pricePerKg;
      try {
        pricePerKg = computePricePerKg(purchasePrice, initialWeightG);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      if (!Number.isFinite(remainingWeightG) || remainingWeightG < 0) {
        return sendJson(res, 400, { error: 'Bitte eine gültige Restmenge (>= 0 g) eingeben.' });
      }

      db.prepare(`
        INSERT INTO filaments (
          manufacturer_id, material, series, color_name, color_hex,
          purchase_price, initial_weight_g, price_per_kg, remaining_weight_g, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        manufacturerId,
        material,
        series,
        colorName,
        colorHex,
        purchasePrice,
        initialWeightG,
        pricePerKg,
        remainingWeightG,
        notes
      );

      return sendJson(res, 201, {
        filaments: listFilaments(),
        manufacturers: listManufacturers(),
        projects: listProjects()
      });
    }

    const filamentMatch = pathname.match(/^\/api\/filaments\/(\d+)$/);
    if (filamentMatch) {
      const filamentId = Number(filamentMatch[1]);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const manufacturerId = Number(body.manufacturer_id);
        const material = String(body.material || 'PLA').trim() || 'PLA';
        const series = String(body.series || '').trim();
        const colorName = String(body.color_name || '').trim();
        const colorHex = String(body.color_hex || '#FF5F1F').trim();
        const purchasePrice = Number(body.purchase_price);
        const initialWeightG = Number(body.initial_weight_g);
        const remainingWeightG = Number(body.remaining_weight_g);
        const notes = String(body.notes || '').trim();

        if (!manufacturerId) {
          return sendJson(res, 400, { error: 'Bitte einen Hersteller auswählen.' });
        }
        if (!colorName) {
          return sendJson(res, 400, { error: 'Bitte eine Farbbezeichnung eingeben.' });
        }

        let pricePerKg;
        try {
          pricePerKg = computePricePerKg(purchasePrice, initialWeightG);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }

        if (!Number.isFinite(remainingWeightG) || remainingWeightG < 0) {
          return sendJson(res, 400, { error: 'Bitte eine gültige Restmenge (>= 0 g) eingeben.' });
        }

        db.prepare(`
          UPDATE filaments
          SET manufacturer_id = ?,
              material = ?,
              series = ?,
              color_name = ?,
              color_hex = ?,
              purchase_price = ?,
              initial_weight_g = ?,
              price_per_kg = ?,
              remaining_weight_g = ?,
              notes = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(
          manufacturerId,
          material,
          series,
          colorName,
          colorHex,
          purchasePrice,
          initialWeightG,
          pricePerKg,
          remainingWeightG,
          notes,
          filamentId
        );

        // Also update snapshots in project_items
        const snap = getFilamentSnapshot(filamentId);
        if (snap) {
          db.prepare(`
            UPDATE project_items
            SET snapshot_name = ?, snapshot_material = ?, snapshot_color_hex = ?, snapshot_price_per_kg = ?
            WHERE filament_id = ?
          `).run(
            `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
            snap.material,
            snap.color_hex,
            snap.price_per_kg,
            filamentId
          );
        }

        return sendJson(res, 200, {
          filaments: listFilaments(),
          manufacturers: listManufacturers(),
          projects: listProjects()
        });
      }

      if (req.method === 'PATCH') {
        const body = await parseBody(req);
        const current = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId);
        if (!current) {
          return sendJson(res, 404, { error: 'Spule nicht gefunden.' });
        }

        let newRemaining = current.remaining_weight_g;
        if (body.remaining_weight_g !== undefined) {
          newRemaining = Math.max(0, Number(body.remaining_weight_g));
        } else if (body.delta_g !== undefined) {
          newRemaining = Math.max(0, Number((current.remaining_weight_g + Number(body.delta_g)).toFixed(1)));
        }

        db.prepare(`
          UPDATE filaments
          SET remaining_weight_g = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newRemaining, filamentId);

        return sendJson(res, 200, {
          filaments: listFilaments(),
          projects: listProjects()
        });
      }

      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM filaments WHERE id = ?').run(filamentId);
        return sendJson(res, 200, {
          filaments: listFilaments(),
          manufacturers: listManufacturers(),
          projects: listProjects()
        });
      }
    }

    // --- Projects API ---
    if (pathname === '/api/projects' && req.method === 'GET') {
      return sendJson(res, 200, listProjects());
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const body = await parseBody(req);
      const name = String(body.name || '').trim();
      const notes = String(body.notes || '').trim();
      const printTime = String(body.print_time || '').trim();
      const imageData = String(body.image_data || '').trim();

      if (!name) {
        return sendJson(res, 400, { error: 'Bitte einen Projektnamen eingeben (z. B. Teebox).' });
      }

      const result = db.prepare(
        'INSERT INTO projects (name, notes, print_time, image_data) VALUES (?, ?, ?, ?)'
      ).run(name, notes, printTime, imageData);

      return sendJson(res, 201, {
        id: Number(result.lastInsertRowid),
        projects: listProjects()
      });
    }

    const projectMatch = pathname.match(/^\/api\/projects\/(\d+)$/);
    if (projectMatch) {
      const projectId = Number(projectMatch[1]);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const name = String(body.name || '').trim();
        const notes = String(body.notes || '').trim();
        const printTime = body.print_time !== undefined ? String(body.print_time || '').trim() : undefined;
        if (!name) {
          return sendJson(res, 400, { error: 'Projektname darf nicht leer sein.' });
        }
        const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (!current) {
          return sendJson(res, 404, { error: 'Projekt nicht gefunden.' });
        }
        const nextPrintTime = printTime !== undefined ? printTime : (current.print_time || '');
        const nextImageData = body.image_data !== undefined ? String(body.image_data || '') : (current.image_data || '');

        db.prepare('UPDATE projects SET name = ?, notes = ?, print_time = ?, image_data = ? WHERE id = ?')
          .run(name, notes, nextPrintTime, nextImageData, projectId);
        return sendJson(res, 200, { projects: listProjects() });
      }

      if (req.method === 'PATCH') {
        const body = await parseBody(req);
        if (body.image_data !== undefined) {
          db.prepare('UPDATE projects SET image_data = ? WHERE id = ?')
            .run(String(body.image_data || ''), projectId);
        }
        if (body.print_time !== undefined) {
          db.prepare('UPDATE projects SET print_time = ? WHERE id = ?')
            .run(String(body.print_time || '').trim(), projectId);
        }
        return sendJson(res, 200, { projects: listProjects() });
      }

      if (req.method === 'DELETE') {
        const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
        if (current && current.threemf_stored_name) {
          const oldPath = path.join(FILES_DIR, path.basename(current.threemf_stored_name));
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
        return sendJson(res, 200, { projects: listProjects() });
      }
    }

    const projectThreeMfMatch = pathname.match(/^\/api\/projects\/(\d+)\/threemf$/);
    if (projectThreeMfMatch) {
      const projectId = Number(projectThreeMfMatch[1]);
      const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!current) {
        return sendJson(res, 404, { error: 'Projekt nicht gefunden.' });
      }

      if (req.method === 'POST') {
        const rawFilename = req.headers['x-filename']
          ? decodeURIComponent(String(req.headers['x-filename']))
          : 'projekt.3mf';
        const cleanFilename = path.basename(rawFilename).replace(/[^\w.\- ()äöüÄÖÜß]/g, '_') || 'projekt.3mf';
        if (!cleanFilename.toLowerCase().endsWith('.3mf')) {
          return sendJson(res, 400, { error: 'Bitte eine gültige .3mf Datei wählen.' });
        }

        const buf = await parseRawBody(req);
        if (!buf || buf.length < 4) {
          return sendJson(res, 400, { error: 'Leere oder ungültige .3mf Datei.' });
        }

        // Remove previous 3mf file if exists
        if (current.threemf_stored_name) {
          const oldPath = path.join(FILES_DIR, path.basename(current.threemf_stored_name));
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }

        const storedName = `project_${projectId}_${Date.now()}_${cleanFilename}`;
        const storedPath = path.join(FILES_DIR, storedName);
        fs.writeFileSync(storedPath, buf);

        // Inspect 3mf archive for thumbnail, print time & sliced filament weights
        const inspected = inspectThreeMfFile(storedPath);
        const overwriteImage = req.headers['x-overwrite-image'] === '1';
        const replaceItems = req.headers['x-replace-items'] === '1';

        const nextImageData =
          inspected.thumbnailDataUrl && (!current.image_data || overwriteImage)
            ? inspected.thumbnailDataUrl
            : (current.image_data || '');

        const existingItemsCount = db
          .prepare('SELECT COUNT(*) as cnt FROM project_items WHERE project_id = ?')
          .get(projectId)?.cnt || 0;

        let nextPrintTime = current.print_time || '';
        if (inspected.printTime) {
          if (existingItemsCount > 0 && !replaceItems && current.print_time) {
            const prevSec = Math.round(parsePrintTimeToHours(current.print_time) * 3600);
            nextPrintTime = formatSecondsToPrintTime(prevSec + inspected.totalSeconds);
          } else {
            nextPrintTime = inspected.printTime;
          }
        }

        db.prepare(`
          UPDATE projects
          SET threemf_filename = ?,
              threemf_stored_name = ?,
              image_data = ?,
              print_time = ?
          WHERE id = ?
        `).run(cleanFilename, storedName, nextImageData, nextPrintTime, projectId);

        let itemsImported = 0;

        if (inspected.filaments.length > 0) {
          if (replaceItems && existingItemsCount > 0) {
            db.prepare('DELETE FROM project_items WHERE project_id = ?').run(projectId);
          }

          const allFilaments = listFilaments();
          const insertItem = db.prepare(`
            INSERT INTO project_items (
              project_id, filament_id, label, weight_g,
              snapshot_name, snapshot_material, snapshot_color_hex, snapshot_price_per_kg
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const fil of inspected.filaments) {
            const matched = findBestMatchingSpool(fil.material, fil.color_hex, allFilaments);
            if (matched) {
              insertItem.run(
                projectId,
                matched.id,
                fil.label,
                fil.weight_g,
                `${matched.manufacturer_name} ${matched.material} (${matched.color_name})`,
                matched.material,
                matched.color_hex,
                matched.price_per_kg
              );
            } else {
              insertItem.run(
                projectId,
                null,
                fil.label,
                fil.weight_g,
                `Aus 3MF: ${fil.material}`,
                fil.material,
                fil.color_hex,
                0
              );
            }
            itemsImported++;
          }
        }

        return sendJson(res, 200, {
          projects: listProjects(),
          imported: {
            filename: cleanFilename,
            thumbnailImported: Boolean(inspected.thumbnailDataUrl && (!current.image_data || overwriteImage)),
            printTime: inspected.printTime || '',
            itemsImported,
            availableSlicedFilaments: inspected.filaments.length
          }
        });
      }

      if (req.method === 'GET') {
        if (!current.threemf_stored_name) {
          return sendJson(res, 404, { error: 'Keine .3mf Datei für dieses Projekt hinterlegt.' });
        }
        const storedPath = path.join(FILES_DIR, path.basename(current.threemf_stored_name));
        if (!fs.existsSync(storedPath)) {
          return sendJson(res, 404, { error: '.3mf Datei wurde auf der Festplatte nicht gefunden.' });
        }
        const downloadName = current.threemf_filename || 'projekt.3mf';
        res.writeHead(200, {
          'Content-Type': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`
        });
        fs.createReadStream(storedPath).pipe(res);
        return;
      }

      if (req.method === 'DELETE') {
        if (current.threemf_stored_name) {
          const oldPath = path.join(FILES_DIR, path.basename(current.threemf_stored_name));
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (_) {}
          }
        }
        db.prepare(`
          UPDATE projects
          SET threemf_filename = '', threemf_stored_name = ''
          WHERE id = ?
        `).run(projectId);
        return sendJson(res, 200, { projects: listProjects() });
      }
    }

    const openSlicerMatch = pathname.match(/^\/api\/projects\/(\d+)\/open-slicer$/);
    if (openSlicerMatch && req.method === 'POST') {
      const projectId = Number(openSlicerMatch[1]);
      const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
      if (!current || !current.threemf_stored_name) {
        return sendJson(res, 404, { error: 'Keine .3mf Datei an dieses Projekt angehängt.' });
      }
      const storedPath = path.join(FILES_DIR, path.basename(current.threemf_stored_name));
      if (!fs.existsSync(storedPath)) {
        return sendJson(res, 404, { error: 'Die .3mf Datei wurde auf dem Datenträger nicht gefunden.' });
      }

      await new Promise((resolve, reject) => {
        const appPath = fs.existsSync('/Applications/BambuStudio.app')
          ? '/Applications/BambuStudio.app'
          : 'BambuStudio';
        execFile('/usr/bin/open', ['-a', appPath, storedPath], err => {
          if (!err) return resolve();
          execFile('/usr/bin/open', ['-b', 'com.bambulab.bambu-studio', storedPath], err2 => {
            if (!err2) return resolve();
            execFile('/usr/bin/open', [storedPath], err3 => {
              if (!err3) return resolve();
              reject(new Error('Bambu Studio konnte nicht geöffnet werden.'));
            });
          });
        });
      });

      return sendJson(res, 200, {
        ok: true,
        filename: current.threemf_filename
      });
    }

    const projectItemsMatch = pathname.match(/^\/api\/projects\/(\d+)\/items$/);
    if (projectItemsMatch && req.method === 'POST') {
      const projectId = Number(projectItemsMatch[1]);
      const body = await parseBody(req);
      const filamentId = Number(body.filament_id);
      const label = String(body.label || '').trim();
      const weightG = Number(body.weight_g);

      if (!filamentId) {
        return sendJson(res, 400, { error: 'Bitte ein Filament auswählen.' });
      }
      if (!Number.isFinite(weightG) || weightG <= 0) {
        return sendJson(res, 400, { error: 'Bitte ein gültiges Gewicht (> 0 g) eingeben.' });
      }

      const snap = getFilamentSnapshot(filamentId);
      if (!snap) {
        return sendJson(res, 404, { error: 'Ausgewähltes Filament wurde nicht gefunden.' });
      }

      db.prepare(`
        INSERT INTO project_items (
          project_id, filament_id, label, weight_g,
          snapshot_name, snapshot_material, snapshot_color_hex, snapshot_price_per_kg
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        filamentId,
        label,
        weightG,
        `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
        snap.material,
        snap.color_hex,
        snap.price_per_kg
      );

      return sendJson(res, 201, { projects: listProjects() });
    }

    const projectDeductMatch = pathname.match(/^\/api\/projects\/(\d+)\/deduct$/);
    if (projectDeductMatch && req.method === 'POST') {
      const projectId = Number(projectDeductMatch[1]);
      const items = db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
      const updateSpool = db.prepare(`
        UPDATE filaments
        SET remaining_weight_g = MAX(0, ROUND(remaining_weight_g - ?, 1)),
            updated_at = datetime('now')
        WHERE id = ?
      `);

      for (const item of items) {
        if (item.filament_id && item.weight_g > 0) {
          updateSpool.run(Number(item.weight_g), Number(item.filament_id));
        }
      }

      return sendJson(res, 200, {
        filaments: listFilaments(),
        projects: listProjects()
      });
    }

    const itemMatch = pathname.match(/^\/api\/project-items\/(\d+)$/);
    if (itemMatch) {
      const itemId = Number(itemMatch[1]);

      if (req.method === 'PUT') {
        const body = await parseBody(req);
        const filamentId = Number(body.filament_id);
        const label = String(body.label || '').trim();
        const weightG = Number(body.weight_g);

        if (!filamentId) {
          return sendJson(res, 400, { error: 'Bitte ein Filament auswählen.' });
        }
        if (!Number.isFinite(weightG) || weightG <= 0) {
          return sendJson(res, 400, { error: 'Bitte ein gültiges Gewicht (> 0 g) eingeben.' });
        }

        const existingItem = db.prepare(`
          SELECT pi.*, f.material AS current_material
          FROM project_items pi
          LEFT JOIN filaments f ON f.id = pi.filament_id
          WHERE pi.id = ?
        `).get(itemId);

        if (!existingItem) {
          return sendJson(res, 404, { error: 'Projektposition nicht gefunden.' });
        }

        const snap = getFilamentSnapshot(filamentId);
        if (!snap) {
          return sendJson(res, 404, { error: 'Filament nicht gefunden.' });
        }

        const requiredMaterial = (existingItem.current_material || existingItem.snapshot_material || '').trim();
        if (
          requiredMaterial &&
          requiredMaterial.toLowerCase() !== String(snap.material || '').trim().toLowerCase()
        ) {
          return sendJson(res, 400, {
            error: `Materialwechsel nicht erlaubt: Diese Position erfordert ${requiredMaterial} (gewählt: ${snap.material}).`
          });
        }

        db.prepare(`
          UPDATE project_items
          SET filament_id = ?,
              label = ?,
              weight_g = ?,
              snapshot_name = ?,
              snapshot_material = ?,
              snapshot_color_hex = ?,
              snapshot_price_per_kg = ?
          WHERE id = ?
        `).run(
          filamentId,
          label,
          weightG,
          `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
          snap.material,
          snap.color_hex,
          snap.price_per_kg,
          itemId
        );

        return sendJson(res, 200, { projects: listProjects() });
      }

      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM project_items WHERE id = ?').run(itemId);
        return sendJson(res, 200, { projects: listProjects() });
      }
    }

    // --- Static Files ---
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
    const fullPath = path.join(PUBLIC_DIR, safePath);

    if (fullPath.startsWith(PUBLIC_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(fullPath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: 'Nicht gefunden' });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Interner Serverfehler' });
  }
});

server.listen(PORT, () => {
  console.log(`Filament-Manager läuft auf http://localhost:${PORT}`);
});
