/**
 * HttpUtils — Hilfsklassen für HTTP-Responses, Request-Body-Parsing
 * sowie Berechnungs- und Konvertierungsfunktionen im Backend.
 */
class HttpUtils {
  /**
   * Sendet eine JSON-Antwort mit passendem Statuscode und No-Cache-Header.
   */
  static sendJson(res, statusCode, payload) {
    const data = JSON.stringify(payload);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  }

  /**
   * Liest und parst einen JSON-Request-Body (max. 5 MB).
   */
  static parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          reject(new Error('Payload too large'));
        }
      });
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          reject(new Error('Ungültiges JSON-Format'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Liest einen binären Request-Body als Buffer (z. B. für .3mf Datei-Uploads, max. 100 MB).
   */
  static parseRawBody(req, maxBytes = 100 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      req.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(new Error('Datei ist zu groß (max. 100 MB).'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      req.on('error', reject);
    });
  }

  /**
   * Berechnet den Kilopreis (€/kg) aus Kaufpreis (€) und Initialgewicht (g).
   */
  static computePricePerKg(purchasePrice, initialWeightG) {
    const price = Number(purchasePrice);
    const weight = Number(initialWeightG);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error('Bitte einen gültigen Preis eingeben.');
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error('Die Menge muss größer als 0 g sein.');
    }
    return Number(((price / weight) * 1000).toFixed(2));
  }

  /**
   * Extrahiert die Grundmaterial-Familie (z. B. "PLA+" -> "PLA", "PLA Matte" -> "PLA", "PETG-CF" -> "PETG").
   */
  static getBaseMaterial(material) {
    return String(material || '')
      .trim()
      .toUpperCase()
      .split(/[\s+\-_/()]+/)[0];
  }

  /**
   * Formatiert Sekunden (aus Slicer-Metadaten) in einen lesbaren String wie "6h 25m".
   */
  static formatSecondsToPrintTime(seconds) {
    const sec = Math.round(Number(seconds) || 0);
    if (sec <= 0) return '';
    const totalMinutes = Math.max(1, Math.round(sec / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h`;
    }
    return `${minutes}m`;
  }

  /**
   * Parst eine freie Druckzeit-Angabe (z. B. "6h 25m", "6:30", "1d 2h", "4.5") in Dezimalstunden.
   */
  static parsePrintTimeToHours(raw) {
    const str = String(raw || '').trim().toLowerCase().replace(',', '.');
    if (!str) return 0;

    // Format HH:MM (z. B. "6:30" oder "06:30")
    const colonMatch = str.match(/^(\d+):(\d{1,2})$/);
    if (colonMatch) {
      return Number(colonMatch[1]) + Number(colonMatch[2]) / 60;
    }

    let totalHours = 0;
    let matchedUnit = false;

    const daysMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:d|t|tag|tage)\b/);
    if (daysMatch) {
      totalHours += Number(daysMatch[1]) * 24;
      matchedUnit = true;
    }

    const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:h|std|stunde|stunden)\b/);
    if (hoursMatch) {
      totalHours += Number(hoursMatch[1]);
      matchedUnit = true;
    }

    const minsMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute|minuten)\b/);
    if (minsMatch) {
      totalHours += Number(minsMatch[1]) / 60;
      matchedUnit = true;
    }

    if (matchedUnit) {
      return totalHours;
    }

    const num = Number(str);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }
}

module.exports = { HttpUtils };
