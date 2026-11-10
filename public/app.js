const state = {
  manufacturers: [],
  filaments: [],
  projects: [],
  settings: {
    electricity_price_per_kwh: 0.35,
    printer_power_kwh: 0.12,
    printer_name: ''
  },
  newProjectImageData: '',
  targetImageProjectId: null,
  remainingTouchedInModal: false
};

function compressImageFile(file, maxSize = 360) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Bitte eine gültige Bilddatei wählen.'));
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1
});

function formatEur(val) {
  return eurFormatter.format(Number(val) || 0);
}

function formatGrams(g) {
  const num = Number(g) || 0;
  return `${numFormatter.format(num)} g`;
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Fehler bei der Serveranfrage');
  }
  return data;
}

function createSpoolSvg(colorHex, fillRatio) {
  const clamped = Math.max(0.06, Math.min(1, fillRatio));
  const dashArray = Math.round(clamped * 113);
  return `
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="25" fill="#ECE9E1" stroke="#B8B1A3" stroke-width="2"/>
      <circle cx="28" cy="28" r="18" stroke="#DEDAD0" stroke-width="10"/>
      <circle
        cx="28" cy="28" r="18"
        stroke="${escapeHtml(colorHex)}"
        stroke-width="10"
        stroke-dasharray="${dashArray} 120"
        stroke-linecap="butt"
        transform="rotate(-90 28 28)"
      />
      <circle cx="28" cy="28" r="23" stroke="rgba(24,24,27,0.18)" stroke-width="1" fill="none"/>
      <circle cx="28" cy="28" r="13" stroke="rgba(24,24,27,0.18)" stroke-width="1" fill="none"/>
      <circle cx="28" cy="28" r="8.5" fill="#FFFFFF" stroke="#18181B" stroke-width="2"/>
      <circle cx="28" cy="28" r="3" fill="#18181B"/>
    </svg>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Render All ---
function renderAll() {
  renderStats();
  renderFilterOptions();
  renderFilamentsGrid();
  renderManufacturersList();
  renderProjects();
  renderSettings();
}

function renderStats() {
  const count = state.filaments.length;
  const lowCount = state.filaments.filter(f => f.remaining_weight_g < 200).length;
  const totalRemainingG = state.filaments.reduce((acc, f) => acc + Number(f.remaining_weight_g || 0), 0);
  const totalInitialG = state.filaments.reduce((acc, f) => acc + Number(f.initial_weight_g || 0), 0);

  const remainingValue = state.filaments.reduce(
    (acc, f) => acc + (Number(f.remaining_weight_g || 0) / 1000) * Number(f.price_per_kg || 0),
    0
  );
  const purchaseValue = state.filaments.reduce((acc, f) => acc + Number(f.purchase_price || 0), 0);

  const avgKgPrice =
    count > 0
      ? state.filaments.reduce((acc, f) => acc + Number(f.price_per_kg || 0), 0) / count
      : 0;

  document.getElementById('statSpoolCount').textContent = String(count);
  document.getElementById('statLowCount').textContent = `${lowCount} fast leer (< 200 g)`;

  document.getElementById('statTotalRemaining').textContent =
    totalRemainingG >= 1000
      ? `${(totalRemainingG / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`
      : formatGrams(totalRemainingG);
  document.getElementById('statTotalInitial').textContent =
    `von ${(totalInitialG / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg Gesamtvolumen`;

  document.getElementById('statRemainingValue').textContent = formatEur(remainingValue);
  document.getElementById('statPurchaseValue').textContent = `Einkaufswert: ${formatEur(purchaseValue)}`;

  document.getElementById('statAvgKgPrice').textContent = `${formatEur(avgKgPrice)}/kg`;
  document.getElementById('statManufacturerCount').textContent = `${state.manufacturers.length} Hersteller verwaltet`;

  document.getElementById('tabBadgeFilaments').textContent = String(count);
  document.getElementById('tabBadgeProjects').textContent = String(state.projects.length);
  document.getElementById('tabBadgeManufacturers').textContent = String(state.manufacturers.length);
}

function renderFilterOptions() {
  const mfgSelect = document.getElementById('filterManufacturer');
  const matSelect = document.getElementById('filterMaterial');
  const modalMfgSelect = document.getElementById('fManufacturer');

  const currentMfg = mfgSelect.value;
  const currentMat = matSelect.value;
  const currentModalMfg = modalMfgSelect.value;

  mfgSelect.innerHTML = `<option value="">Alle Hersteller</option>` +
    state.manufacturers
      .map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
      .join('');
  mfgSelect.value = currentMfg;

  const materials = [...new Set(state.filaments.map(f => f.material).filter(Boolean))].sort();
  matSelect.innerHTML = `<option value="">Alle Materialien</option>` +
    materials.map(mat => `<option value="${escapeHtml(mat)}">${escapeHtml(mat)}</option>`).join('');
  matSelect.value = currentMat;

  modalMfgSelect.innerHTML = state.manufacturers
    .map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join('');
  if (currentModalMfg && state.manufacturers.some(m => String(m.id) === String(currentModalMfg))) {
    modalMfgSelect.value = currentModalMfg;
  }
}

function getFilteredFilaments() {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const mfgId = document.getElementById('filterManufacturer').value;
  const material = document.getElementById('filterMaterial').value;
  const lowOnly = document.getElementById('filterLowOnly').checked;
  const sortBy = document.getElementById('sortSelect').value;

  const list = state.filaments.filter(f => {
    if (mfgId && String(f.manufacturer_id) !== String(mfgId)) return false;
    if (material && f.material !== material) return false;
    if (lowOnly && f.remaining_weight_g >= 200) return false;

    if (query) {
      const haystack = `${f.manufacturer_name} ${f.material} ${f.series} ${f.color_name} ${f.notes}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    switch (sortBy) {
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

function renderFilamentsGrid() {
  const grid = document.getElementById('filamentsGrid');
  const items = getFilteredFilaments();

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <p style="font-size:1.02rem;font-weight:700;color:#18181B;margin-bottom:4px;">Keine passenden Filament-Spulen gefunden</p>
        <p>Füge eine neue Spule hinzu oder passe deine Suchfilter an.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items.map(f => {
    const ratio = f.initial_weight_g > 0 ? Math.min(1, Math.max(0, f.remaining_weight_g / f.initial_weight_g)) : 0;
    const pct = Math.round(ratio * 100);
    let barColor = '#18181B';
    if (pct <= 20 || f.remaining_weight_g < 150) {
      barColor = '#DC2626';
    } else if (pct <= 45) {
      barColor = '#FF5F1F';
    }

    const remainingWorth = (f.remaining_weight_g / 1000) * f.price_per_kg;

    return `
      <article class="spool-card">
        <div class="spool-top">
          <div class="spool-visual">
            ${createSpoolSvg(f.color_hex, ratio)}
          </div>
          <div class="spool-info">
            <div class="spool-badges">
              <span class="material-tag">${escapeHtml(f.material)}</span>
              ${f.series ? `<span class="series-tag">${escapeHtml(f.series)}</span>` : ''}
            </div>
            <h3 class="spool-title" title="${escapeHtml(f.color_name)}">${escapeHtml(f.color_name)}</h3>
            <div class="spool-manufacturer">${escapeHtml(f.manufacturer_name)}</div>
          </div>
          <div class="spool-price-pill">
            <span class="price-kg-main">${formatEur(f.price_per_kg)}/kg</span>
            <span class="price-purchase-sub">${formatEur(f.purchase_price)} / ${formatGrams(f.initial_weight_g)}</span>
          </div>
        </div>

        <div class="spool-meter">
          <div class="meter-header">
            <span class="meter-remaining">${formatGrams(f.remaining_weight_g)} übrig</span>
            <span class="meter-percent">${pct}% (${formatGrams(f.initial_weight_g)})</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%; background:${barColor};"></div>
          </div>
          <div class="meter-footer">
            <span>Restwert: <strong>${formatEur(remainingWorth)}</strong></span>
            <span class="mono">${(f.price_per_kg / 10).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ct/g</span>
          </div>
        </div>

        <div class="spool-quick-adjust">
          <span class="quick-adjust-label">Abziehen:</span>
          <div class="quick-adjust-btns">
            <button type="button" class="btn-micro" data-action="delta" data-id="${f.id}" data-delta="-10">-10g</button>
            <button type="button" class="btn-micro" data-action="delta" data-id="${f.id}" data-delta="-25">-25g</button>
            <button type="button" class="btn-micro" data-action="delta" data-id="${f.id}" data-delta="-50">-50g</button>
            <button type="button" class="btn-micro" data-action="delta" data-id="${f.id}" data-delta="-100">-100g</button>
            <button type="button" class="btn-micro" data-action="custom-delta" data-id="${f.id}" title="Beliebige Menge abziehen">± …</button>
          </div>
        </div>

        ${f.notes ? `<div class="spool-notes">${escapeHtml(f.notes)}</div>` : ''}

        <div class="spool-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="calc-spool" data-id="${f.id}">
            Zu Projekt
          </button>
          <div class="spool-actions-right">
            <button type="button" class="btn btn-ghost btn-sm" data-action="duplicate" data-id="${f.id}" title="Alle Daten übernehmen, nur neue Farbe wählen">Duplizieren</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${f.id}">Bearbeiten</button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="${f.id}">Löschen</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// --- Projects & Multi-Filament Cost Calculator Rendering ---
function buildFilamentOptionsHtml(selectedId = null) {
  if (state.filaments.length === 0) {
    return `<option value="">Bitte zuerst Spulen im Bestand anlegen</option>`;
  }
  return state.filaments.map(f => {
    const isSel = selectedId && Number(selectedId) === Number(f.id) ? 'selected' : '';
    return `<option value="${f.id}" ${isSel}>${escapeHtml(f.manufacturer_name)} — ${escapeHtml(f.material)} ${escapeHtml(f.color_name)} (${formatEur(f.price_per_kg)}/kg · Rest: ${formatGrams(f.remaining_weight_g)})</option>`;
  }).join('');
}

function renderProjects(preselectFilamentId = null) {
  const container = document.getElementById('projectsContainer');

  if (state.projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="font-size:1.02rem;font-weight:700;color:#18181B;margin-bottom:4px;">Noch keine Projekte angelegt</p>
        <p>Lege oben dein erstes Projekt an (z. B. „Teebox“) und füge beliebig viele Filamente / Druckplatten hinzu.</p>
      </div>
    `;
    return;
  }

  const spoolOptionsHtml = buildFilamentOptionsHtml(preselectFilamentId);

  container.innerHTML = state.projects.map(project => {
    const itemsHtml = project.items.length === 0
      ? `
        <tr>
          <td colspan="6" style="text-align:center;color:var(--text-muted);padding:18px;">
            Noch keine Filamente oder Druckplatten zu „${escapeHtml(project.name)}“ hinzugefügt.
          </td>
        </tr>
      `
      : project.items.map((item, idx) => {
          const insufficient =
            item.remaining_weight_g !== null && item.weight_g > item.remaining_weight_g;
          const rowSelectOptions =
            (!item.filament_id
              ? `<option value="" selected>${escapeHtml(item.filament_name)}</option>`
              : '') + buildFilamentOptionsHtml(item.filament_id);

          return `
            <tr data-item-row="${item.id}" data-item-label="${escapeHtml(item.label)}">
              <td>
                <strong>${escapeHtml(item.label || `Position ${idx + 1}`)}</strong>
              </td>
              <td>
                <div class="filament-cell">
                  <span class="color-dot" style="background:${escapeHtml(item.color_hex)}"></span>
                  <select
                    class="inline-filament-select"
                    data-item-filament-select="${item.id}"
                    title="Filament-Spule wechseln — Preis wird sofort neu berechnet"
                  >
                    ${rowSelectOptions}
                  </select>
                  ${insufficient ? `<span class="stock-warn-tag" title="Auf der Spule sind nur noch ${formatGrams(item.remaining_weight_g)} verfügbar">Nur ${formatGrams(item.remaining_weight_g)} Rest!</span>` : ''}
                </div>
              </td>
              <td class="mono">${formatEur(item.price_per_kg)}/kg</td>
              <td>
                <div style="display:inline-flex;align-items:center;gap:5px;">
                  <input
                    type="number"
                    class="inline-weight-input"
                    min="0.01"
                    step="any"
                    value="${item.weight_g}"
                    data-item-weight="${item.id}"
                    title="Gewicht direkt anpassen"
                  />
                  <span class="mono text-muted">g</span>
                </div>
              </td>
              <td class="mono"><strong>${formatEur(item.cost)}</strong></td>
              <td style="text-align:right;">
                <button
                  type="button"
                  class="btn-micro"
                  data-delete-item="${item.id}"
                  title="Position entfernen"
                >✕</button>
              </td>
            </tr>
          `;
        }).join('');

    const materialCost = project.material_cost !== undefined ? project.material_cost : project.total_cost;
    const energyCost = project.energy_cost || 0;
    const energyKwh = project.energy_kwh || 0;
    const hasPrintTime = Boolean(project.print_time && project.print_time_hours > 0);

    const footerHtml = project.items.length > 0
      ? `
        <tfoot>
          ${hasPrintTime ? `
            <tr class="sub-footer-row">
              <td colspan="3">Zwischensumme Material (${project.items.length} ${project.items.length === 1 ? 'Position' : 'Positionen'})</td>
              <td>${formatGrams(project.total_weight_g)}</td>
              <td>${formatEur(materialCost)}</td>
              <td></td>
            </tr>
            <tr class="sub-footer-row">
              <td colspan="3">
                Stromkosten (${escapeHtml(project.print_time)} · ${energyKwh.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh @ ${formatEur(state.settings.electricity_price_per_kwh)}/kWh)
              </td>
              <td></td>
              <td>${formatEur(energyCost)}</td>
              <td></td>
            </tr>
          ` : ''}
          <tr>
            <td colspan="3">
              Gesamtpreis Projekt „${escapeHtml(project.name)}“ ${hasPrintTime ? '(Material + Strom)' : `(${project.items.length} ${project.items.length === 1 ? 'Position' : 'Positionen'})`}
            </td>
            <td>${formatGrams(project.total_weight_g)}</td>
            <td class="sum-cost">${formatEur(project.total_cost)}</td>
            <td></td>
          </tr>
        </tfoot>
      `
      : '';

    const thumbHtml = project.image_data
      ? `
        <div class="project-thumb-wrap">
          <img
            src="${escapeHtml(project.image_data)}"
            alt="${escapeHtml(project.name)}"
            class="project-thumb-img"
            data-proj-action="pick-image"
            data-project-id="${project.id}"
            title="Klicken, um das Projektbild zu ändern"
          />
          <button
            type="button"
            class="project-thumb-remove"
            data-proj-action="remove-image"
            data-project-id="${project.id}"
            title="Bild entfernen"
          >✕</button>
        </div>
      `
      : `
        <button
          type="button"
          class="project-thumb-placeholder"
          data-proj-action="pick-image"
          data-project-id="${project.id}"
          title="Bild für dieses Projekt hochladen"
        >
          <span>+ Bild</span>
        </button>
      `;

    return `
      <article class="project-card" data-project-id="${project.id}">
        <div class="project-card-header">
          <div class="project-header-left">
            ${thumbHtml}
            <div class="project-title-block">
              <h3>${escapeHtml(project.name)}</h3>
              ${project.notes ? `<div class="project-notes">${escapeHtml(project.notes)}</div>` : ''}
            </div>
          </div>

          <div class="project-header-right">
            <div class="project-totals">
              <button
                type="button"
                class="project-total-time-btn"
                data-proj-action="edit-time"
                data-project-id="${project.id}"
                title="Klicken, um die Druckzeit einzutragen oder zu ändern (z. B. 6h 25m)"
              >
                <span class="project-total-label">Druckzeit</span>
                ${project.print_time
                  ? `<span class="project-total-weight">${escapeHtml(project.print_time)}</span>`
                  : `<span class="project-total-time-placeholder">+ Zeit</span>`
                }
              </button>
              <div class="project-total-divider"></div>
              <div class="project-total-item">
                <span class="project-total-label">Gewicht</span>
                <span class="project-total-weight">${formatGrams(project.total_weight_g)}</span>
              </div>
              <div class="project-total-divider"></div>
              <div class="project-total-item">
                <span class="project-total-label">Material</span>
                <span class="project-total-weight">${formatEur(materialCost)}</span>
              </div>
              <div class="project-total-divider"></div>
              <div class="project-total-item" title="${hasPrintTime ? `${energyKwh.toLocaleString('de-DE', { maximumFractionDigits: 2 })} kWh × ${formatEur(state.settings.electricity_price_per_kwh)}/kWh` : 'Druckzeit eintragen, um Stromkosten zu berechnen'}">
                <span class="project-total-label">Strom</span>
                <span class="project-total-weight">${formatEur(energyCost)}</span>
              </div>
              <div class="project-total-divider"></div>
              <div class="project-total-item">
                <span class="project-total-label">Gesamtpreis</span>
                <span class="project-total-price">${formatEur(project.total_cost)}</span>
              </div>
            </div>

            <div class="project-header-actions">
              ${project.items.length > 0 ? `
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-proj-action="deduct"
                  data-project-id="${project.id}"
                  title="Alle Gewichte dieses Projekts vom Spulenbestand abziehen"
                >Vom Bestand abziehen</button>
              ` : ''}
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-proj-action="edit"
                data-project-id="${project.id}"
              >Bearbeiten</button>
              <button
                type="button"
                class="btn btn-danger-ghost btn-sm"
                data-proj-action="delete"
                data-project-id="${project.id}"
              >Löschen</button>
            </div>
          </div>
        </div>

        <div class="project-body">
          <table class="project-items-table">
            <thead>
              <tr>
                <th>Platte / Bauteil / Farbe</th>
                <th>Verwendetes Filament</th>
                <th>Preis / kg</th>
                <th>Gewicht</th>
                <th>Kosten</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            ${footerHtml}
          </table>

          <form class="project-add-row" data-add-item-form="${project.id}">
            <div>
              <label>Platte / Teil / AMS-Farbe (optional)</label>
              <input
                type="text"
                name="label"
                placeholder="z. B. Platte ${project.items.length + 1}, Deckel, Farbe 2..."
              />
            </div>
            <div>
              <label>Filament-Spule *</label>
              <select name="filament_id" required>
                ${spoolOptionsHtml}
              </select>
            </div>
            <div>
              <label>Gewicht (g) *</label>
              <div class="input-with-unit">
                <input
                  type="number"
                  name="weight_g"
                  min="0.01"
                  step="any"
                  required
                  placeholder="z. B. 120"
                />
                <span class="unit-tag">g</span>
              </div>
            </div>
            <div>
              <button type="submit" class="btn btn-primary" ${state.filaments.length === 0 ? 'disabled' : ''}>
                + Hinzufügen
              </button>
            </div>
          </form>
        </div>
      </article>
    `;
  }).join('');
}

// --- Manufacturers Rendering ---
function renderManufacturersList() {
  const container = document.getElementById('manufacturersList');
  if (state.manufacturers.length === 0) {
    container.innerHTML = `<p class="text-muted">Noch keine Hersteller angelegt.</p>`;
    return;
  }

  container.innerHTML = state.manufacturers.map(m => `
    <div class="mfg-item">
      <div>
        <div class="mfg-item-name">
          <span>${escapeHtml(m.name)}</span>
          ${m.country ? `<span class="mfg-country">${escapeHtml(m.country)}</span>` : ''}
        </div>
        <div class="mfg-item-meta">
          ${m.spool_count} Spule(n) · Leerspule ~${m.empty_spool_weight_g || 200} g
        </div>
      </div>
      <div class="mfg-item-actions">
        <button type="button" class="btn-micro" data-mfg-edit="${m.id}" title="Bearbeiten">✎</button>
        <button
          type="button"
          class="btn-micro"
          data-mfg-delete="${m.id}"
          title="${m.spool_count > 0 ? 'Noch Spulen zugeordnet' : 'Löschen'}"
          ${m.spool_count > 0 ? 'disabled style="opacity:0.35;cursor:not-allowed;"' : ''}
        >🗑</button>
      </div>
    </div>
  `).join('');
}

// --- Modal Live Price/kg Preview ---
function updateModalLivePrice() {
  const price = Number(document.getElementById('fPurchasePrice').value);
  const weight = Number(document.getElementById('fInitialWeight').value);
  const kgEl = document.getElementById('fLivePricePerKg');
  const gramEl = document.getElementById('fLivePricePerGram');

  if (Number.isFinite(price) && price >= 0 && Number.isFinite(weight) && weight > 0) {
    const perKg = (price / weight) * 1000;
    const perGramCt = perKg / 10;
    kgEl.textContent = `${formatEur(perKg)} / kg`;
    gramEl.textContent = `${perGramCt.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ct / g`;
  } else {
    kgEl.textContent = '0,00 € / kg';
    gramEl.textContent = '0,00 ct / g';
  }
}

function openFilamentModal(filament = null, isDuplicate = false) {
  const modal = document.getElementById('filamentModal');
  const title = document.getElementById('modalTitle');
  const saveAndNextBtn = document.getElementById('btnSaveAndNext');
  renderFilterOptions();

  if (filament && !isDuplicate) {
    title.textContent = 'Filament-Spule bearbeiten';
    document.getElementById('filamentId').value = String(filament.id);
    document.getElementById('fManufacturer').value = String(filament.manufacturer_id);
    document.getElementById('fMaterial').value = filament.material;
    document.getElementById('fColorName').value = filament.color_name;
    document.getElementById('fSeries').value = filament.series || '';
    document.getElementById('fColorHex').value = filament.color_hex || '#FF5F1F';
    document.getElementById('fColorHexText').value = filament.color_hex || '#FF5F1F';
    document.getElementById('fPurchasePrice').value = filament.purchase_price;
    document.getElementById('fInitialWeight').value = filament.initial_weight_g;
    document.getElementById('fRemainingWeight').value = filament.remaining_weight_g;
    document.getElementById('fNotes').value = filament.notes || '';
    state.remainingTouchedInModal = true;
    saveAndNextBtn.classList.add('hidden');
  } else if (filament && isDuplicate) {
    title.textContent = 'Spule duplizieren — Neue Farbe anlegen';
    document.getElementById('filamentId').value = '';
    document.getElementById('fManufacturer').value = String(filament.manufacturer_id);
    document.getElementById('fMaterial').value = filament.material;
    document.getElementById('fColorName').value = filament.color_name;
    document.getElementById('fSeries').value = filament.series || '';
    document.getElementById('fColorHex').value = filament.color_hex || '#FF5F1F';
    document.getElementById('fColorHexText').value = filament.color_hex || '#FF5F1F';
    document.getElementById('fPurchasePrice').value = filament.purchase_price;
    document.getElementById('fInitialWeight').value = filament.initial_weight_g;
    document.getElementById('fRemainingWeight').value = filament.initial_weight_g;
    document.getElementById('fNotes').value = filament.notes || '';
    state.remainingTouchedInModal = false;
    saveAndNextBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Neue Filament-Spule hinzufügen';
    document.getElementById('filamentForm').reset();
    document.getElementById('filamentId').value = '';
    document.getElementById('fMaterial').value = 'PLA';
    document.getElementById('fColorHex').value = '#FF5F1F';
    document.getElementById('fColorHexText').value = '#FF5F1F';
    document.getElementById('fInitialWeight').value = '1000';
    document.getElementById('fRemainingWeight').value = '1000';
    state.remainingTouchedInModal = false;
    saveAndNextBtn.classList.remove('hidden');
  }

  updateModalLivePrice();
  modal.classList.remove('hidden');
  const colorNameInput = document.getElementById('fColorName');
  colorNameInput.focus();
  if (isDuplicate) {
    colorNameInput.select();
  }
}

function closeFilamentModal() {
  document.getElementById('filamentModal').classList.add('hidden');
}

function updateSettingsLivePreview() {
  const pricePerKwh = Math.max(0, Number(document.getElementById('sElectricityPrice').value) || 0);
  const powerKwh = Math.max(0, Number(document.getElementById('sPrinterPowerKwh').value) || 0);
  const watts = Math.round(powerKwh * 1000);
  const costPerHour = pricePerKwh * powerKwh;

  document.getElementById('sWattsHint').textContent =
    `Entspricht Ø ${watts} Watt Leistungsaufnahme im Druckbetrieb.`;
  document.getElementById('sPreviewPerHour').textContent = `${formatEur(costPerHour)} / Std.`;
  document.getElementById('sPreviewWattsSub').textContent =
    `${powerKwh.toLocaleString('de-DE', { maximumFractionDigits: 3 })} kWh × ${formatEur(pricePerKwh)}/kWh`;

  const examples = [
    { label: '1 Stunde', hours: 1 },
    { label: '3 Stunden', hours: 3 },
    { label: '6 Stunden', hours: 6 },
    { label: '12 Stunden', hours: 12 },
    { label: '24 Stunden', hours: 24 }
  ];

  document.getElementById('sPreviewTableBody').innerHTML = examples.map(ex => {
    const kwh = ex.hours * powerKwh;
    const cost = ex.hours * costPerHour;
    return `
      <tr>
        <td><strong>${ex.label}</strong></td>
        <td class="mono">${kwh.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWh</td>
        <td class="mono"><strong>${formatEur(cost)}</strong></td>
      </tr>
    `;
  }).join('');
}

function renderSettings() {
  document.getElementById('sPrinterName').value = state.settings.printer_name || '';
  document.getElementById('sElectricityPrice').value = String(state.settings.electricity_price_per_kwh ?? 0.35);
  document.getElementById('sPrinterPowerKwh').value = String(state.settings.printer_power_kwh ?? 0.12);
  updateSettingsLivePreview();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await apiFetch('/api/bootstrap');
    state.manufacturers = data.manufacturers;
    state.filaments = data.filaments;
    state.projects = data.projects || [];
    if (data.settings) state.settings = data.settings;
    renderAll();
  } catch (err) {
    showToast(err.message, true);
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Search & Filters
  ['searchInput', 'filterManufacturer', 'filterMaterial', 'sortSelect', 'filterLowOnly'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderFilamentsGrid);
    document.getElementById(id).addEventListener('change', renderFilamentsGrid);
  });

  // Open / Close Modal (only closes on explicit Cancel button)
  document.getElementById('btnAddFilament').addEventListener('click', () => openFilamentModal(null));
  document.getElementById('btnCancelModal').addEventListener('click', closeFilamentModal);

  // Color Picker Sync & Swatches
  const colorPicker = document.getElementById('fColorHex');
  const colorText = document.getElementById('fColorHexText');

  colorPicker.addEventListener('input', () => {
    colorText.value = colorPicker.value;
  });
  colorText.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(colorText.value)) {
      colorPicker.value = colorText.value;
    }
  });

  document.getElementById('colorSwatches').addEventListener('click', e => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    const hex = swatch.dataset.hex;
    colorPicker.value = hex;
    colorText.value = hex;
    const colorNameInput = document.getElementById('fColorName');
    const isEditingExisting = Boolean(document.getElementById('filamentId').value);
    if (!colorNameInput.value.trim() || !isEditingExisting) {
      colorNameInput.value = swatch.dataset.name;
      colorNameInput.focus();
      colorNameInput.select();
    }
  });

  // Live Price/kg Calculation in Modal
  document.getElementById('fPurchasePrice').addEventListener('input', updateModalLivePrice);
  document.getElementById('fInitialWeight').addEventListener('input', e => {
    if (!state.remainingTouchedInModal) {
      document.getElementById('fRemainingWeight').value = e.target.value;
    }
    updateModalLivePrice();
  });

  document.getElementById('fRemainingWeight').addEventListener('input', () => {
    state.remainingTouchedInModal = true;
  });

  // Quick Initial Weight Chips in Modal
  document.querySelectorAll('[data-init-weight]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.initWeight;
      document.getElementById('fInitialWeight').value = val;
      if (!state.remainingTouchedInModal) {
        document.getElementById('fRemainingWeight').value = val;
      }
      updateModalLivePrice();
    });
  });

  // Quick Add Manufacturer from inside Filament Modal
  document.getElementById('btnQuickAddMfg').addEventListener('click', async () => {
    const name = prompt('Name des neuen Herstellers eingeben:');
    if (!name || !name.trim()) return;
    try {
      const res = await apiFetch('/api/manufacturers', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), empty_spool_weight_g: 200 })
      });
      state.manufacturers = res.manufacturers;
      renderFilterOptions();
      renderManufacturersList();
      renderStats();
      document.getElementById('fManufacturer').value = String(res.id);
      showToast(`Hersteller „${name.trim()}“ hinzugefügt`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Save Filament (Create / Update / Save & Next Color)
  async function submitFilamentForm(keepOpenForNext = false) {
    const form = document.getElementById('filamentForm');
    if (!form.reportValidity()) return;

    const id = document.getElementById('filamentId').value;
    const payload = {
      manufacturer_id: Number(document.getElementById('fManufacturer').value),
      material: document.getElementById('fMaterial').value,
      series: document.getElementById('fSeries').value,
      color_name: document.getElementById('fColorName').value,
      color_hex: document.getElementById('fColorHex').value,
      purchase_price: Number(document.getElementById('fPurchasePrice').value),
      initial_weight_g: Number(document.getElementById('fInitialWeight').value),
      remaining_weight_g: Number(document.getElementById('fRemainingWeight').value),
      notes: document.getElementById('fNotes').value
    };

    try {
      const res = await apiFetch(id ? `/api/filaments/${id}` : '/api/filaments', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      state.filaments = res.filaments;
      state.manufacturers = res.manufacturers;
      if (res.projects) state.projects = res.projects;
      renderAll();

      if (keepOpenForNext && !id) {
        showToast(`„${payload.color_name}“ gespeichert — bereit für nächste Farbe`);
        document.getElementById('modalTitle').textContent = 'Nächste Farbe aus Set anlegen';
        document.getElementById('fRemainingWeight').value = String(payload.initial_weight_g);
        state.remainingTouchedInModal = false;
        const colorNameInput = document.getElementById('fColorName');
        colorNameInput.value = '';
        colorNameInput.focus();
      } else {
        closeFilamentModal();
        showToast(id ? 'Spule aktualisiert' : 'Neue Spule gespeichert');
      }
    } catch (err) {
      showToast(err.message, true);
    }
  }

  document.getElementById('filamentForm').addEventListener('submit', async e => {
    e.preventDefault();
    await submitFilamentForm(false);
  });

  document.getElementById('btnSaveAndNext').addEventListener('click', async () => {
    await submitFilamentForm(true);
  });

  // Spool Card Actions (Duplicate, Edit, Delete, Quick Delta, Open in Projects)
  document.getElementById('filamentsGrid').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;
    const filament = state.filaments.find(f => f.id === id);
    if (!filament) return;

    if (action === 'duplicate') {
      openFilamentModal(filament, true);
    } else if (action === 'edit') {
      openFilamentModal(filament, false);
    } else if (action === 'delete') {
      if (!confirm(`Spule „${filament.manufacturer_name} ${filament.material} - ${filament.color_name}“ wirklich löschen?`)) {
        return;
      }
      try {
        const res = await apiFetch(`/api/filaments/${id}`, { method: 'DELETE' });
        state.filaments = res.filaments;
        state.manufacturers = res.manufacturers;
        if (res.projects) state.projects = res.projects;
        renderAll();
        showToast('Spule gelöscht');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'delta') {
      const delta = Number(btn.dataset.delta);
      try {
        const res = await apiFetch(`/api/filaments/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ delta_g: delta })
        });
        state.filaments = res.filaments;
        if (res.projects) state.projects = res.projects;
        renderAll();
        showToast(`${Math.abs(delta)} g von „${filament.color_name}“ abgezogen`);
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'custom-delta') {
      const input = prompt(
        `Neue Restmenge oder Abzug für „${filament.color_name}“ (aktuell ${filament.remaining_weight_g} g):\n` +
        `Tipp: Gib z. B. "-35" ein, um 35 g abzuziehen, oder "650", um die Restmenge direkt auf 650 g zu setzen.`
      );
      if (input === null || !input.trim()) return;
      const trimmed = input.trim().replace(',', '.');
      const isRelative = trimmed.startsWith('-') || trimmed.startsWith('+');
      const num = Number(trimmed);
      if (!Number.isFinite(num)) {
        showToast('Bitte eine gültige Zahl eingeben', true);
        return;
      }
      try {
        const body = isRelative ? { delta_g: num } : { remaining_weight_g: num };
        const res = await apiFetch(`/api/filaments/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body)
        });
        state.filaments = res.filaments;
        if (res.projects) state.projects = res.projects;
        renderAll();
        showToast('Restmenge aktualisiert');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'calc-spool') {
      renderProjects(id);
      switchTab('calculator');
      const firstWeightInput = document.querySelector('.project-add-row input[name="weight_g"]');
      if (firstWeightInput) firstWeightInput.focus();
    }
  });

  // --- Projects & Multi-Filament Cost Calculator Interactions ---
  const newProjImgInput = document.getElementById('newProjectImage');
  const newProjImgPreview = document.getElementById('newProjectImagePreview');
  const existingProjImgPicker = document.getElementById('existingProjectImagePicker');

  newProjImgInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) {
      state.newProjectImageData = '';
      newProjImgPreview.classList.add('hidden');
      return;
    }
    try {
      const dataUrl = await compressImageFile(file);
      state.newProjectImageData = dataUrl;
      newProjImgPreview.src = dataUrl;
      newProjImgPreview.classList.remove('hidden');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  existingProjImgPicker.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    const projectId = state.targetImageProjectId;
    existingProjImgPicker.value = '';
    if (!file || !projectId) return;

    try {
      const dataUrl = await compressImageFile(file);
      const res = await apiFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ image_data: dataUrl })
      });
      state.projects = res.projects;
      renderProjects();
      showToast('Projektbild gespeichert');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('createProjectForm').addEventListener('submit', async e => {
    e.preventDefault();
    const nameInput = document.getElementById('newProjectName');
    const printTimeInput = document.getElementById('newProjectPrintTime');
    const notesInput = document.getElementById('newProjectNotes');
    const name = nameInput.value.trim();
    const printTime = printTimeInput.value.trim();
    const notes = notesInput.value.trim();
    if (!name) return;

    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          print_time: printTime,
          notes,
          image_data: state.newProjectImageData
        })
      });
      state.projects = res.projects;
      nameInput.value = '';
      printTimeInput.value = '';
      notesInput.value = '';
      newProjImgInput.value = '';
      state.newProjectImageData = '';
      newProjImgPreview.classList.add('hidden');
      renderAll();
      showToast(`Projekt „${name}“ angelegt`);
    } catch (err) {
      showToast(err.message, true);
    }
  });

  const projectsContainer = document.getElementById('projectsContainer');

  // Add Filament + Weight item to a Project
  projectsContainer.addEventListener('submit', async e => {
    const form = e.target.closest('[data-add-item-form]');
    if (!form) return;
    e.preventDefault();

    const projectId = Number(form.dataset.addItemForm);
    const label = form.elements.label.value.trim();
    const filamentId = Number(form.elements.filament_id.value);
    const weightG = Number(form.elements.weight_g.value);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          filament_id: filamentId,
          label,
          weight_g: weightG
        })
      });
      state.projects = res.projects;
      renderAll();
      showToast('Filament zum Projekt hinzugefügt');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Inline Filament or Weight Update on a Project Item
  projectsContainer.addEventListener('change', async e => {
    const row = e.target.closest('[data-item-row]');
    if (!row) return;
    if (!e.target.matches('[data-item-weight], [data-item-filament-select]')) return;

    const itemId = Number(row.dataset.itemRow);
    const label = row.dataset.itemLabel || '';
    const filamentSelect = row.querySelector('[data-item-filament-select]');
    const weightInput = row.querySelector('[data-item-weight]');

    const filamentId = Number(filamentSelect?.value);
    const weightG = Number(weightInput?.value);

    if (!filamentId || !Number.isFinite(weightG) || weightG <= 0) {
      renderProjects();
      return;
    }

    try {
      const res = await apiFetch(`/api/project-items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({
          filament_id: filamentId,
          label,
          weight_g: weightG
        })
      });
      state.projects = res.projects;
      renderProjects();
      showToast('Position & Projektpreis aktualisiert');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  // Project Actions (Delete Item, Edit Project, Delete Project, Deduct Project from Stock)
  projectsContainer.addEventListener('click', async e => {
    const delItemBtn = e.target.closest('[data-delete-item]');
    if (delItemBtn) {
      const itemId = Number(delItemBtn.dataset.deleteItem);
      try {
        const res = await apiFetch(`/api/project-items/${itemId}`, { method: 'DELETE' });
        state.projects = res.projects;
        renderAll();
        showToast('Position entfernt');
      } catch (err) {
        showToast(err.message, true);
      }
      return;
    }

    const projBtn = e.target.closest('[data-proj-action]');
    if (!projBtn) return;

    const projectId = Number(projBtn.dataset.projectId);
    const action = projBtn.dataset.projAction;
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    if (action === 'pick-image') {
      state.targetImageProjectId = projectId;
      existingProjImgPicker.click();
    } else if (action === 'remove-image') {
      try {
        const res = await apiFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ image_data: '' })
        });
        state.projects = res.projects;
        renderProjects();
        showToast('Projektbild entfernt');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'edit-time') {
      const newTime = prompt('Druckzeit für „' + project.name + '“ (z. B. 6h 25m):', project.print_time || '');
      if (newTime === null) return;
      try {
        const res = await apiFetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ print_time: newTime.trim() })
        });
        state.projects = res.projects;
        renderProjects();
        showToast('Druckzeit gespeichert');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'edit') {
      const newName = prompt('Projektname bearbeiten:', project.name);
      if (newName === null || !newName.trim()) return;
      const newTime = prompt('Druckzeit (optional, z. B. 6h 25m):', project.print_time || '');
      const newNotes = prompt('Notiz / Beschreibung (optional):', project.notes || '');
      try {
        const res = await apiFetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: newName.trim(),
            print_time: newTime !== null ? newTime.trim() : project.print_time,
            notes: newNotes !== null ? newNotes.trim() : project.notes
          })
        });
        state.projects = res.projects;
        renderProjects();
        showToast('Projekt aktualisiert');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'delete') {
      if (!confirm(`Projekt „${project.name}“ samt aller Positionen wirklich löschen?`)) return;
      try {
        const res = await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
        state.projects = res.projects;
        renderAll();
        showToast('Projekt gelöscht');
      } catch (err) {
        showToast(err.message, true);
      }
    } else if (action === 'deduct') {
      if (
        !confirm(
          `Projekt „${project.name}“ (${formatGrams(project.total_weight_g)}) wurde gedruckt?\n` +
          `Alle hinterlegten Gewichte werden jetzt von den jeweiligen Spulen im Bestand abgezogen.`
        )
      ) {
        return;
      }
      try {
        const res = await apiFetch(`/api/projects/${projectId}/deduct`, { method: 'POST' });
        state.filaments = res.filaments;
        state.projects = res.projects;
        renderAll();
        showToast(`Verbrauch für „${project.name}“ vom Bestand abgezogen`);
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  // Manufacturer Form (Add / Edit / Delete)
  const mfgForm = document.getElementById('manufacturerForm');
  const cancelMfgBtn = document.getElementById('btnCancelMfgEdit');

  function resetMfgForm() {
    mfgForm.reset();
    document.getElementById('mfgEditId').value = '';
    document.getElementById('mfgSpoolWeightInput').value = '200';
    document.getElementById('mfgFormTitle').textContent = 'Hersteller hinzufügen';
    document.getElementById('btnSaveMfg').textContent = 'Hersteller speichern';
    cancelMfgBtn.classList.add('hidden');
  }

  cancelMfgBtn.addEventListener('click', resetMfgForm);

  mfgForm.addEventListener('submit', async e => {
    e.preventDefault();
    const editId = document.getElementById('mfgEditId').value;
    const payload = {
      name: document.getElementById('mfgNameInput').value.trim(),
      country: document.getElementById('mfgCountryInput').value.trim(),
      empty_spool_weight_g: Number(document.getElementById('mfgSpoolWeightInput').value) || 200
    };

    try {
      const res = await apiFetch(
        editId ? `/api/manufacturers/${editId}` : '/api/manufacturers',
        {
          method: editId ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );
      state.manufacturers = res.manufacturers;
      if (res.filaments) state.filaments = res.filaments;
      if (res.projects) state.projects = res.projects;
      resetMfgForm();
      renderAll();
      showToast(editId ? 'Hersteller aktualisiert' : 'Hersteller hinzugefügt');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  document.getElementById('manufacturersList').addEventListener('click', async e => {
    const editBtn = e.target.closest('[data-mfg-edit]');
    if (editBtn) {
      const id = Number(editBtn.dataset.mfgEdit);
      const mfg = state.manufacturers.find(m => m.id === id);
      if (!mfg) return;
      document.getElementById('mfgEditId').value = String(mfg.id);
      document.getElementById('mfgNameInput').value = mfg.name;
      document.getElementById('mfgCountryInput').value = mfg.country || '';
      document.getElementById('mfgSpoolWeightInput').value = String(mfg.empty_spool_weight_g || 200);
      document.getElementById('mfgFormTitle').textContent = 'Hersteller bearbeiten';
      document.getElementById('btnSaveMfg').textContent = 'Änderungen speichern';
      cancelMfgBtn.classList.remove('hidden');
      document.getElementById('mfgNameInput').focus();
      return;
    }

    const delBtn = e.target.closest('[data-mfg-delete]');
    if (delBtn && !delBtn.disabled) {
      const id = Number(delBtn.dataset.mfgDelete);
      const mfg = state.manufacturers.find(m => m.id === id);
      if (!mfg) return;
      if (!confirm(`Hersteller „${mfg.name}“ wirklich löschen?`)) return;
      try {
        const res = await apiFetch(`/api/manufacturers/${id}`, { method: 'DELETE' });
        state.manufacturers = res.manufacturers;
        renderAll();
        showToast('Hersteller gelöscht');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  });

  // --- Settings Form (Electricity Price & Printer Power Consumption) ---
  ['sElectricityPrice', 'sPrinterPowerKwh'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateSettingsLivePreview);
  });

  document.getElementById('quickElecPriceChips').addEventListener('click', e => {
    const chip = e.target.closest('[data-elec-price]');
    if (!chip) return;
    document.getElementById('sElectricityPrice').value = chip.dataset.elecPrice;
    updateSettingsLivePreview();
  });

  document.getElementById('quickPowerChips').addEventListener('click', e => {
    const chip = e.target.closest('[data-power-kwh]');
    if (!chip) return;
    document.getElementById('sPrinterPowerKwh').value = chip.dataset.powerKwh;
    updateSettingsLivePreview();
  });

  document.getElementById('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      printer_name: document.getElementById('sPrinterName').value.trim(),
      electricity_price_per_kwh: Number(document.getElementById('sElectricityPrice').value),
      printer_power_kwh: Number(document.getElementById('sPrinterPowerKwh').value)
    };

    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.settings = res.settings;
      if (res.projects) state.projects = res.projects;
      renderAll();
      showToast('Strom- & Druckereinstellungen gespeichert');
    } catch (err) {
      showToast(err.message, true);
    }
  });
});
