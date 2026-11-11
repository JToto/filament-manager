# SpoolMate — Filament-Manager & Projekt-Kostenrechner

<img width="2496" height="3206" alt="image" src="https://github.com/user-attachments/assets/eae812de-50e5-4b02-9c74-6ea17f3e77e5" />

<img width="1280" height="873" alt="image" src="https://github.com/user-attachments/assets/468927a6-8999-494c-8478-d31b04596838" />


Eine übersichtliche, schnelle Web-App im Industrial-Light-Design (`#FF5F1F`) zum Verwalten von 3D-Druck Filament-Spulen, Herstellern und mehrteiligen Druckprojekten inkl. Material- und Stromkosten-Kalkulation.

Alle Daten werden lokal und persistent in einer **SQLite-Datenbank** (`data/filaments.db`) gespeichert – ganz ohne externe `npm`-Abhängigkeiten (nutzt das in Node.js 22+ integrierte `node:sqlite`).

---

## Disclaimer

Die Anwendung ist per Vibe-Coding entstanden, da ich Bedarf hatte, meinen Filament-Bestand zu verwalten und die Kosten meiner Drucke zu berechnen.
Ihr könnt sie gerne nutzen oder erweitern, um euch eigene Token-Kosten zu sparen :)

## Voraussetzungen & Start

- **Node.js `>= 22.5.0`**

```bash
# Server starten
npm start

# Oder im Entwicklungsmodus mit automatischem Reload
npm run dev
```

Die App ist anschließend im Browser erreichbar unter:
👉 **http://localhost:3000**

---

## Funktionsumfang

### 1. Filament-Spulen verwalten
- **Automatische kg-Umrechnung**: Beim Anlegen einer Spule gibst du den **Kaufpreis (€)** und die **gekaufte Menge (g)** an (z. B. `250 g`, `750 g`, `1000 g`, `2000 g`) – der Kilopreis (`€/kg`) sowie der Grammpreis (`ct/g`) werden sofort live berechnet.
- **Set- & Duplizierungs-Workflow**:
  - **„Duplizieren“-Button** auf jeder Spulenkarte übernimmt Hersteller, Material, Serie, Kaufpreis und Spulengröße für eine neue Spule – ideal für Multi-Packs / Sets.
  - **„Speichern & nächste Farbe“** im Dialog speichert die aktuelle Spule und lässt das Fenster mit allen Set-Daten für die nächste Farbe geöffnet.
- **Bestand & Schnell-Abzug**:
  - Farbige Spulen-Grafik mit Füllstandsring, Fortschrittsbalken und aktuellem Restwert in `€`.
  - Schnell-Buttons (`-10g`, `-25g`, `-50g`, `-100g`, `± …`) zum direkten Abziehen von verdrucktem Filament.
- **Filter & Sortierung**: Volltextsuche, Filter nach Hersteller, Material und „< 200 g Rest“ sowie Sortierung nach Restmenge, Kilopreis oder Hersteller.

### 2. Projekte & Kostenrechner (Multi-Platten / AMS)
- **Projekte anlegen**: Beliebig viele Projekte (z. B. *Teebox*, *Gridfinity*) mit optionalem **Vorschaubild** (wird automatisch skaliert & komprimiert), **Druckzeit** (z. B. `6h 25m`, `6:25`, `6,5h`) und Notiz.
- **Mehrere Filamente & Platten pro Projekt**:
  - Jedem Projekt können beliebig viele Positionen (Platten, Bauteile oder AMS-Farben) samt Spule und Gewicht (`g`) zugeordnet werden.
  - **Schneller Materialwechsel**: Das Filament jeder Projektposition kann direkt in der Tabellenzeile per Dropdown ausgetauscht werden – Einzel- und Gesamtpreise sowie Bestands-Warnungen aktualisieren sich sofort.
  - **Inline-Gewichtsanpassung**: Grammzahlen lassen sich direkt in der Tabelle ändern.
- **Material- & Stromkosten**:
  - Summiert automatisch **Gesamtgewicht**, **Materialkosten**, **Stromkosten** (anhand der Druckzeit) und den **Gesamtpreis**.
  - **„Vom Bestand abziehen“**: Zieht nach einem fertigen Druck alle im Projekt hinterlegten Gewichte mit einem Klick von den jeweiligen Spulen im Bestand ab.

### 3. Hersteller verwalten
- **16 gängige Hersteller** (*Bambu Lab, Prusament, eSUN, SUNLU, Polymaker, Extrudr, Das Filament, Eryone, Elegoo, Overture, Creality, Anycubic, Redline Filament, FormFutura, Geeetech, Fiberlogy*) sind bereits vorinstalliert.
- Eigene Hersteller inkl. Länderkürzel und durchschnittlichem Leerspulengewicht (`g`) können jederzeit ergänzt, bearbeitet oder gelöscht werden.

### 4. Einstellungen (Strom- & Druckerkosten)
- Hinterlegung des **Strompreises (`€/kWh`)** und des durchschnittlichen **Drucker-Stromverbrauchs (`kWh` pro Stunde Druckzeit)** inkl. Live-Umrechnung in Watt und Vorschautabelle.

---

## Projektstruktur

```text
.
├── server.js          # Node.js HTTP/REST-Server & SQLite-Datenbanklogik
├── package.json       # Start-Skripte
├── data/
│   └── filaments.db   # Lokale SQLite-Datenbank (wird beim Start automatisch erzeugt)
└── public/
    ├── index.html     # App-Struktur & Dialoge
    ├── styles.css     # Light-Theme Styling (#FF5F1F Akzent)
    └── app.js         # Frontend-Logik & API-Anbindung
```
