"""
excel_data_loader.py — Loader generico Excel → JSON per il Rule Engine

CONVENZIONE EXCEL:
Ogni file Excel del cliente DEVE avere un foglio "_META" che descrive i dati.
Il loader legge _META, valida la struttura, e produce file JSON in ./data/

TIPI DI TABELLA SUPPORTATI:
- lookup_range:   input numerico → output multipli, partizionabile (es: contattori)
- lookup_mapping: chiave testuale → output multipli (es: utilizzatori_elettrici)
- catalog:        catalogo prodotti, matching multi-criterio (es: trasformatori)
- constants:      tabella costanti chiave→valore (es: ponti raddrizzatori)

FORMATO FOGLIO _META:
Riga 1: headers
  foglio | tipo | nome_tabella | colonna_lookup | tipo_lookup | partizionato_per | colonne_output | note
Righe successive: una riga per ogni foglio dati
"""

import json
import os
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


class ExcelDataLoader:
    """Parser generico: Excel con _META → JSON data tables."""

    TIPI_VALIDI = {"lookup_range", "lookup_mapping", "catalog", "constants"}
    META_COLUMNS = [
        "foglio", "tipo", "nome_tabella", "colonna_lookup",
        "tipo_lookup", "partizionato_per", "colonne_output", "note"
    ]

    def __init__(self, data_dir: str = "./data"):
        self.data_dir = data_dir
        os.makedirs(data_dir, exist_ok=True)
        self.errors: List[str] = []
        self.warnings: List[str] = []

    # ========================================================================
    # ENTRY POINT
    # ========================================================================
    def load_excel(self, filepath: str, overwrite: bool = True) -> Dict[str, Any]:
        """
        Carica un Excel con _META, valida, genera JSON in ./data/.
        
        Returns:
            {
                "success": bool,
                "tables_generated": ["nome_tabella1", ...],
                "files_written": ["data/xxx.json", ...],
                "errors": [...],
                "warnings": [...]
            }
        """
        self.errors = []
        self.warnings = []

        try:
            import openpyxl
        except ImportError:
            return {"success": False, "errors": ["openpyxl non installato"]}

        try:
            wb = openpyxl.load_workbook(filepath, data_only=True)
        except Exception as e:
            return {"success": False, "errors": [f"Errore apertura file: {e}"]}

        # 1. Leggi e valida _META
        meta_entries = self._read_meta(wb)
        if not meta_entries:
            wb.close()
            return {
                "success": False,
                "tables_generated": [],
                "files_written": [],
                "errors": self.errors or ["Foglio _META mancante o vuoto"],
                "warnings": self.warnings
            }

        # 2. Per ogni entry in _META, parsa il foglio corrispondente
        tables_generated = []
        files_written = []

        for entry in meta_entries:
            foglio_nome = entry["foglio"]
            tipo = entry["tipo"]
            nome_tabella = entry["nome_tabella"]

            if foglio_nome not in wb.sheetnames:
                self.errors.append(f"Foglio '{foglio_nome}' dichiarato in _META ma non trovato nel file")
                continue

            ws = wb[foglio_nome]
            rows = self._read_sheet_data(ws)

            if not rows:
                self.warnings.append(f"Foglio '{foglio_nome}' è vuoto, saltato")
                continue

            # Genera JSON in base al tipo
            try:
                if tipo == "lookup_range":
                    json_data = self._build_lookup_range(entry, rows)
                elif tipo == "lookup_mapping":
                    json_data = self._build_lookup_mapping(entry, rows)
                elif tipo == "catalog":
                    json_data = self._build_catalog(entry, rows)
                elif tipo == "constants":
                    json_data = self._build_constants(entry, rows)
                else:
                    self.errors.append(f"Tipo '{tipo}' non supportato per '{nome_tabella}'")
                    continue
            except Exception as e:
                self.errors.append(f"Errore parsing '{foglio_nome}': {e}")
                continue

            # Aggiungi metadata
            json_data["_meta"] = {
                "nome": nome_tabella,
                "tipo": tipo,
                "foglio_origine": foglio_nome,
                "file_origine": os.path.basename(filepath),
                "generato_il": datetime.now().isoformat(),
                "righe": len(rows) - 1,  # escludi header
            }

            # Scrivi file
            outpath = os.path.join(self.data_dir, f"{nome_tabella}.json")
            if os.path.exists(outpath) and not overwrite:
                self.warnings.append(f"File '{outpath}' già esiste, saltato (overwrite=False)")
                continue

            with open(outpath, "w", encoding="utf-8") as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)

            tables_generated.append(nome_tabella)
            files_written.append(outpath)
            logger.info(f"Generato: {outpath} ({tipo}, {len(rows)-1} righe)")

        wb.close()

        # 3. Gestione fogli con partizioni: unisci in un'unica tabella
        # (fatto in _build_lookup_range quando partizionato_per è un foglio multiplo)

        return {
            "success": len(self.errors) == 0,
            "tables_generated": tables_generated,
            "files_written": files_written,
            "errors": self.errors,
            "warnings": self.warnings,
        }

    # ========================================================================
    # LETTURA _META
    # ========================================================================
    def _read_meta(self, wb) -> List[Dict[str, str]]:
        """Legge il foglio _META e restituisce lista di entry."""
        if "_META" not in wb.sheetnames:
            self.errors.append("Foglio '_META' non trovato. Ogni Excel deve avere un foglio _META.")
            return []

        ws = wb["_META"]
        rows = list(ws.iter_rows(values_only=True))

        if len(rows) < 2:
            self.errors.append("Foglio _META vuoto (serve almeno header + 1 riga dati)")
            return []

        # Valida headers
        headers = [str(h).strip().lower() if h else "" for h in rows[0]]
        
        # Mapping flessibile: accetta sia nomi esatti che varianti
        col_map = {}
        for i, h in enumerate(headers):
            for expected in self.META_COLUMNS:
                if h == expected or h.replace(" ", "_") == expected:
                    col_map[expected] = i
                    break

        missing = {"foglio", "tipo", "nome_tabella"} - set(col_map.keys())
        if missing:
            self.errors.append(f"Colonne obbligatorie mancanti in _META: {missing}")
            return []

        # Leggi entries
        entries = []
        for row_idx, row in enumerate(rows[1:], start=2):
            entry = {}
            for col_name, col_idx in col_map.items():
                val = row[col_idx] if col_idx < len(row) else None
                entry[col_name] = str(val).strip() if val is not None else ""

            # Validazioni
            if not entry.get("foglio"):
                self.warnings.append(f"_META riga {row_idx}: campo 'foglio' vuoto, saltata")
                continue
            if entry.get("tipo") not in self.TIPI_VALIDI:
                self.errors.append(
                    f"_META riga {row_idx}: tipo '{entry.get('tipo')}' non valido. "
                    f"Valori ammessi: {', '.join(sorted(self.TIPI_VALIDI))}"
                )
                continue
            if not entry.get("nome_tabella"):
                entry["nome_tabella"] = entry["foglio"].lower().replace(" ", "_")

            entries.append(entry)

        return entries

    # ========================================================================
    # LETTURA DATI FOGLIO
    # ========================================================================
    def _read_sheet_data(self, ws) -> List[List[Any]]:
        """Legge tutte le righe di un foglio come lista di liste."""
        rows = []
        for row in ws.iter_rows(values_only=True):
            # Salta righe completamente vuote
            if all(v is None for v in row):
                continue
            rows.append(list(row))
        return rows

    def _rows_to_dicts(self, rows: List[List]) -> Tuple[List[str], List[Dict[str, Any]]]:
        """Converte righe (con header in riga 0) in lista di dict."""
        if len(rows) < 2:
            return [], []
        headers = [str(h).strip().lower().replace(" ", "_") if h else f"col_{i}" 
                   for i, h in enumerate(rows[0])]
        dicts = []
        for row in rows[1:]:
            d = {}
            for i, h in enumerate(headers):
                val = row[i] if i < len(row) else None
                # Converti tipi
                if val is not None:
                    if isinstance(val, float) and val == int(val):
                        val = int(val)
                d[h] = val
            dicts.append(d)
        return headers, dicts

    # ========================================================================
    # BUILDER: lookup_range
    # ========================================================================
    def _build_lookup_range(self, entry: Dict, rows: List[List]) -> Dict[str, Any]:
        """
        Genera lookup_range: input numerico → output multipli.
        
        Supporta partizioni (es: fogli diversi per 50Hz/60Hz).
        Se partizionato_per contiene '|', interpreta come: campo_partizione|val1:foglio1,val2:foglio2
        Altrimenti, singola tabella senza partizioni.
        
        Output JSON:
        {
            "tipo": "lookup_range",
            "parametro_lookup": "potenza_kw",
            "partizionato_per": "frequenza",     # opzionale
            "partizioni": {
                "50Hz_400V": [
                    {"da": 0, "a": 5.2, "output": {"contattore": "LC1D09", ...}},
                    ...
                ]
            }
        }
        
        Senza partizioni:
        {
            "tipo": "lookup_range",
            "parametro_lookup": "potenza_kw",
            "ranges": [
                {"da": 0, "a": 5.2, "output": {"contattore": "LC1D09", ...}},
                ...
            ]
        }
        """
        headers, data = self._rows_to_dicts(rows)
        col_lookup = entry.get("colonna_lookup", "").strip().lower().replace(" ", "_")
        
        if not col_lookup or col_lookup not in headers:
            # Fallback: prima colonna numerica
            col_lookup = headers[0] if headers else ""
            self.warnings.append(
                f"colonna_lookup non specificata/trovata per '{entry['nome_tabella']}', "
                f"uso prima colonna: '{col_lookup}'"
            )

        # Colonne output: esplicite o tutte tranne lookup
        output_cols = self._parse_output_cols(entry.get("colonne_output", ""), headers, [col_lookup])

        # Costruisci ranges ordinati per valore lookup
        data_sorted = sorted(data, key=lambda r: float(r.get(col_lookup, 0) or 0))
        
        ranges = []
        for i, row in enumerate(data_sorted):
            val = row.get(col_lookup)
            if val is None:
                continue
            
            da = float(val) if i == 0 else ranges[-1]["a"] if ranges else 0
            # "a" = valore successivo (o None per ultimo)
            if i + 1 < len(data_sorted):
                next_val = data_sorted[i + 1].get(col_lookup)
                a = float(next_val) if next_val is not None else None
            else:
                a = None  # ultimo range: senza limite superiore
            
            output = {col: row.get(col) for col in output_cols if row.get(col) is not None}
            
            ranges.append({"da": da, "a": a, "output": output})

        result = {
            "tipo": "lookup_range",
            "parametro_lookup": col_lookup,
        }

        # Se partizionato, wrappa in partizioni con chiave dal nome foglio
        part_field = entry.get("partizionato_per", "").strip()
        if part_field:
            result["partizionato_per"] = part_field
            # Nome partizione dal nome foglio
            part_value = entry["foglio"].replace("/", "_").replace(" ", "_")
            result["partizioni"] = {part_value: ranges}
        else:
            result["ranges"] = ranges

        return result

    # ========================================================================
    # BUILDER: lookup_mapping
    # ========================================================================
    def _build_lookup_mapping(self, entry: Dict, rows: List[List]) -> Dict[str, Any]:
        """
        Genera lookup_mapping: chiave testuale → output multipli.
        
        Output JSON:
        {
            "tipo": "lookup_mapping",
            "parametro_lookup": "nome_utilizzatore",
            "valori": {
                "pattino_retrattile": {"tensione_v": 60, "va": 150, ...},
                "ami100_24v": {"tensione_v": 19, "va": 70, ...},
                ...
            }
        }
        """
        headers, data = self._rows_to_dicts(rows)
        col_lookup = entry.get("colonna_lookup", "").strip().lower().replace(" ", "_")
        
        if not col_lookup or col_lookup not in headers:
            col_lookup = headers[0] if headers else ""
            self.warnings.append(f"colonna_lookup default: '{col_lookup}'")

        output_cols = self._parse_output_cols(entry.get("colonne_output", ""), headers, [col_lookup])

        valori = {}
        for row in data:
            key_raw = row.get(col_lookup)
            if key_raw is None:
                continue
            # Normalizza chiave: lowercase, spazi → underscore
            key = str(key_raw).strip().lower().replace(" ", "_").replace("'", "")
            output = {col: row.get(col) for col in output_cols if row.get(col) is not None}
            valori[key] = output

        return {
            "tipo": "lookup_mapping",
            "parametro_lookup": col_lookup,
            "valori": valori,
        }

    # ========================================================================
    # BUILDER: catalog
    # ========================================================================
    def _build_catalog(self, entry: Dict, rows: List[List]) -> Dict[str, Any]:
        """
        Genera catalog: tabella piatta di prodotti per matching multi-criterio.
        
        Il catalogo viene usato dall'action type 'catalog_match' del rule engine.
        
        Output JSON:
        {
            "tipo": "catalog",
            "colonna_id": "codice",
            "colonne": ["codice", "tipo", "potenza_va", ...],
            "records": [
                {"codice": "218", "tipo": "mono", "potenza_va": 600, ...},
                ...
            ]
        }
        """
        headers, data = self._rows_to_dicts(rows)
        col_lookup = entry.get("colonna_lookup", "").strip().lower().replace(" ", "_")
        
        # colonna_lookup per un catalogo = colonna ID (codice prodotto)
        if not col_lookup or col_lookup not in headers:
            col_lookup = headers[0] if headers else "codice"

        return {
            "tipo": "catalog",
            "colonna_id": col_lookup,
            "colonne": headers,
            "records": data,
        }

    # ========================================================================
    # BUILDER: constants
    # ========================================================================
    def _build_constants(self, entry: Dict, rows: List[List]) -> Dict[str, Any]:
        """
        Genera constants: tabella semplice chiave → valori.
        
        Output JSON:
        {
            "tipo": "constants",
            "valori": {
                "monofase": {"fattore_ac_dc": 0.9, "fattore_dc_ac": 1.1111},
                ...
            }
        }
        """
        headers, data = self._rows_to_dicts(rows)
        col_lookup = entry.get("colonna_lookup", "").strip().lower().replace(" ", "_")
        
        if not col_lookup or col_lookup not in headers:
            col_lookup = headers[0] if headers else ""

        output_cols = self._parse_output_cols(entry.get("colonne_output", ""), headers, [col_lookup])

        valori = {}
        for row in data:
            key = row.get(col_lookup)
            if key is None:
                continue
            key_str = str(key).strip().lower().replace(" ", "_")
            output = {col: row.get(col) for col in output_cols if row.get(col) is not None}
            valori[key_str] = output

        return {
            "tipo": "constants",
            "parametro_lookup": col_lookup,
            "valori": valori,
        }

    # ========================================================================
    # UTILITY: merge partizioni
    # ========================================================================
    def merge_partitioned_tables(self, table_names: List[str], 
                                  merged_name: str,
                                  partition_field: str) -> Dict[str, Any]:
        """
        Unisce più tabelle lookup_range partizionate in una sola.
        
        Utile quando fogli diversi dello stesso Excel rappresentano partizioni
        (es: "50Hz_400V" e "60Hz_440V" → unica tabella con campo partizione).
        
        Args:
            table_names: nomi delle tabelle JSON da unire
            merged_name: nome della tabella risultante
            partition_field: nome del campo di partizione
        """
        merged = {
            "tipo": "lookup_range",
            "partizionato_per": partition_field,
            "partizioni": {},
        }

        parametro_lookup = None

        for name in table_names:
            filepath = os.path.join(self.data_dir, f"{name}.json")
            if not os.path.exists(filepath):
                self.errors.append(f"File '{filepath}' non trovato per merge")
                continue

            with open(filepath, "r", encoding="utf-8") as f:
                table = json.load(f)

            if parametro_lookup is None:
                parametro_lookup = table.get("parametro_lookup")
            
            merged["parametro_lookup"] = parametro_lookup

            # Copia partizioni o ranges
            if "partizioni" in table:
                merged["partizioni"].update(table["partizioni"])
            elif "ranges" in table:
                # Usa il nome tabella come chiave partizione
                merged["partizioni"][name] = table["ranges"]

        # Aggiungi meta
        merged["_meta"] = {
            "nome": merged_name,
            "tipo": "lookup_range",
            "merged_from": table_names,
            "generato_il": datetime.now().isoformat(),
        }

        # Scrivi
        outpath = os.path.join(self.data_dir, f"{merged_name}.json")
        with open(outpath, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)

        return merged

    # ========================================================================
    # UTILITY: load table
    # ========================================================================
    def load_table(self, nome_tabella: str) -> Optional[Dict[str, Any]]:
        """Carica una tabella JSON dal data_dir."""
        filepath = os.path.join(self.data_dir, f"{nome_tabella}.json")
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_tables(self) -> List[Dict[str, Any]]:
        """Lista tutte le tabelle disponibili in data_dir."""
        tables = []
        if not os.path.exists(self.data_dir):
            return tables
        for fname in sorted(os.listdir(self.data_dir)):
            if not fname.endswith(".json"):
                continue
            filepath = os.path.join(self.data_dir, fname)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                meta = data.get("_meta", {})
                tables.append({
                    "nome": meta.get("nome", fname.replace(".json", "")),
                    "tipo": data.get("tipo", meta.get("tipo", "unknown")),
                    "file": fname,
                    "righe": meta.get("righe", 0),
                    "file_origine": meta.get("file_origine", ""),
                    "generato_il": meta.get("generato_il", ""),
                })
            except Exception:
                pass
        return tables

    # ========================================================================
    # UTILITY: parse output columns
    # ========================================================================
    def _parse_output_cols(self, colonne_output_str: str, headers: List[str], 
                           exclude: List[str]) -> List[str]:
        """Parsa stringa colonne_output → lista colonne."""
        if colonne_output_str.strip():
            return [c.strip().lower().replace(" ", "_") 
                    for c in colonne_output_str.split(",")
                    if c.strip()]
        # Default: tutte tranne quelle escluse
        return [h for h in headers if h not in exclude]

    # ========================================================================
    # VALIDAZIONE EXCEL
    # ========================================================================
    def validate_excel(self, filepath: str) -> Dict[str, Any]:
        """
        Valida un Excel senza generare JSON.
        Utile per preview / anteprima prima del caricamento.
        """
        try:
            import openpyxl
            wb = openpyxl.load_workbook(filepath, data_only=True)
        except Exception as e:
            return {"valid": False, "errors": [str(e)]}

        self.errors = []
        self.warnings = []

        result = {
            "fogli": wb.sheetnames,
            "ha_meta": "_META" in wb.sheetnames,
        }

        if not result["ha_meta"]:
            result["valid"] = False
            result["errors"] = ["Foglio '_META' non trovato"]
            wb.close()
            return result

        meta_entries = self._read_meta(wb)
        
        sheets_info = []
        for entry in meta_entries:
            foglio = entry["foglio"]
            info = {
                "foglio": foglio,
                "tipo": entry["tipo"],
                "nome_tabella": entry["nome_tabella"],
                "esiste": foglio in wb.sheetnames,
            }
            if info["esiste"]:
                ws = wb[foglio]
                rows = self._read_sheet_data(ws)
                info["righe"] = len(rows) - 1 if rows else 0
                info["colonne"] = [str(h) for h in rows[0]] if rows else []
            sheets_info.append(info)

        result["tabelle"] = sheets_info
        result["valid"] = len(self.errors) == 0
        result["errors"] = self.errors
        result["warnings"] = self.warnings

        wb.close()
        return result


# ============================================================================
# CLI per test rapido
# ============================================================================
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Uso: python excel_data_loader.py <file.xlsx> [--validate]")
        sys.exit(1)

    filepath = sys.argv[1]
    loader = ExcelDataLoader()

    if "--validate" in sys.argv:
        result = loader.validate_excel(filepath)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        result = loader.load_excel(filepath)
        print(json.dumps(result, indent=2, ensure_ascii=False))
