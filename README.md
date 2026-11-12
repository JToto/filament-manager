# SpoolMate — Filament-Manager & Projekt-Kostenrechner

<img width="2496" height="3206" alt="image" src="https://github.com/user-attachments/assets/eae812de-50e5-4b02-9c74-6ea17f3e77e5" />

<img width="1280" height="873" alt="image" src="https://github.com/user-attachments/assets/468927a6-8999-494c-8478-d31b04596838" />


Eine übersichtliche, schnelle Web-App im Industrial-Light-Design (`#FF5F1F`) zum Verwalten von 3D-Druck Filament-Spulen, Herstellern und mehrteiligen Druckprojekten inkl. Material- und Stromkosten-Kalkulation.

Das Projekt ist speziell **für Bambu Lab Drucker, AMS-Workflows, MakerWorld und Bambu Studio optimiert** (inkl. automatischem `.3mf`-Import, Hintergrund-Slicing via Bambu Studio CLI und direktem Öffnen in Bambu Studio).

Alle Daten werden lokal und persistent in einer **SQLite-Datenbank** (`data/filaments.db`) gespeichert – ganz ohne externe `npm`-Abhängigkeiten (nutzt das in Node.js 22+ integrierte `node:sqlite`).

---

## Disclaimer

Die Anwendung ist per Vibe-Coding entstanden, da ich Bedarf hatte, meinen Filament-Bestand zu verwalten und die Kosten meiner Drucke zu berechnen.
Ihr könnt sie gerne nutzen oder erweitern, um euch eigene Token-Kosten zu sparen :)

## Voraussetzungen & Start

- **Node.js `>= 22.5.0`**
- **Optional (empfohlen auf macOS): [Bambu Studio](https://bambulab.com/en/download/studio)** in `/Applications/BambuStudio.app` für das direkte Öffnen von `.3mf`-Dateien sowie das automatische Hintergrund-Slicing ungeslicter MakerWorld-`.3mf`-Dateien.

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

### 2. Projekte & Kostenrechner (Multi-Platten / AMS & `.3mf` Auto-Import)
- **Projekte anlegen**: Beliebig viele Projekte (z. B. *Teebox*, *Bulk Kiste*, *Gridfinity*) mit optionalem **Vorschaubild** (wird automatisch skaliert & komprimiert), **Druckzeit** (z. B. `6h 25m`, `6:25`, `6,5h`), **`.3mf`-Projektdatei** und Notiz.
- **`.3mf` Auto-Import & Bambu Studio Integration**:
  - **Automatisches Auslesen**: Beim Hochladen einer `.3mf`-Datei extrahiert SpoolMate automatisch das **3D-Druckplatten-Vorschaubild**, die **Gesamtdruckzeit** über alle Platten sowie alle **Bauteile, Materialien, Farbcodes und Filamentgewichte (`g`)**.
  - **Headless-Slicing für MakerWorld-Dateien**: Ist eine `.3mf`-Datei noch ungeslict (z. B. frisch von MakerWorld heruntergeladen), ruft SpoolMate im Hintergrund automatisch die **Bambu Studio CLI** auf, slict alle Platten lautlos in wenigen Sekunden und importiert die exakten Gramm- und Zeitwerte.
  - **Automatisches Spulen-Matching**: Verknüpft jedes in der `.3mf` verwendete Filament anhand von Materialtyp und Farbcode automatisch mit der farblich am besten passenden Spule aus deinem Bestand.
  - **Direkt in Bambu Studio öffnen**: Über den Button **„In Bambu Studio öffnen“** auf der Projektkarte wird die hinterlegte `.3mf`-Datei mit einem Klick lokal in Bambu Studio gestartet.
- **Mehrere Filamente & Platten pro Projekt**:
  - Jedem Projekt können beliebig viele Positionen (Platten, Bauteile oder AMS-Farben) samt Spule und Gewicht (`g`) zugeordnet oder aus weiteren `.3mf`-Dateien hinzugefügt werden.
  - **Materialtreuer Spulen-Schnellwechsel**: Das Filament jeder Projektposition kann direkt in der Tabellenzeile per Dropdown durch eine andere Spule **desselben Materials** (z. B. `PLA` → `PLA`, `PETG` → `PETG`) ausgetauscht werden – Einzel- und Gesamtpreise sowie Bestands-Warnungen aktualisieren sich sofort, ohne dass Druckzeit oder Grammzahl verfälscht werden.
  - **Inline-Umbenennung & Gewichtsanpassung**: Kryptische Bauteilnamen aus `.3mf`-Dateien (z. B. `Platte 1 – Corpo_01`) sowie Grammzahlen lassen sich direkt per Klick in der Tabelle umbenennen bzw. anpassen.
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
