export interface ColorSwatch {
  name: string;
  hex: string;
}

export const COLOR_SWATCHES: ColorSwatch[] = [
  { name: 'Tiefschwarz', hex: '#1E2022' },
  { name: 'Anthrazit / Grau', hex: '#63686E' },
  { name: 'Silber Metallic', hex: '#A6ACB0' },
  { name: 'Reinweiß', hex: '#F4F4F0' },
  { name: 'Signalrot', hex: '#D93829' },
  { name: 'Bambu Orange', hex: '#FF5F1F' },
  { name: 'Sonnengelb', hex: '#F2B705' },
  { name: 'Bambu Grün', hex: '#00AE42' },
  { name: 'Waldgrün', hex: '#1E6B45' },
  { name: 'Kobaltblau', hex: '#1B56D0' },
  { name: 'Eisblau / Cyan', hex: '#28A8E0' },
  { name: 'Violett', hex: '#7A38B8' },
  { name: 'Beige / Holz', hex: '#C8A47E' },
  { name: 'Gold Silk', hex: '#D4AF37' }
];

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
});

const numFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1
});

/**
 * Formatiert einen Euro-Betrag nach deutschem Standard (z. B. "14,99 €").
 */
export function formatEur(val: number | null | undefined): string {
  return eurFormatter.format(Number(val) || 0);
}

/**
 * Formatiert eine Grammanzahl nach deutschem Standard (z. B. "1.000 g").
 */
export function formatGrams(g: number | null | undefined): string {
  return `${numFormatter.format(Number(g) || 0)} g`;
}

/**
 * Ermittelt die Basis-Materialfamilie (z. B. "PLA+" -> "PLA", "PLA Matte" -> "PLA", "PETG-CF" -> "PETG").
 * Ermöglicht den flexiblen Spulen-Austausch innerhalb derselben Materialgruppe.
 */
export function getBaseMaterial(mat: string | null | undefined): string {
  const s = String(mat || '').trim().toUpperCase();
  if (!s) return '';
  const families = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'PA', 'NYLON', 'PC', 'PVA', 'HIPS', 'PP'];
  for (const fam of families) {
    if (s === fam || s.startsWith(fam + '+') || s.startsWith(fam + '-') || s.startsWith(fam + ' ')) {
      return fam;
    }
  }
  return s.split(/[\s+-]/)[0];
}

/**
 * Skaliert ein hochgeladenes Bild im Browser per Canvas auf max. 360x360px (JPEG 0.8)
 * und gibt eine kompakte Data-URL für die Datenbank zurück.
 */
export function compressImageFile(file: File | null | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Bilddatei konnte nicht gelesen werden.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Ungültiges Bildformat.'));
      img.onload = () => {
        const maxDim = 360;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
        }
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
