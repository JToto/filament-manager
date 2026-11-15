/**
 * ManufacturerService — Geschäftslogik (@Service) für Hersteller.
 */
class ManufacturerService {
  constructor(manufacturerRepo) {
    this.manufacturerRepo = manufacturerRepo;
  }

  listManufacturers() {
    return this.manufacturerRepo.findAll().map((m) => ({
      ...m,
      website: m.country && m.country.startsWith('http') ? m.country : ''
    }));
  }

  createManufacturer(payload) {
    const name = String(payload.name || '').trim();
    const country = String(payload.country || payload.website || '').trim();
    const emptySpoolWeightG = payload.empty_spool_weight_g ? Number(payload.empty_spool_weight_g) : 200;

    if (!name) {
      const err = new Error('Name des Herstellers darf nicht leer sein.');
      err.statusCode = 400;
      throw err;
    }

    try {
      const id = this.manufacturerRepo.create({ name, country, emptySpoolWeightG });
      const manufacturers = this.listManufacturers();
      const manufacturer = manufacturers.find((m) => m.id === id) || { id, name, website: country };
      return { id, manufacturer, manufacturers };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        const conflict = new Error('Dieser Hersteller existiert bereits.');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }
  }

  updateManufacturer(id, payload) {
    const name = String(payload.name || '').trim();
    const country = String(payload.country || payload.website || '').trim();
    const emptySpoolWeightG = payload.empty_spool_weight_g ? Number(payload.empty_spool_weight_g) : 200;

    if (!name) {
      const err = new Error('Name des Herstellers darf nicht leer sein.');
      err.statusCode = 400;
      throw err;
    }

    try {
      this.manufacturerRepo.update(id, { name, country, emptySpoolWeightG });
      return this.listManufacturers();
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        const conflict = new Error('Ein Hersteller mit diesem Namen existiert bereits.');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw err;
    }
  }

  deleteManufacturer(id) {
    const usageCount = this.manufacturerRepo.countFilamentsByManufacturer(id);
    if (usageCount > 0) {
      const err = new Error(
        `Hersteller kann nicht gelöscht werden, da noch ${usageCount} Spule(n) zugeordnet sind.`
      );
      err.statusCode = 400;
      throw err;
    }
    this.manufacturerRepo.deleteById(id);
    return this.listManufacturers();
  }
}

module.exports = { ManufacturerService };
