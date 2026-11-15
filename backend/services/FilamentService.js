const { HttpUtils } = require('../utils/HttpUtils');

/**
 * FilamentService — Geschäftslogik (@Service) für Filament-Spulen,
 * inkl. automatischer Kilopreis-Berechnung und Snapshot-Synchronisierung in Projekten.
 */
class FilamentService {
  constructor(filamentRepo, projectRepo) {
    this.filamentRepo = filamentRepo;
    this.projectRepo = projectRepo;
  }

  listFilaments() {
    return this.filamentRepo.findAll().map((row) => ({
      ...row,
      spool_weight_g: Number(row.initial_weight_g) || 1000,
      price_eur: Number(row.purchase_price) || 0,
      diameter_mm: Number(row.diameter_mm) || 1.75
    }));
  }

  validateAndNormalize(payload, isUpdate = false) {
    const manufacturerId = Number(payload.manufacturer_id);
    const material = String(payload.material || 'PLA').trim() || 'PLA';
    const series = String(payload.series || '').trim();
    const colorName = String(payload.color_name || '').trim();
    const colorHex = String(payload.color_hex || '#FF5F1F').trim();
    const purchasePrice = Number(
      payload.purchase_price !== undefined ? payload.purchase_price : payload.price_eur
    );
    const initialWeightG = Number(
      payload.initial_weight_g !== undefined ? payload.initial_weight_g : payload.spool_weight_g
    );
    const remainingWeightG =
      !isUpdate && (payload.remaining_weight_g === undefined || payload.remaining_weight_g === '')
        ? initialWeightG
        : Number(payload.remaining_weight_g);
    const notes = String(payload.notes || '').trim();

    if (!manufacturerId) {
      const err = new Error('Bitte einen Hersteller auswählen.');
      err.statusCode = 400;
      throw err;
    }
    if (!colorName) {
      const err = new Error('Bitte eine Farbbezeichnung eingeben.');
      err.statusCode = 400;
      throw err;
    }

    let pricePerKg;
    try {
      pricePerKg = HttpUtils.computePricePerKg(purchasePrice, initialWeightG);
    } catch (e) {
      e.statusCode = 400;
      throw e;
    }

    if (!Number.isFinite(remainingWeightG) || remainingWeightG < 0) {
      const err = new Error('Bitte eine gültige Restmenge (>= 0 g) eingeben.');
      err.statusCode = 400;
      throw err;
    }

    return {
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
    };
  }

  createFilament(payload) {
    const normalized = this.validateAndNormalize(payload, false);
    this.filamentRepo.create(normalized);
    return this.listFilaments();
  }

  updateFilament(id, payload) {
    const normalized = this.validateAndNormalize(payload, true);
    this.filamentRepo.update(id, normalized);

    const snap = this.filamentRepo.findWithManufacturerById(id);
    if (snap) {
      this.projectRepo.updateSnapshotsForFilament(id, {
        snapshotName: `${snap.manufacturer_name} ${snap.material} (${snap.color_name})`,
        snapshotMaterial: snap.material,
        snapshotColorHex: snap.color_hex,
        snapshotPricePerKg: snap.price_per_kg
      });
    }

    return this.listFilaments();
  }

  patchWeight(id, payload) {
    const current = this.filamentRepo.findById(id);
    if (!current) {
      const err = new Error('Spule nicht gefunden.');
      err.statusCode = 404;
      throw err;
    }

    let newRemaining = current.remaining_weight_g;
    if (payload.remaining_weight_g !== undefined) {
      newRemaining = Math.max(0, Number(payload.remaining_weight_g));
    } else if (payload.delta_g !== undefined) {
      newRemaining = Math.max(
        0,
        Number((current.remaining_weight_g + Number(payload.delta_g)).toFixed(1))
      );
    }

    this.filamentRepo.updateRemainingWeight(id, newRemaining);
    return this.listFilaments();
  }

  deleteFilament(id) {
    this.filamentRepo.deleteById(id);
    return this.listFilaments();
  }
}

module.exports = { FilamentService };
