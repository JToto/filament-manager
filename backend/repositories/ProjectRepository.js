/**
 * ProjectRepository — Datenzugriffsschicht (DAO/Repository) für Druckprojekte (`projects`)
 * und deren Bauteil-/Filament-Positionen (`project_items`).
 */
class ProjectRepository {
  constructor(db) {
    this.db = db;
  }

  findAllProjectsRaw() {
    return this.db.prepare('SELECT * FROM projects ORDER BY id DESC').all();
  }

  findProjectById(id) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  }

  findAllProjectItemsJoined() {
    return this.db.prepare(`
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
  }

  findItemsByProjectId(projectId) {
    return this.db.prepare('SELECT * FROM project_items WHERE project_id = ?').all(projectId);
  }

  countItemsByProjectId(projectId) {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM project_items WHERE project_id = ?')
      .get(projectId);
    return Number(row?.cnt || 0);
  }

  findItemWithFilamentById(itemId) {
    return this.db.prepare(`
      SELECT pi.*, f.material AS current_material
      FROM project_items pi
      LEFT JOIN filaments f ON f.id = pi.filament_id
      WHERE pi.id = ?
    `).get(itemId);
  }

  createProject({ name, notes, printTime, imageData }) {
    const res = this.db.prepare(
      'INSERT INTO projects (name, notes, print_time, image_data) VALUES (?, ?, ?, ?)'
    ).run(name, notes, printTime, imageData);
    return Number(res.lastInsertRowid);
  }

  updateProject(id, { name, notes, printTime, imageData }) {
    this.db.prepare(
      'UPDATE projects SET name = ?, notes = ?, print_time = ?, image_data = ? WHERE id = ?'
    ).run(name, notes, printTime, imageData, id);
  }

  updateProjectImage(id, imageData) {
    this.db.prepare('UPDATE projects SET image_data = ? WHERE id = ?').run(imageData, id);
  }

  updateProjectPrintTime(id, printTime) {
    this.db.prepare('UPDATE projects SET print_time = ? WHERE id = ?').run(printTime, id);
  }

  updateProjectThreeMf(id, { threemfFilename, threemfStoredName, imageData, printTime }) {
    this.db.prepare(`
      UPDATE projects
      SET threemf_filename = ?,
          threemf_stored_name = ?,
          image_data = ?,
          print_time = ?
      WHERE id = ?
    `).run(threemfFilename, threemfStoredName, imageData, printTime, id);
  }

  clearProjectThreeMf(id) {
    this.db.prepare(`
      UPDATE projects
      SET threemf_filename = '', threemf_stored_name = ''
      WHERE id = ?
    `).run(id);
  }

  deleteProjectById(id) {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  createProjectItem({
    projectId,
    filamentId,
    label,
    weightG,
    snapshotName,
    snapshotMaterial,
    snapshotColorHex,
    snapshotPricePerKg
  }) {
    this.db.prepare(`
      INSERT INTO project_items (
        project_id, filament_id, label, weight_g,
        snapshot_name, snapshot_material, snapshot_color_hex, snapshot_price_per_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      filamentId,
      label,
      weightG,
      snapshotName,
      snapshotMaterial,
      snapshotColorHex,
      snapshotPricePerKg
    );
  }

  updateProjectItem(itemId, {
    filamentId,
    label,
    weightG,
    snapshotName,
    snapshotMaterial,
    snapshotColorHex,
    snapshotPricePerKg
  }) {
    this.db.prepare(`
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
      snapshotName,
      snapshotMaterial,
      snapshotColorHex,
      snapshotPricePerKg,
      itemId
    );
  }

  updateSnapshotsForFilament(filamentId, { snapshotName, snapshotMaterial, snapshotColorHex, snapshotPricePerKg }) {
    this.db.prepare(`
      UPDATE project_items
      SET snapshot_name = ?, snapshot_material = ?, snapshot_color_hex = ?, snapshot_price_per_kg = ?
      WHERE filament_id = ?
    `).run(snapshotName, snapshotMaterial, snapshotColorHex, snapshotPricePerKg, filamentId);
  }

  deleteItemsByProjectId(projectId) {
    this.db.prepare('DELETE FROM project_items WHERE project_id = ?').run(projectId);
  }

  deleteItemById(itemId) {
    this.db.prepare('DELETE FROM project_items WHERE id = ?').run(itemId);
  }
}

module.exports = { ProjectRepository };
