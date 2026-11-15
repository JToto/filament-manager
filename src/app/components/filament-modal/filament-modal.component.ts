import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Filament } from '../../models/spoolmate.models';
import { SpoolmateService } from '../../services/spoolmate.service';
import { formatEur } from '../../utils/material.utils';

export interface SwatchItem {
  name: string;
  hex: string;
}

@Component({
  selector: 'app-filament-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filament-modal.component.html'
})
export class FilamentModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() mode: 'create' | 'edit' | 'duplicate' = 'create';
  @Input() filament: Filament | null = null;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('colorNameInput') colorNameInputRef?: ElementRef<HTMLInputElement>;

  swatches: SwatchItem[] = [
    { hex: '#000000', name: 'Schwarz' },
    { hex: '#FFFFFF', name: 'Weiß' },
    { hex: '#9CA3AF', name: 'Grau / Silber' },
    { hex: '#FF1E1E', name: 'Rot' },
    { hex: '#FF5F1F', name: 'Orange' },
    { hex: '#FFE600', name: 'Gelb' },
    { hex: '#00D13B', name: 'Grün' },
    { hex: '#00D4FF', name: 'Cyan / Türkis' },
    { hex: '#0055FF', name: 'Blau' },
    { hex: '#8C1AFF', name: 'Violett' },
    { hex: '#FF1493', name: 'Pink / Magenta' },
    { hex: '#A05A2C', name: 'Holz / Braun' }
  ];

  editingId: number | null = null;
  manufacturerId: number | string = '';
  material = 'PLA';
  colorName = '';
  series = '';
  colorHex = '#FF5F1F';
  purchasePrice: number | null = null;
  initialWeightG = 1000;
  remainingWeightG = 1000;
  remainingTouched = false;
  notes = '';

  constructor(public spoolmate: SpoolmateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.initForm();
    }
  }

  private initForm(): void {
    const f = this.filament;
    this.remainingTouched = false;
    if (f) {
      this.editingId = this.mode === 'edit' ? f.id : null;
      this.manufacturerId = f.manufacturer_id;
      this.material = f.material;
      this.colorName = this.mode === 'duplicate' ? '' : f.color_name;
      this.series = f.series || '';
      this.colorHex = f.color_hex || '#FF5F1F';
      this.purchasePrice = f.purchase_price;
      this.initialWeightG = f.initial_weight_g;
      this.remainingWeightG =
        this.mode === 'duplicate' ? f.initial_weight_g : f.remaining_weight_g;
      this.notes = f.notes || '';
    } else {
      this.editingId = null;
      this.manufacturerId = this.spoolmate.manufacturers[0]?.id || '';
      this.material = 'PLA';
      this.colorName = '';
      this.series = '';
      this.colorHex = '#FF5F1F';
      this.purchasePrice = null;
      this.initialWeightG = 1000;
      this.remainingWeightG = 1000;
      this.notes = '';
    }
  }

  get modalTitle(): string {
    if (this.mode === 'edit') return 'Filament-Spule bearbeiten';
    if (this.mode === 'duplicate' && this.filament) {
      return `Spule duplizieren (${this.filament.manufacturer_name} ${this.filament.material})`;
    }
    return 'Neue Filament-Spule anlegen';
  }

  get livePricePerKg(): string {
    const w = Number(this.initialWeightG) || 0;
    const p = Number(this.purchasePrice) || 0;
    if (w > 0 && p >= 0) {
      return `${formatEur((p / w) * 1000)} / kg`;
    }
    return '0,00 € / kg';
  }

  get livePricePerGram(): string {
    const w = Number(this.initialWeightG) || 0;
    const p = Number(this.purchasePrice) || 0;
    if (w > 0 && p >= 0) {
      const kg = (p / w) * 1000;
      const centPerG = (kg / 10).toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return `${centPerG} ct / g`;
    }
    return '0,00 ct / g';
  }

  onInitialWeightChange(): void {
    if (!this.editingId && !this.remainingTouched) {
      this.remainingWeightG = this.initialWeightG;
    }
  }

  setWeightChip(grams: number): void {
    this.initialWeightG = grams;
    if (!this.editingId && !this.remainingTouched) {
      this.remainingWeightG = grams;
    }
  }

  selectSwatch(swatch: SwatchItem): void {
    this.colorHex = swatch.hex;
    if (!this.colorName.trim()) {
      this.colorName = swatch.name;
    }
  }

  async promptQuickManufacturer(): Promise<void> {
    const name = await this.spoolmate.prompt('Name des neuen Herstellers:');
    if (!name || !name.trim()) return;
    try {
      const newId = await this.spoolmate.createManufacturer({
        name: name.trim(),
        country: '',
        empty_spool_weight_g: 200
      });
      this.manufacturerId = newId;
      this.spoolmate.showToast(`Hersteller „${name.trim()}“ angelegt`);
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async submitForm(keepOpenForNext: boolean): Promise<void> {
    const payload = {
      manufacturer_id: Number(this.manufacturerId),
      material: this.material.trim(),
      series: this.series.trim(),
      color_name: this.colorName.trim(),
      color_hex: this.colorHex,
      purchase_price: Number(this.purchasePrice),
      initial_weight_g: Number(this.initialWeightG),
      remaining_weight_g: Number(this.remainingWeightG),
      notes: this.notes.trim()
    };

    try {
      await this.spoolmate.saveFilament(payload, this.editingId);
      if (keepOpenForNext) {
        this.spoolmate.showToast(
          `„${payload.color_name}“ gespeichert — bereit für die nächste Farbe!`
        );
        this.editingId = null;
        this.mode = 'create';
        this.colorName = '';
        this.remainingTouched = false;
        this.remainingWeightG = this.initialWeightG;
        setTimeout(() => {
          this.colorNameInputRef?.nativeElement.focus();
        }, 50);
      } else {
        this.spoolmate.showToast(
          this.editingId ? 'Spule aktualisiert' : 'Neue Spule angelegt'
        );
        this.closed.emit();
      }
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }
}
