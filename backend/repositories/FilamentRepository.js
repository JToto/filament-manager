/**
 * FilamentRepository — Datenzugriffsschicht (DAO/Repository) für Filament-Spulen (`filaments`).
 */
class FilamentRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Liefert alle Filament-Spulen absteigend nach ID inkl. Herstellername.
   */
  findAll() {
    return this.db.prepare(`
      SELECT
        f.*,
        m.name AS manufacturer_name,
        m.empty_spool_weight_g AS manufacturer_spool_weight_g
      FROM filaments f
      JOIN manufacturers m ON m.id = f.manufacturer_id
      ORDER BY f.id DESC
    `).all();
  }

  /**
   * Sucht eine einzelne Spule anhand ihrer ID.
   */
  findById(id) {
    return this.db.prepare('SELECT * FROM filaments WHERE id = ?').get(id);
  }

  /**
   * Liefert eine Spule inkl. Herstellername für Projekt-Snapshots.
   */
  findWithManufacturerById(id) {
    return this.db.prepare(`
      SELECT f.*, m.name AS manufacturer_name
      FROM filaments f
      JOIN manufacturers m ON m.id = f.manufacturer_id
      WHERE f.id = ?
    `).get(id);
  }

  /**
   * Legt eine neue Filament-Spule an.
   */
  create({
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
  }) {
    const res = this.db.prepare(`
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
    return Number(res.lastInsertRowid);
  }

  /**
   * Aktualisiert alle Felder einer bestehenden Spule.
   */
  update(id, {
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
  }) {
    this.db.prepare(`
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
      id
    );
  }

  /**
   * Aktualisiert nur das Restgewicht einer Spule.
   */
  updateRemainingWeight(id, remainingWeightG) {
    this.db.prepare(`
      UPDATE filaments
      SET remaining_weight_g = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(remainingWeightG, id);
  }

  /**
   * Zieht ein bestimmtes Gewicht (in g) vom Restbestand einer Spule ab (mindestens 0 g).
   */
  deductWeight(id, weightG) {
    this.db.prepare(`
      UPDATE filaments
      SET remaining_weight_g = MAX(0, ROUND(remaining_weight_g - ?, 1)),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(Number(weightG), Number(id));
  }

  /**
   * Löscht eine Spule anhand ihrer ID.
   */
  deleteById(id) {
    this.db.prepare('DELETE FROM filaments WHERE id = ?').run(id);
  }
}

module.exports = { FilamentRepository };
