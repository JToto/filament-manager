const fs = require('node:fs');
const path = require('node:path');
const { HttpUtils } = require('../utils/HttpUtils');

/**
 * ProjectService — Geschäftslogik (@Service) für Druckprojekte,
 * Kostenkalkulation (Material + Strom), Bestandsabzug, .3mf Auto-Import und Bambu Studio Integration.
 */
class ProjectService {
  constructor(projectRepo, filamentRepo, settingsRepo, threeMfService, filesDir) {
    this.projectRepo = projectRepo;
    this.filamentRepo = filamentRepo;
    this.settingsRepo = settingsRepo;
    this.threeMfService = threeMfService;
    this.filesDir = filesDir;
  }

  /**
   * Liefert alle Projekte inkl. aufbereiteter Positionen sowie berechneter Material- und Stromkosten.
   */
  listProjects() {
    const settings = this.settingsRepo.getSettings();
    const projects = this.projectRepo.findAllProjectsRaw();
    const items = this.projectRepo.findAllProjectItemsJoined();

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
        price_per_kg_snapshot: pricePerKg,
        color_hex: colorHex || '#FF5F1F',
        filament_name: filamentDisplayName,
        filament_label: filamentDisplayName,
        remaining_weight_g: row.filament_id ? Number(row.filament_remaining_weight_g) : null,
        cost,
        cost_eur: cost
      };

      if (!itemsByProject.has(row.project_id)) {
        itemsByProject.set(row.project_id, []);
      }
      itemsByProject.get(row.project_id).push(enriched);
    }

    return projects.map((p) => {
      const pItems = itemsByProject.get(p.id) || [];
      const totalWeightG = Number(pItems.reduce((sum, i) => sum + i.weight_g, 0).toFixed(1));
      const materialCost = Number(pItems.reduce((sum, i) => sum + i.cost, 0).toFixed(2));
      const printHours = HttpUtils.parsePrintTimeToHours(p.print_time);
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

  createProject(payload) {
    const name = String(payload.name || '').trim();
    const notes = String(payload.notes || '').trim();
    const printTime = String(payload.print_time || '').trim();
    const imageData = String(payload.image_data || '').trim();

    if (!name) {
      const err = new Error('Bitte einen Projektnamen eingeben (z. B. Teebox).');
      err.statusCode = 400;
      throw err;
    }

    const id = this.projectRepo.createProject({ name, notes, printTime, imageData });
    const projects = this.listProjects();
    const project = projects.find((p) => p.id === id) || { id, name };
    return { id, project, projects };
  }

  updateProject(projectId, payload) {
    if (payload.name === undefined) {
      return this.patchProject(projectId, payload);
    }

    const name = String(payload.name || '').trim();
    const notes =
      payload.notes !== undefined
        ? String(payload.notes || '').trim()
        : undefined;
    const printTime =
      payload.print_time !== undefined
        ? String(payload.print_time || '').trim()
        : undefined;

    if (!name) {
      const err = new Error('Projektname darf nicht leer sein.');
      err.statusCode = 400;
      throw err;
    }

    const current = this.projectRepo.findProjectById(projectId);
    if (!current) {
      const err = new Error('Projekt nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    const nextNotes = notes !== undefined ? notes : (current.notes || '');
    const nextPrintTime = printTime !== undefined ? printTime : (current.print_time || '');
    const nextImageData =
      payload.image_data !== undefined
        ? String(payload.image_data || '')
        : (current.image_data || '');

    this.projectRepo.updateProject(projectId, {
      name,
      notes: nextNotes,
      printTime: nextPrintTime,
      imageData: nextImageData
    });

    return this.listProjects();
  }

  patchProject(projectId, payload) {
    if (payload.image_data !== undefined) {
      this.projectRepo.updateProjectImage(projectId, String(payload.image_data || ''));
    }
    if (payload.print_time !== undefined) {
      this.projectRepo.updateProjectPrintTime(
        projectId,
        String(payload.print_time || '').trim()
      );
    }
    return this.listProjects();
  }

  deleteProject(projectId) {
    const current = this.projectRepo.findProjectById(projectId);
    if (current && current.threemf_stored_name) {
      this.unlinkStoredThreeMf(current.threemf_stored_name);
    }
    this.projectRepo.deleteProjectById(projectId);
    return this.listProjects();
  }

  unlinkStoredThreeMf(storedName) {
    if (!storedName) return;
    const oldPath = path.join(this.filesDir, path.basename(storedName));
    if (fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch (_) {}
    }
  }

  async uploadAndImportThreeMf(
    projectId,
    { rawFilename, buffer, overwriteImage, replaceItems }
  ) {
    const current = this.projectRepo.findProjectById(projectId);
    if (!current) {
      const err = new Error('Projekt nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    const cleanFilename =
      path
        .basename(rawFilename || 'projekt.3mf')
        .replace(/[^\w.\- ()äöüÄÖÜß]/g, '_') || 'projekt.3mf';
    if (!cleanFilename.toLowerCase().endsWith('.3mf')) {
      const err = new Error('Bitte eine gültige .3mf Datei wählen.');
      err.statusCode = 400;
      throw err;
    }
    if (!buffer || buffer.length < 4) {
      const err = new Error('Leere oder ungültige .3mf Datei.');
      err.statusCode = 400;
      throw err;
    }

    if (current.threemf_stored_name) {
      this.unlinkStoredThreeMf(current.threemf_stored_name);
    }

    const storedName = `project_${projectId}_${Date.now()}_${cleanFilename}`;
    const storedPath = path.join(this.filesDir, storedName);
    fs.writeFileSync(storedPath, buffer);

    const inspected = await this.threeMfService.inspectThreeMfFile(storedPath);
    const nextImageData =
      inspected.thumbnailDataUrl && (!current.image_data || overwriteImage)
        ? inspected.thumbnailDataUrl
        : (current.image_data || '');

    const existingItemsCount = this.projectRepo.countItemsByProjectId(projectId);
    let nextPrintTime = current.print_time || '';
    if (inspected.printTime) {
      if (existingItemsCount > 0 && !replaceItems && current.print_time) {
        const prevSec = Math.round(HttpUtils.parsePrintTimeToHours(current.print_time) * 3600);
        nextPrintTime = HttpUtils.formatSecondsToPrintTime(prevSec + inspected.totalSeconds);
      } else {
        nextPrintTime = inspected.printTime;
      }
    }

    this.projectRepo.updateProjectThreeMf(projectId, {
      threemfFilename: cleanFilename,
      threemfStoredName: storedName,
      imageData: nextImageData,
      printTime: nextPrintTime
    });

    let itemsImported = 0;
    let totalWeightG = 0;
    if (inspected.filaments.length > 0) {
      if (replaceItems && existingItemsCount > 0) {
        this.projectRepo.deleteItemsByProjectId(projectId);
      }

      const allFilaments = this.filamentRepo.findAll();
      for (const fil of inspected.filaments) {
        totalWeightG += Number(fil.weight_g) || 0;
        const matched = this.threeMfService.findBestMatchingSpool(
          fil.material,
          fil.color_hex,
          allFilaments
        );
        if (matched) {
          this.projectRepo.createProjectItem({
            projectId,
            filamentId: matched.id,
            label: fil.label,
            weightG: fil.weight_g,
            snapshotName: `${matched.manufacturer_name} ${matched.material} (${matched.color_name})`,
            snapshotMaterial: matched.material,
            snapshotColorHex: matched.color_hex,
            snapshotPricePerKg: matched.price_per_kg
          });
        } else {
          this.projectRepo.createProjectItem({
            projectId,
            filamentId: null,
            label: fil.label,
            weightG: fil.weight_g,
            snapshotName: `Aus 3MF: ${fil.material}`,
            snapshotMaterial: fil.material,
            snapshotColorHex: fil.color_hex,
            snapshotPricePerKg: 0
          });
        }
        itemsImported++;
      }
    }

    const hasThumbnail = Boolean(
      inspected.thumbnailDataUrl && (!current.image_data || overwriteImage)
    );

    return {
      projects: this.listProjects(),
      imported: {
        filename: cleanFilename,
        thumbnailImported: hasThumbnail,
        hasThumbnail,
        printTime: inspected.printTime || '',
        itemsImported,
        importedItemCount: itemsImported,
        totalWeightG: Number(totalWeightG.toFixed(1)),
        slicedViaCli: Boolean(inspected.slicedViaCli),
        availableSlicedFilaments: inspected.filaments.length
      }
    };
  }

  getThreeMfDownloadInfo(projectId) {
    const current = this.projectRepo.findProjectById(projectId);
    if (!current || !current.threemf_stored_name) {
      const err = new Error('Keine .3mf Datei für dieses Projekt hinterlegt.');
      err.statusCode = 404;
      throw err;
    }
    const storedPath = path.join(this.filesDir, path.basename(current.threemf_stored_name));
    if (!fs.existsSync(storedPath)) {
      const err = new Error('.3mf Datei wurde auf der Festplatte nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }
    return {
      storedPath,
      downloadName: current.threemf_filename || 'projekt.3mf'
    };
  }

  removeThreeMf(projectId) {
    const current = this.projectRepo.findProjectById(projectId);
    if (!current) {
      const err = new Error('Projekt nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }
    if (current.threemf_stored_name) {
      this.unlinkStoredThreeMf(current.threemf_stored_name);
    }
    this.projectRepo.clearProjectThreeMf(projectId);
    return this.listProjects();
  }

  async openInBambuStudio(projectId) {
    const { storedPath, downloadName } = this.getThreeMfDownloadInfo(projectId);
    await this.threeMfService.openInBambuStudio(storedPath);
    return { ok: true, filename: downloadName };
  }

  addProjectItem(projectId, payload) {
    const filamentId = Number(payload.filament_id);
    const label = String(payload.label || '').trim();
    const weightG = Number(payload.weight_g);

    if (!filamentId) {
      const err = new Error('Bitte ein Filament auswählen.');
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(weightG) || weightG <= 0) {
      const err = new Error('Bitte ein gültiges Gewicht (> 0 g) eingeben.');
      err.statusCode = 400;
      throw err;
    }

    const snap = this.filamentRepo.findWithManufacturerById(filamentId);
    if (!snap) {
      const err = new Error('Ausgewähltes Filament wurde nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    this.projectRepo.createProjectItem({
      projectId,
      filamentId,
      label,
      weightG,
      snapshotName: `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
      snapshotMaterial: snap.material,
      snapshotColorHex: snap.color_hex,
      snapshotPricePerKg: snap.price_per_kg
    });

    return this.listProjects();
  }

  updateProjectItem(itemId, payload) {
    const existingItem = this.projectRepo.findItemWithFilamentById(itemId);
    if (!existingItem) {
      const err = new Error('Projektposition nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    const filamentId =
      payload.filament_id !== undefined
        ? Number(payload.filament_id)
        : Number(existingItem.filament_id);
    const label =
      payload.label !== undefined
        ? String(payload.label || '').trim()
        : String(existingItem.label || '');
    const weightG =
      payload.weight_g !== undefined
        ? Number(payload.weight_g)
        : Number(existingItem.weight_g);

    if (!Number.isFinite(weightG) || weightG <= 0) {
      const err = new Error('Bitte ein gültiges Gewicht (> 0 g) eingeben.');
      err.statusCode = 400;
      throw err;
    }

    // Falls kein Filament verknüpft ist (z. B. ungematchter 3MF-Import) und nur Label/Gewicht geändert wird:
    if (!filamentId) {
      this.projectRepo.updateProjectItem(itemId, {
        filamentId: null,
        label,
        weightG,
        snapshotName: existingItem.snapshot_name || '',
        snapshotMaterial: existingItem.snapshot_material || '',
        snapshotColorHex: existingItem.snapshot_color_hex || '#FF5F1F',
        snapshotPricePerKg: existingItem.snapshot_price_per_kg || 0
      });
      return this.listProjects();
    }

    const snap = this.filamentRepo.findWithManufacturerById(filamentId);
    if (!snap) {
      const err = new Error('Filament nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    const requiredMaterial = (
      existingItem.current_material ||
      existingItem.snapshot_material ||
      ''
    ).trim();
    const reqBase = HttpUtils.getBaseMaterial(requiredMaterial);
    const snapBase = HttpUtils.getBaseMaterial(snap.material);

    if (reqBase && snapBase && reqBase !== snapBase) {
      const err = new Error(
        `Materialwechsel nicht erlaubt: Diese Position erfordert ${reqBase} (gewählt: ${snap.material}).`
      );
      err.statusCode = 400;
      throw err;
    }

    this.projectRepo.updateProjectItem(itemId, {
      filamentId,
      label,
      weightG,
      snapshotName: `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
      snapshotMaterial: snap.material,
      snapshotColorHex: snap.color_hex,
      snapshotPricePerKg: snap.price_per_kg
    });

    return this.listProjects();
  }

  deleteProjectItem(itemId) {
    this.projectRepo.deleteItemById(itemId);
    return this.listProjects();
  }

  deductProjectFromStock(projectId) {
    const items = this.projectRepo.findItemsByProjectId(projectId);
    let deductedCount = 0;
    for (const item of items) {
      if (item.filament_id && item.weight_g > 0) {
        this.filamentRepo.deductWeight(item.filament_id, item.weight_g);
        deductedCount++;
      }
    }
    const filaments = this.filamentRepo.findAll().map((row) => ({
      ...row,
      spool_weight_g: Number(row.initial_weight_g) || 1000,
      price_eur: Number(row.purchase_price) || 0,
      diameter_mm: Number(row.diameter_mm) || 1.75
    }));
    return {
      filaments,
      projects: this.listProjects(),
      deductedCount
    };
  }
}

module.exports = { ProjectService };
