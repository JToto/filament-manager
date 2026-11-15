import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Filament } from '../../models/spoolmate.models';
import { SpoolmateService } from '../../services/spoolmate.service';
import { formatEur, formatGrams } from '../../utils/material.utils';

@Component({
  selector: 'app-filament-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filament-list.component.html'
})
export class FilamentListComponent {
  @Output() addSpool = new EventEmitter<void>();
  @Output() editSpool = new EventEmitter<Filament>();
  @Output() duplicateSpool = new EventEmitter<Filament>();
  @Output() sendToProject = new EventEmitter<number>();

  searchQuery = '';
  selectedManufacturerId = '';
  selectedMaterial = '';
  sortBy = 'newest';
  lowOnly = false;

  formatEur = formatEur;
  formatGrams = formatGrams;

  constructor(public spoolmate: SpoolmateService) {}

  get uniqueMaterials(): string[] {
    const mats = new Set(this.spoolmate.filaments.map((f) => f.material).filter(Boolean));
    return Array.from(mats).sort();
  }

  get filteredFilaments(): Filament[] {
    const q = this.searchQuery.trim().toLowerCase();
    const mId = this.selectedManufacturerId;
    const mat = this.selectedMaterial;

    const list = this.spoolmate.filaments.filter((f) => {
      if (mId && String(f.manufacturer_id) !== String(mId)) return false;
      if (mat && f.material !== mat) return false;
      if (this.lowOnly && f.remaining_weight_g >= 200) return false;
      if (q) {
        const hay = `${f.manufacturer_name} ${f.material} ${f.series || ''} ${f.color_name} ${f.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (this.sortBy) {
        case 'remaining_asc':
          return a.remaining_weight_g - b.remaining_weight_g;
        case 'remaining_desc':
          return b.remaining_weight_g - a.remaining_weight_g;
        case 'price_asc':
          return a.price_per_kg - b.price_per_kg;
        case 'price_desc':
          return b.price_per_kg - a.price_per_kg;
        case 'manufacturer':
          return a.manufacturer_name.localeCompare(b.manufacturer_name, 'de');
        default:
          return b.id - a.id;
      }
    });

    return list;
  }

  getSpoolRatio(f: Filament): number {
    return f.initial_weight_g > 0
      ? Math.min(1, Math.max(0, f.remaining_weight_g / f.initial_weight_g))
      : 0;
  }

  getSpoolPercentage(f: Filament): number {
    return Math.round(this.getSpoolRatio(f) * 100);
  }

  getSpoolDashArray(f: Filament): string {
    const clamped = Math.max(0.06, Math.min(1, this.getSpoolRatio(f)));
    const dash = Math.round(clamped * 113);
    return `${dash} 120`;
  }

  getBarColor(f: Filament): string {
    const pct = this.getSpoolPercentage(f);
    if (pct <= 20 || f.remaining_weight_g < 150) {
      return '#DC2626';
    }
    if (pct <= 45) {
      return '#FF5F1F';
    }
    return '#18181B';
  }

  getRemainingWorth(f: Filament): number {
    return (f.remaining_weight_g / 1000) * f.price_per_kg;
  }

  formatCentPerGram(f: Filament): string {
    const centPerG = (f.price_per_kg / 10).toLocaleString('de-DE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${centPerG} ct/g`;
  }

  async adjustWeight(f: Filament, deltaG: number): Promise<void> {
    try {
      await this.spoolmate.adjustFilamentWeight(f.id, deltaG);
      this.spoolmate.showToast(
        `${Math.abs(deltaG)} g von „${f.color_name}“ abgezogen`
      );
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async promptCustomWeight(f: Filament): Promise<void> {
    const raw = await this.spoolmate.prompt(
      `Wie viel Gramm möchtest du von „${f.manufacturer_name} ${f.material} ${f.color_name}“ abziehen?\n(Tipp: Negativwert wie -50 zieht ab, Positivwert wie +50 bucht hinzu, oder gib mit "=350" den exakten neuen Restbestand ein)`,
      '-35'
    );
    if (!raw) return;
    const trimmed = raw.trim().replace(',', '.');

    try {
      if (trimmed.startsWith('=')) {
        const exact = Number(trimmed.slice(1));
        if (!Number.isFinite(exact) || exact < 0) {
          this.spoolmate.showToast('Ungültige Gramm-Angabe', 'error');
          return;
        }
        await this.spoolmate.setFilamentRemainingWeight(f.id, exact);
        this.spoolmate.showToast(`Restmenge auf ${formatGrams(exact)} gesetzt`);
      } else {
        let num = Number(trimmed);
        if (!Number.isFinite(num) || num === 0) {
          this.spoolmate.showToast('Ungültige Gramm-Angabe', 'error');
          return;
        }
        if (!trimmed.startsWith('+') && !trimmed.startsWith('-') && num > 0) {
          num = -num;
        }
        await this.spoolmate.adjustFilamentWeight(f.id, num);
        this.spoolmate.showToast('Bestand aktualisiert');
      }
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async deleteSpool(f: Filament): Promise<void> {
    if (
      !window.confirm(
        `Spule „${f.manufacturer_name} ${f.material} — ${f.color_name}“ wirklich löschen?`
      )
    ) {
      return;
    }
    try {
      await this.spoolmate.deleteFilament(f.id);
      this.spoolmate.showToast('Spule gelöscht');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }
}
