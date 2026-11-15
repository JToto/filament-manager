import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Manufacturer } from '../../models/spoolmate.models';
import { SpoolmateService } from '../../services/spoolmate.service';

@Component({
  selector: 'app-manufacturer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manufacturer-manager.component.html'
})
export class ManufacturerManagerComponent {
  editingId: number | null = null;
  name = '';
  country = '';
  emptySpoolWeightG = 200;

  constructor(public spoolmate: SpoolmateService) {}

  get formTitle(): string {
    return this.editingId ? 'Hersteller bearbeiten' : 'Hersteller hinzufügen';
  }

  get submitLabel(): string {
    return this.editingId ? 'Änderungen speichern' : 'Hersteller speichern';
  }

  startEdit(m: Manufacturer): void {
    this.editingId = m.id;
    this.name = m.name;
    this.country = m.country || '';
    this.emptySpoolWeightG = m.empty_spool_weight_g || 200;
  }

  resetForm(): void {
    this.editingId = null;
    this.name = '';
    this.country = '';
    this.emptySpoolWeightG = 200;
  }

  async submitForm(): Promise<void> {
    if (!this.name.trim()) return;
    const payload = {
      name: this.name.trim(),
      country: this.country.trim(),
      empty_spool_weight_g: Number(this.emptySpoolWeightG) || 200
    };
    try {
      if (this.editingId) {
        await this.spoolmate.updateManufacturer(this.editingId, payload);
        this.spoolmate.showToast('Hersteller aktualisiert');
      } else {
        await this.spoolmate.createManufacturer(payload);
        this.spoolmate.showToast('Hersteller hinzugefügt');
      }
      this.resetForm();
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async deleteManufacturer(m: Manufacturer): Promise<void> {
    if ((m.spool_count || 0) > 0) return;
    if (!window.confirm(`Hersteller „${m.name}“ wirklich löschen?`)) return;
    try {
      await this.spoolmate.deleteManufacturer(m.id);
      this.spoolmate.showToast('Hersteller gelöscht');
      if (this.editingId === m.id) {
        this.resetForm();
      }
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }
}
