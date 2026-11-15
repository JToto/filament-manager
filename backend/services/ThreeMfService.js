const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { HttpUtils } = require('../utils/HttpUtils');

/**
 * ThreeMfService — Kapselt die Analyse von Bambu Studio / MakerWorld `.3mf` Dateien,
 * das automatische Headless-Slicing ungeslicter Projekte über die Bambu Studio CLI,
 * das Farb- und Material-Matching zu vorhandenen Spulen sowie das Öffnen in Bambu Studio.
 */
class ThreeMfService {
  constructor() {
    this.bambuCliBin = '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
  }

  /**
   * Wandelt einen Hex-Farbcode (#RRGGBB) in ein { r, g, b } Objekt um.
   */
  hexToRgb(hex) {
    const clean = String(hex || '').trim().replace(/^#/, '').slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  /**
   * Sucht die am besten passende Filament-Spule aus dem Bestand anhand der
   * Grundmaterial-Familie (z. B. PLA === PLA+) und des geringsten RGB-Farbabstands.
   */
  findBestMatchingSpool(materialType, colorHex, allFilaments) {
    const targetBase = HttpUtils.getBaseMaterial(materialType);
    if (!targetBase || !Array.isArray(allFilaments) || allFilaments.length === 0) {
      return null;
    }

    // 1. Exakter Material-Match (z. B. "PLA" === "PLA")
    const normExact = String(materialType || '').trim().toLowerCase();
    let candidates = allFilaments.filter(
      f => String(f.material || '').trim().toLowerCase() === normExact
    );

    // 2. Fallback auf Grundmaterial-Familie (z. B. "PLA" matcht auch "PLA+", "PLA Matte")
    if (candidates.length === 0) {
      candidates = allFilaments.filter(
        f => HttpUtils.getBaseMaterial(f.material) === targetBase
      );
    }

    if (candidates.length === 0) return null;

    const targetRgb = this.hexToRgb(colorHex);
    if (!targetRgb) return candidates[0];

    let best = candidates[0];
    let bestDist = Infinity;
    for (const cand of candidates) {
      const rgb = this.hexToRgb(cand.color_hex);
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

  /**
   * Parst XML-Attribute eines Tags in ein Key-Value-Objekt.
   */
  parseXmlAttributes(tagStr) {
    const attrs = {};
    const re = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tagStr)) !== null) {
      attrs[m[1]] = m[2];
    }
    return attrs;
  }

  /**
   * Parst die `Metadata/slice_info.config` XML einer bereits geslicten .3mf Datei.
   */
  parseSliceInfoXml(xml) {
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
          const attrs = this.parseXmlAttributes(mm[1]);
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
          .map(om => this.parseXmlAttributes(om[1]))
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
          const attrs = this.parseXmlAttributes(fm[1]);
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

  /**
   * Parst die `result.json`, die beim Headless-Slicing über die Bambu Studio CLI erzeugt wird.
   */
  parseCliResultJson(resultJsonStr, projectSettings) {
    let data;
    try {
      data = JSON.parse(resultJsonStr);
    } catch (_) {
      return { totalSec: 0, extractedFilaments: [] };
    }

    const plates = Array.isArray(data?.sliced_plates) ? data.sliced_plates : [];
    const filTypes = Array.isArray(projectSettings?.filament_type) ? projectSettings.filament_type : [];
    const filColors = Array.isArray(projectSettings?.filament_colour) ? projectSettings.filament_colour : [];

    let totalSec = 0;
    const extractedFilaments = [];

    plates.forEach((plate, idx) => {
      const plateIndex = Number(plate.id) || idx + 1;
      const predSec = Number(plate.total_predication || plate.main_predication || 0);
      if (Number.isFinite(predSec) && predSec > 0) {
        totalSec += predSec;
      }

      const objs = Array.isArray(plate.objects) ? plate.objects : [];
      const objNames = objs
        .map(o => String(o?.name || '').replace(/\.(stl|step|stp|obj|3mf)$/i, '').trim())
        .filter(Boolean);
      const uniqueObjNames = [...new Set(objNames)];
      const objSuffix =
        uniqueObjNames.length === 1 && !/^object_\d+$/i.test(uniqueObjNames[0])
          ? uniqueObjNames[0]
          : '';

      const fils = Array.isArray(plate.filaments) ? plate.filaments : [];
      for (const f of fils) {
        const usedG = Number(f.total_used_g ?? f.main_used_g ?? 0);
        if (!Number.isFinite(usedG) || usedG <= 0) continue;

        const slotId = Number(f.id) || 1;
        const slotIdx = Math.max(0, slotId - 1);
        const type = String(filTypes[slotIdx] || filTypes[0] || 'PLA').trim();
        const rawColor = String(filColors[slotIdx] || filColors[0] || '#FF5F1F').trim();
        const colorHex = rawColor.startsWith('#') ? rawColor.slice(0, 7) : `#${rawColor.slice(0, 6)}`;

        const labelPrefix = objSuffix
          ? `Platte ${plateIndex} – ${objSuffix}`
          : `Platte ${plateIndex}`;
        const label =
          fils.length > 1
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

    return { totalSec, extractedFilaments };
  }

  /**
   * Analysiert eine .3mf Datei:
   * 1. Extrahiert das Druckplatten-Vorschaubild als Base64 Data-URL
   * 2. Liest vorhandene Slice-Metadaten (`Metadata/slice_info.config`)
   * 3. Falls ungeslict: Führt ein schnelles Headless-Slicing via Bambu Studio CLI aus (`result.json`)
   */
  async inspectThreeMfFile(filePath) {
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
    } catch (_) {
      return result;
    }

    // 1. Vorschaubild extrahieren
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
      } catch (_) {}
    }

    // 2. Bereits vorhandene Slice-Infos prüfen
    let parsed = { totalSec: 0, extractedFilaments: [] };
    if (entries.includes('Metadata/slice_info.config')) {
      try {
        const xml = execFileSync('unzip', ['-p', filePath, 'Metadata/slice_info.config'], {
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024
        });
        parsed = this.parseSliceInfoXml(xml);
      } catch (_) {}
    }

    // 3. Falls ungeslict: Headless Bambu Studio CLI Slicing ohne Re-Komprimierung (--no-check)
    if (parsed.extractedFilaments.length === 0 && fs.existsSync(this.bambuCliBin)) {
      let projectSettings = {};
      if (entries.includes('Metadata/project_settings.config')) {
        try {
          const psRaw = execFileSync('unzip', ['-p', filePath, 'Metadata/project_settings.config'], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
          });
          projectSettings = JSON.parse(psRaw);
        } catch (_) {}
      }

      const cliDataDir = '/tmp/spoolmate_bambu_datadir';
      const tmpOutDir = `/tmp/spoolmate_slice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        fs.mkdirSync(cliDataDir, { recursive: true });
        fs.mkdirSync(tmpOutDir, { recursive: true });
        await new Promise(resolve => {
          execFile(
            this.bambuCliBin,
            ['--datadir', cliDataDir, '--slice', '0', '--no-check', '--outputdir', tmpOutDir, filePath],
            { timeout: 120000 },
            () => resolve()
          );
        });
        const resultJsonPath = path.join(tmpOutDir, 'result.json');
        if (fs.existsSync(resultJsonPath)) {
          const resultJsonStr = fs.readFileSync(resultJsonPath, 'utf8');
          parsed = this.parseCliResultJson(resultJsonStr, projectSettings);
        }
      } catch (_) {
        // Ignore CLI slice error
      } finally {
        try {
          fs.rmSync(tmpOutDir, { recursive: true, force: true });
        } catch (_) {}
      }
    }

    if (parsed.totalSec > 0) {
      result.totalSeconds = parsed.totalSec;
      result.printTime = HttpUtils.formatSecondsToPrintTime(parsed.totalSec);
    }
    result.filaments = parsed.extractedFilaments;

    return result;
  }

  /**
   * Öffnet eine lokal gespeicherte .3mf Datei direkt in Bambu Studio (macOS).
   */
  openInBambuStudio(storedPath) {
    return new Promise((resolve, reject) => {
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
  }
}

module.exports = { ThreeMfService };
