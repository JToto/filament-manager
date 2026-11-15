import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Filament,
  Project,
  ProjectItem,
  ThreeMfImportSummary
} from '../../models/spoolmate.models';
import { SpoolmateService } from '../../services/spoolmate.service';
import {
  compressImageFile,
  formatEur,
  formatGrams,
  getBaseMaterial
} from '../../utils/material.utils';

@Component({
  selector: 'app-project-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-calculator.component.html'
})
export class ProjectCalculatorComponent implements OnChanges {
  @Input() preselectedFilamentId: number | null = null;

  @ViewChild('threeMfFileInput') threeMfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('projectImageInput') projectImageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('existingImagePicker') existingImagePickerRef?: ElementRef<HTMLInputElement>;
  @ViewChild('existingThreeMfPicker') existingThreeMfPickerRef?: ElementRef<HTMLInputElement>;

  // Neues Projekt anlegen
  newProjectName = '';
  newProjectPrintTime = '';
  newProjectNotes = '';
  newProjectImageData = '';
  selectedThreeMfFile: File | null = null;
  isCreatingProject = false;

  // Suche & Paginierung
  searchQuery = '';
  pageSize = 5;
  currentPage = 1;

  // Ziel-Projekt für versteckte File-Picker
  targetImageProjectId: number | null = null;
  targetThreeMfProjectId: number | null = null;
  uploadingThreeMfProjectId: number | null = null;

  // Neue Position pro Projekt (project.id -> Formularwerte)
  newItemForms: Record<
    number,
    { label: string; filamentId: number | null; weightG: number | null }
  > = {};

  formatEur = formatEur;
  formatGrams = formatGrams;

  constructor(public spoolmate: SpoolmateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preselectedFilamentId'] && this.preselectedFilamentId) {
      for (const p of this.spoolmate.projects) {
        const form = this.getItemForm(p.id);
        form.filamentId = this.preselectedFilamentId;
      }
    }
  }

  getItemForm(projectId: number): {
    label: string;
    filamentId: number | null;
    weightG: number | null;
  } {
    if (!this.newItemForms[projectId]) {
      this.newItemForms[projectId] = {
        label: '',
        filamentId:
          this.preselectedFilamentId || this.spoolmate.filaments[0]?.id || null,
        weightG: null
      };
    }
    return this.newItemForms[projectId];
  }

  onThreeMfFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    this.selectedThreeMfFile = file;
    if (file && !this.newProjectName.trim()) {
      this.newProjectName = file.name.replace(/\.3mf$/i, '').replace(/[_-]+/g, ' ');
    }
  }

  async onProjectImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) {
      this.newProjectImageData = '';
      return;
    }
    try {
      this.newProjectImageData = await compressImageFile(file);
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  private formatImportSummary(imported: ThreeMfImportSummary | null): string {
    if (!imported) return '.3mf Datei gespeichert';
    const details: string[] = [];
    if (imported.thumbnailImported) details.push('Vorschaubild');
    if (imported.printTime) details.push(`Druckzeit (${imported.printTime})`);
    if (imported.itemsImported > 0) {
      details.push(`${imported.itemsImported} Filament-Position(en)`);
    }
    if (details.length > 0) {
      return `.3mf gespeichert — Auto-Import: ${details.join(', ')}`;
    }
    return `„${imported.filename}“ angehängt`;
  }

  async createProject(): Promise<void> {
    const name = this.newProjectName.trim();
    if (!name || this.isCreatingProject) return;

    this.isCreatingProject = true;
    try {
      const createdId = await this.spoolmate.createProject({
        name,
        print_time: this.newProjectPrintTime.trim(),
        notes: this.newProjectNotes.trim(),
        image_data: this.newProjectImageData
      });

      let importMsg = '';
      if (this.selectedThreeMfFile && createdId) {
        const imported = await this.spoolmate.uploadThreeMf(
          createdId,
          this.selectedThreeMfFile,
          {
            overwriteImage: !this.newProjectImageData,
            replaceItems: true
          }
        );
        importMsg = ` (${this.formatImportSummary(imported)})`;
      }

      // Formular zurücksetzen
      this.newProjectName = '';
      this.newProjectPrintTime = '';
      this.newProjectNotes = '';
      this.newProjectImageData = '';
      this.selectedThreeMfFile = null;
      if (this.threeMfFileInputRef?.nativeElement) {
        this.threeMfFileInputRef.nativeElement.value = '';
      }
      if (this.projectImageInputRef?.nativeElement) {
        this.projectImageInputRef.nativeElement.value = '';
      }
      this.currentPage = 1;
      this.spoolmate.showToast(`Projekt „${name}“ angelegt${importMsg}`);
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    } finally {
      this.isCreatingProject = false;
    }
  }

  // ==================== FILTER & PAGINIERUNG ====================

  get filteredProjects(): Project[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.spoolmate.projects;
    return this.spoolmate.projects.filter((p) => {
      const itemsText = (p.items || [])
        .map((i) => `${i.label || ''} ${i.filament_name || ''} ${i.material || ''}`)
        .join(' ');
      const hay = `${p.name || ''} ${p.notes || ''} ${p.threemf_filename || ''} ${p.print_time || ''} ${itemsText}`.toLowerCase();
      return hay.includes(q);
    });
  }

  get projectCountLabel(): string {
    const totalFiltered = this.filteredProjects.length;
    const totalAll = this.spoolmate.projects.length;
    if (this.searchQuery.trim()) {
      return `${totalFiltered} von ${totalAll} Projekten`;
    }
    return `${totalAll} ${totalAll === 1 ? 'Projekt' : 'Projekte'}`;
  }

  get totalPages(): number {
    const total = this.filteredProjects.length;
    if (this.pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  get paginatedProjects(): Project[] {
    const list = this.filteredProjects;
    if (this.pageSize <= 0) return list;
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }
    const start = (this.currentPage - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  get paginationStartIdx(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get paginationEndIdx(): number {
    return Math.min(this.filteredProjects.length, this.currentPage * this.pageSize);
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) {
      this.currentPage = p;
    }
  }

  // ==================== PROJEKT-AKTIONEN ====================

  triggerPickImage(project: Project): void {
    this.targetImageProjectId = project.id;
    if (this.existingImagePickerRef?.nativeElement) {
      this.existingImagePickerRef.nativeElement.value = '';
      this.existingImagePickerRef.nativeElement.click();
    }
  }

  async onExistingProjectImagePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.targetImageProjectId) return;
    try {
      const dataUrl = await compressImageFile(file);
      await this.spoolmate.patchProject(this.targetImageProjectId, {
        image_data: dataUrl
      });
      this.spoolmate.showToast('Projektbild gespeichert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    } finally {
      this.targetImageProjectId = null;
    }
  }

  async removeProjectThumb(project: Project): Promise<void> {
    if (!window.confirm(`Projektbild von „${project.name}“ entfernen?`)) return;
    try {
      await this.spoolmate.patchProject(project.id, { image_data: '' });
      this.spoolmate.showToast('Projektbild entfernt');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  triggerPickThreeMf(project: Project): void {
    this.targetThreeMfProjectId = project.id;
    if (this.existingThreeMfPickerRef?.nativeElement) {
      this.existingThreeMfPickerRef.nativeElement.value = '';
      this.existingThreeMfPickerRef.nativeElement.click();
    }
  }

  async onExistingProjectThreeMfPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const projectId = this.targetThreeMfProjectId;
    if (!file || !projectId) return;

    const project = this.spoolmate.projects.find((p) => p.id === projectId);
    let replaceItems = true;
    if (project && project.items && project.items.length > 0) {
      replaceItems = window.confirm(
        `Das Projekt „${project.name}“ enthält bereits ${project.items.length} Filament-Position(en).\n\nSollen die bestehenden Positionen durch die Filamente aus „${file.name}“ ERSETZT werden?\n(Bei „Abbrechen“ werden die neuen Filamente zusätzlich angehängt)`
      );
    }

    this.uploadingThreeMfProjectId = projectId;
    try {
      const imported = await this.spoolmate.uploadThreeMf(projectId, file, {
        overwriteImage: true,
        replaceItems
      });
      this.spoolmate.showToast(this.formatImportSummary(imported));
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    } finally {
      this.uploadingThreeMfProjectId = null;
      this.targetThreeMfProjectId = null;
      input.value = '';
    }
  }

  async removeProjectThreeMf(project: Project): Promise<void> {
    if (
      !window.confirm(
        `Verknüpfte .3mf Datei „${project.threemf_filename}“ vom Projekt entfernen?`
      )
    ) {
      return;
    }
    try {
      await this.spoolmate.removeThreeMf(project.id);
      this.spoolmate.showToast('.3mf Datei entfernt');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async openInBambuStudio(project: Project): Promise<void> {
    try {
      const res = await this.spoolmate.openInBambuStudio(project.id);
      this.spoolmate.showToast(
        `Öffne „${res.filename || project.threemf_filename}“ in Bambu Studio…`
      );
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async editPrintTime(project: Project): Promise<void> {
    const newTime = window.prompt(
      `Druckzeit für „${project.name}“ eingeben (z. B. "6h 25m", "2:30" oder "45m"):`,
      project.print_time || ''
    );
    if (newTime === null) return;
    try {
      await this.spoolmate.patchProject(project.id, {
        print_time: newTime.trim()
      });
      this.spoolmate.showToast('Druckzeit & Stromkosten aktualisiert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async editProjectDetails(project: Project): Promise<void> {
    const newName = window.prompt('Projektname:', project.name);
    if (!newName || !newName.trim()) return;
    const newTime = window.prompt(
      'Druckzeit (z. B. 6h 25m):',
      project.print_time || ''
    );
    if (newTime === null) return;
    const newNotes = window.prompt('Notiz (optional):', project.notes || '');
    if (newNotes === null) return;

    try {
      await this.spoolmate.updateProject(project.id, {
        name: newName.trim(),
        print_time: newTime.trim(),
        notes: newNotes.trim()
      });
      this.spoolmate.showToast('Projekt aktualisiert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async deleteProject(project: Project): Promise<void> {
    if (!window.confirm(`Projekt „${project.name}“ samt Positionen löschen?`)) return;
    try {
      await this.spoolmate.deleteProject(project.id);
      this.spoolmate.showToast('Projekt gelöscht');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async deductProjectFromStock(project: Project): Promise<void> {
    if (
      !window.confirm(
        `Sollen insgesamt ${formatGrams(project.total_weight_g)} für das Projekt „${project.name}“ vom aktuellen Spulenbestand abgezogen werden?`
      )
    ) {
      return;
    }
    try {
      await this.spoolmate.deductProjectStock(project.id);
      this.spoolmate.showToast(
        `Verbrauch für „${project.name}“ vom Bestand abgezogen`
      );
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  // ==================== PROJEKT-POSITIONEN ====================

  getCompatibleFilamentsForItem(item: ProjectItem): Filament[] {
    const targetBase = item.material ? getBaseMaterial(item.material) : '';
    if (!targetBase) {
      return this.spoolmate.filaments;
    }
    const matching = this.spoolmate.filaments.filter(
      (f) => getBaseMaterial(f.material) === targetBase
    );
    return matching;
  }

  isInsufficientStock(item: ProjectItem): boolean {
    return (
      item.remaining_weight_g !== null &&
      item.remaining_weight_g !== undefined &&
      item.weight_g > item.remaining_weight_g
    );
  }

  hasPrintTime(project: Project): boolean {
    return Boolean(project.print_time && project.print_time_hours > 0);
  }

  async onItemLabelChange(item: ProjectItem, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const newLabel = input.value.trim();
    if (newLabel === (item.label || '')) return;
    try {
      await this.spoolmate.updateProjectItem(item.id, {
        filament_id: item.filament_id || undefined,
        label: newLabel,
        weight_g: item.weight_g
      });
      this.spoolmate.showToast('Bezeichnung aktualisiert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async onItemFilamentChange(item: ProjectItem, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const filamentId = Number(select.value);
    if (!filamentId) return;
    try {
      await this.spoolmate.updateProjectItem(item.id, {
        filament_id: filamentId,
        label: item.label || '',
        weight_g: item.weight_g
      });
      this.spoolmate.showToast('Filament gewechselt — Projektpreis neu berechnet');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async onItemWeightChange(item: ProjectItem, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const weightG = Number(input.value);
    if (!Number.isFinite(weightG) || weightG <= 0) {
      this.spoolmate.showToast('Bitte ein gültiges Gewicht (> 0 g) eingeben', 'error');
      input.value = String(item.weight_g);
      return;
    }
    try {
      await this.spoolmate.updateProjectItem(item.id, {
        filament_id: item.filament_id || undefined,
        label: item.label || '',
        weight_g: weightG
      });
      this.spoolmate.showToast('Gewicht & Projektpreis aktualisiert');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async deleteItem(item: ProjectItem): Promise<void> {
    try {
      await this.spoolmate.deleteProjectItem(item.id);
      this.spoolmate.showToast('Position entfernt');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }

  async submitNewItem(project: Project): Promise<void> {
    const form = this.getItemForm(project.id);
    if (!form.filamentId || !form.weightG || form.weightG <= 0) return;
    try {
      await this.spoolmate.addProjectItem(project.id, {
        filament_id: Number(form.filamentId),
        weight_g: Number(form.weightG),
        label: (form.label || '').trim()
      });
      form.label = '';
      form.weightG = null;
      this.spoolmate.showToast('Position zum Projekt hinzugefügt');
    } catch (err: any) {
      this.spoolmate.showToast(err.message, 'error');
    }
  }
}
