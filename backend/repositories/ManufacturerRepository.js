/**
 * ManufacturerRepository — Datenzugriffsschicht (DAO/Repository) für Hersteller (`manufacturers`).
 */
class ManufacturerRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Liefert alle Hersteller alphabetisch sortiert inkl. Anzahl zugeordneter Spulen.
   */
  findAll() {
    return this.db.prepare(`
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

  /**
   * Legt einen neuen Hersteller an und gibt dessen ID zurück.
   */
  create({ name, country, emptySpoolWeightG }) {
    const result = this.db.prepare(
      'INSERT INTO manufacturers (name, country, empty_spool_weight_g) VALUES (?, ?, ?)'
    ).run(name, country, emptySpoolWeightG);
    return Number(result.lastInsertRowid);
  }

  /**
   * Aktualisiert einen bestehenden Hersteller.
   */
  update(id, { name, country, emptySpoolWeightG }) {
    this.db.prepare(
      'UPDATE manufacturers SET name = ?, country = ?, empty_spool_weight_g = ? WHERE id = ?'
    ).run(name, country, emptySpoolWeightG, id);
  }

  /**
   * Zählt, wie viele Filament-Spulen diesem Hersteller aktuell zugeordnet sind.
   */
  countFilamentsByManufacturer(id) {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM filaments WHERE manufacturer_id = ?').get(id);
    return Number(row?.cnt || 0);
  }

  /**
   * Löscht einen Hersteller anhand seiner ID.
   */
  deleteById(id) {
    this.db.prepare('DELETE FROM manufacturers WHERE id = ?').run(id);
  }
}

module.exports = { ManufacturerRepository };
