"""
rule_engine.py - Rule Engine unificato v4

Funzionalità:
  - build_config_context() legge da TUTTE le fonti (ORM + valori_configurazione + JSON legacy)
  - Regole da DB (tabella regole) E da file JSON (directory rules/)
  - Chiavi con prefisso sezione (normative.en_81_20) + chiavi piatte (en_81_20)
  - Esecuzione sequenziale: le azioni dentro una regola si eseguono in ordine,
    aggiornando il context ad ogni passo. Un singolo file JSON può contenere
    accumulate → catalog_match → add_material tutto insieme.
  - Data tables: carica JSON da ./data/ (generati da excel_data_loader.py)

Action types supportati:
  - add_material:            aggiunge materiale alla BOM
  - set_field:               imposta variabile _calc.* nel context
  - lookup_table:            cerca in tabella dati (range/mapping) → set variabili _calc.*
  - accumulate_from_lookup:  somma valori da lookup raggruppando per campo
  - catalog_match:           matching multi-criterio dinamico su catalogo prodotti

Compatibilità:
  - Regole vecchie con solo "conditions" + "materials" → funzionano identiche
  - Regole vecchie con solo "conditions" + "actions" con solo add_material → identiche
  - Regole nuove con "actions" misti (calc + material) → esecuzione sequenziale
"""
from typing import List, Dict, Any, Tuple, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect, text
import re
import os
import json
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# CONFIGURAZIONE
# ============================================================================
SEZIONI_DEDICATE = {
    "dati_principali": "dati_principali",
    "normative": "normative",
    "argano": "argano",
    "disposizione_vano": "disposizione_vano",
    "porte": "porte",
    "dati_commessa": "dati_commessa",
}

CAMPI_ESCLUSI = {"id", "preventivo_id", "created_at", "updated_at"}

DATA_DIR = "./data"
RULES_DIR = "./rules"


class RuleEngine:
    """
    Motore valutazione regole business.

    Flusso:
    1. build_config_context() → raccoglie tutti i dati configurazione
    2. Carica data tables da ./data/
    3. Carica regole (DB + file JSON), ordinate per priorità
    4. Per ogni regola: valuta conditions → se attiva, esegue actions in sequenza
    5. Ogni action aggiorna il context in-place → le action successive vedono i risultati
    6. Rimuove materiali orfani (regole non più attive)
    7. Aggiorna totale preventivo
    """

    def __init__(self, db: Session):
        self.db = db
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self._data_tables: Dict[str, Dict] = {}
        self._action_trace: List[Dict[str, Any]] = []

    # ========================================================================
    # 1. CONTEXT BUILDING
    # ========================================================================
    def build_config_context(self, preventivo) -> Dict[str, Any]:
        """
        Costruisce il context completo per la valutazione regole.

        Produce chiavi con DUE formati per ogni valore:
        - Con prefisso: "normative.en_81_20" → "2020"
        - Senza prefisso: "en_81_20" → "2020"
        """
        context: Dict[str, Any] = {}

        # --- Metadati preventivo ---
        context["preventivo_id"] = preventivo.id
        context["preventivo_tipo"] = getattr(preventivo, "tipo", None)
        context["preventivo_categoria"] = getattr(preventivo, "categoria", None)
        context["cliente_id"] = getattr(preventivo, "cliente_id", None)
        context["template_id"] = getattr(preventivo, "template_id", None)

        # --- Sezioni dedicate (ORM) ---
        for sezione_nome, relationship_name in SEZIONI_DEDICATE.items():
            obj = getattr(preventivo, relationship_name, None)
            if obj is None:
                continue
            campi = self._extract_fields_from_orm(obj)
            for campo, valore in campi.items():
                context[f"{sezione_nome}.{campo}"] = valore
                context[campo] = valore

        # --- Sezioni dinamiche (tabella valori_configurazione) ---
        try:
            rows = self.db.execute(
                text("""
                    SELECT sezione, codice_campo, valore
                    FROM valori_configurazione
                    WHERE preventivo_id = :pid
                """),
                {"pid": preventivo.id}
            ).fetchall()

            for row in rows:
                sezione, codice_campo, valore = row[0], row[1], row[2]
                valore_convertito = self._try_convert_value(valore)
                context[f"{sezione}.{codice_campo}"] = valore_convertito
                context[codice_campo] = valore_convertito

        except Exception as e:
            self.warnings.append(f"Tabella valori_configurazione non disponibile: {e}")

        # --- JSON legacy come fallback ---
        config_json = getattr(preventivo, "configurazione", None)
        if config_json and isinstance(config_json, dict):
            for k, v in config_json.items():
                if k.lower() not in context:
                    context[k.lower()] = v

        logger.debug(f"Context costruito con {len(context)} chiavi per preventivo {preventivo.id}")
        return context

    def _extract_fields_from_orm(self, obj) -> Dict[str, Any]:
        """Estrae tutti i campi da un oggetto ORM tramite introspezione."""
        campi = {}
        try:
            mapper = sa_inspect(type(obj))
            for col in mapper.columns:
                if col.key in CAMPI_ESCLUSI:
                    continue
                valore = getattr(obj, col.key, None)
                if valore is not None:
                    campi[col.key] = valore
        except Exception:
            for key, value in vars(obj).items():
                if key.startswith("_") or key in CAMPI_ESCLUSI:
                    continue
                if value is not None:
                    campi[key] = value
        return campi

    def _try_convert_value(self, valore) -> Any:
        """Tenta conversione stringa → numero se possibile."""
        if valore is None:
            return None
        if isinstance(valore, (int, float, bool)):
            return valore
        valore_str = str(valore).strip()
        if not valore_str:
            return valore_str
        try:
            return int(valore_str)
        except ValueError:
            pass
        try:
            return float(valore_str)
        except ValueError:
            pass
        return valore_str

    # ========================================================================
    # 2. DATA TABLES (da ./data/)
    # ========================================================================
    def _load_data_tables(self):
        """Carica tutte le tabelle JSON da ./data/ (lazy, cached)."""
        if self._data_tables:
            return

        if not os.path.exists(DATA_DIR):
            return

        for fname in os.listdir(DATA_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                filepath = os.path.join(DATA_DIR, fname)
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                nome = data.get("_meta", {}).get("nome", fname.replace(".json", ""))
                self._data_tables[nome] = data
            except Exception as e:
                self.warnings.append(f"Errore caricamento data table {fname}: {e}")

    def get_data_table(self, nome: str) -> Optional[Dict]:
        """Ottieni una tabella dati per nome."""
        self._load_data_tables()
        return self._data_tables.get(nome)

    # ========================================================================
    # 3. CARICAMENTO REGOLE
    # ========================================================================
    def _load_rules_from_db(self) -> List[Dict[str, Any]]:
        """Carica regole attive dalla tabella regole."""
        try:
            rows = self.db.execute(
                text("""
                    SELECT rule_id, nome, rule_json, priorita, categoria
                    FROM regole
                    WHERE attiva = 1
                    ORDER BY priorita ASC
                """)
            ).fetchall()

            rules = []
            for row in rows:
                rule_id, nome, rule_json_raw, priorita, categoria = (
                    row[0], row[1], row[2], row[3], row[4]
                )
                if isinstance(rule_json_raw, str):
                    rule_json = json.loads(rule_json_raw)
                else:
                    rule_json = rule_json_raw or {}

                rules.append({
                    "id": rule_id,
                    "nome": nome,
                    "source": "db",
                    "priorita": priorita or 100,
                    "categoria": categoria,
                    **rule_json
                })
            return rules
        except Exception as e:
            self.warnings.append(f"Errore caricamento regole da DB: {e}")
            return []

    def _load_rules_from_files(self, rules_dir: str = None) -> List[Dict[str, Any]]:
        """Carica regole da file JSON."""
        rules_dir = rules_dir or RULES_DIR
        rules = []
        if not os.path.exists(rules_dir):
            return rules

        for filename in sorted(os.listdir(rules_dir)):
            if not filename.endswith(".json"):
                continue
            try:
                filepath = os.path.join(rules_dir, filename)
                with open(filepath, "r", encoding="utf-8") as f:
                    rule = json.load(f)
                rule["source"] = "file"
                rule.setdefault("id", filename.replace(".json", ""))
                rule.setdefault("priorita", rule.get("priority", 100))
                rules.append(rule)
            except Exception as e:
                self.errors.append(f"Errore caricamento {filename}: {e}")

        return rules

    def load_all_rules(self) -> List[Dict[str, Any]]:
        """Carica regole da tutte le fonti, deduplica (DB ha priorità), ordina."""
        rules_db = self._load_rules_from_db()
        rules_file = self._load_rules_from_files()

        db_ids = {r["id"] for r in rules_db}
        rules_file_unique = [r for r in rules_file if r["id"] not in db_ids]

        all_rules = rules_db + rules_file_unique
        all_rules.sort(key=lambda r: r.get("priorita", 100))

        return all_rules

    # ========================================================================
    # 4. VALUTAZIONE CONDIZIONI
    # ========================================================================
    def _context_get(self, context: Dict[str, Any], field: str) -> Any:
        """Cerca un campo nel context con fallback flessibile."""
        val = context.get(field)
        if val is not None:
            return val
        val = context.get(field.lower())
        if val is not None:
            return val
        if "." not in field:
            for key, v in context.items():
                if key.endswith(f".{field}") or key.endswith(f".{field.lower()}"):
                    return v
        return None

    def evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """Valuta una singola condizione."""
        if isinstance(condition, str):
            return False

        field = condition.get("field", "")
        operator = condition.get("operator", "equals")
        expected_value = condition.get("value")

        actual_value = self._context_get(context, field)

        if actual_value is None:
            if operator == "is_empty":
                return True
            if operator == "is_not_empty":
                return False
            return False

        if isinstance(actual_value, str) and actual_value.strip() == "":
            if operator == "is_empty":
                return True
            if operator == "is_not_empty":
                return False
            return False

        return self._compare(actual_value, operator, expected_value)

    def _compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Confronta actual vs expected con l'operatore dato."""
        try:
            if operator in ("equals", "=="):
                return str(actual).lower() == str(expected).lower()
            elif operator in ("not_equals", "!="):
                return str(actual).lower() != str(expected).lower()
            elif operator == "contains":
                return str(expected).lower() in str(actual).lower()
            elif operator == "not_contains":
                return str(expected).lower() not in str(actual).lower()
            elif operator == "starts_with":
                return str(actual).lower().startswith(str(expected).lower())
            elif operator in ("greater_than", ">"):
                return float(actual) > float(expected)
            elif operator in ("less_than", "<"):
                return float(actual) < float(expected)
            elif operator in ("greater_equal", ">="):
                return float(actual) >= float(expected)
            elif operator in ("less_equal", "<="):
                return float(actual) <= float(expected)
            elif operator == "in":
                if isinstance(expected, list):
                    return str(actual).lower() in [str(v).lower() for v in expected]
                return False
            elif operator == "not_in":
                if isinstance(expected, list):
                    return str(actual).lower() not in [str(v).lower() for v in expected]
                return True
            elif operator == "is_empty":
                return actual is None or str(actual).strip() == ""
            elif operator == "is_not_empty":
                return actual is not None and str(actual).strip() != ""
            else:
                self.warnings.append(f"Operatore sconosciuto: {operator}")
                return False
        except (ValueError, TypeError):
            return False

    def should_apply_rule(self, rule: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """
        Valuta se una regola deve essere applicata.

        Supporta:
        1. Lista condizioni (AND implicito): "conditions": [...]
        2. Condizione singola: "conditions": {"field": ...}
        3. Logica esplicita: "conditions": {"logic": "OR", "conditions": [...]}
        """
        conditions = rule.get("conditions")

        if not conditions:
            return True

        if isinstance(conditions, list):
            return all(self.evaluate_condition(c, context) for c in conditions)

        if isinstance(conditions, dict) and "field" in conditions:
            return self.evaluate_condition(conditions, context)

        if isinstance(conditions, dict) and "logic" in conditions:
            logic = conditions.get("logic", "AND").upper()
            sub_conditions = conditions.get("conditions", [])
            if not sub_conditions:
                return True
            results = [self.evaluate_condition(c, context) for c in sub_conditions]
            if logic == "AND":
                return all(results)
            elif logic == "OR":
                return any(results)

        self.warnings.append(f"Formato conditions non riconosciuto: {type(conditions)}")
        return False

    # ========================================================================
    # 5. ESECUZIONE AZIONI (SEQUENZIALE)
    # ========================================================================
    def apply_rule_actions(self, rule: Dict[str, Any], preventivo,
                           context: Dict[str, Any]) -> int:
        """
        Esegue le azioni di una regola IN SEQUENZA.
        Ogni azione aggiorna il context → le successive vedono i risultati.
        Include trace debug per ogni azione eseguita.
        """
        materiali_aggiunti = 0
        rule_id = rule.get("id", "unknown")

        # Costruisci lista azioni unificata (actions + materials legacy)
        unified_actions = []
        for action in rule.get("actions", []):
            unified_actions.append(action)
        for mat_data in rule.get("materials", []):
            unified_actions.append({"action": "add_material", "material": mat_data})

        # Esegui in sequenza con trace
        for i, action in enumerate(unified_actions):
            action_type = action.get("action", action.get("type", ""))
            trace_entry = {
                "rule": rule_id,
                "step": i + 1,
                "action": action_type,
            }

            # skip_if
            skip_if = action.get("skip_if", "")
            if skip_if:
                skip_field = skip_if.split(None, 2)[0] if skip_if.strip() else ""
                skip_actual = self._context_get(context, skip_field) if skip_field else None
                trace_entry["skip_if"] = skip_if
                trace_entry["skip_if_field_value"] = skip_actual
                if self._evaluate_skip_if(skip_if, context):
                    trace_entry["result"] = "SKIPPED"
                    self._action_trace.append(trace_entry)
                    continue

            if action_type == "add_material":
                mat_data = action.get("material", {})
                codice_raw = mat_data.get("codice", "")
                codice_resolved = self._replace_placeholders(codice_raw, context)
                trace_entry["codice_raw"] = codice_raw
                trace_entry["codice_resolved"] = codice_resolved
                if self._add_material(preventivo, mat_data, rule_id, context):
                    materiali_aggiunti += 1
                    trace_entry["result"] = "ADDED"
                else:
                    trace_entry["result"] = "DUPLICATE_OR_EMPTY"

            elif action_type == "set_field":
                field = action.get("field", "")
                val_before = context.get(field)
                self._action_set_field(action, context)
                val_after = context.get(field)
                trace_entry["field"] = field
                trace_entry["value_before"] = val_before
                trace_entry["value_after"] = val_after
                trace_entry["result"] = "OK"

            elif action_type == "lookup_table":
                tabella = action.get("tabella", "")
                input_field = action.get("input_field", "")
                partition_field = action.get("partition_field", "")
                input_val = self._context_get(context, input_field)
                part_val = self._context_get(context, partition_field) if partition_field else None
                calc_before = {k: v for k, v in context.items() if k.startswith("_calc.")}
                self._action_lookup_table(action, context)
                calc_after = {k: v for k, v in context.items() if k.startswith("_calc.")}
                new_keys = {k: v for k, v in calc_after.items() if k not in calc_before or calc_before[k] != v}
                trace_entry["tabella"] = tabella
                trace_entry["input_field"] = input_field
                trace_entry["input_value"] = input_val
                trace_entry["partition_field"] = partition_field
                trace_entry["partition_value"] = part_val
                trace_entry["new_calc_vars"] = new_keys
                trace_entry["result"] = "OK" if new_keys else "NO_MATCH"

            elif action_type == "accumulate_from_lookup":
                calc_before = {k: v for k, v in context.items() if k.startswith("_calc.")}
                self._action_accumulate_from_lookup(action, context)
                calc_after = {k: v for k, v in context.items() if k.startswith("_calc.")}
                new_keys = {k: v for k, v in calc_after.items() if k not in calc_before or calc_before[k] != v}
                trace_entry["new_calc_vars"] = new_keys
                trace_entry["result"] = "OK" if new_keys else "NO_DATA"

            elif action_type == "catalog_match":
                calc_before = {k: v for k, v in context.items() if k.startswith("_calc.")}
                self._action_catalog_match(action, context)
                calc_after = {k: v for k, v in context.items() if k.startswith("_calc.")}
                new_keys = {k: v for k, v in calc_after.items() if k not in calc_before or calc_before[k] != v}
                trace_entry["new_calc_vars"] = new_keys
                trace_entry["result"] = "OK" if new_keys else "NO_MATCH"

            else:
                self.warnings.append(f"Action type sconosciuto: {action_type}")
                trace_entry["result"] = "UNKNOWN_TYPE"

            self._action_trace.append(trace_entry)

        return materiali_aggiunti

    def _evaluate_skip_if(self, expr: str, context: Dict[str, Any]) -> bool:
        """
        Valuta un'espressione skip_if. Ritorna True se l'action va saltata.
        
        Formati supportati:
          "campo is_empty"           → salta se campo è vuoto/None
          "campo is_not_empty"       → salta se campo NON è vuoto
          "campo <= 0"               → salta se campo <= 0
          "campo == valore"          → salta se campo == valore
          ecc. (tutti gli operatori di _compare)
        """
        expr = expr.strip()
        if not expr:
            return False

        # Prova formati: "campo operatore valore" o "campo operatore"
        # Operatori senza valore: is_empty, is_not_empty
        parts = expr.split(None, 2)  # max 3 parti
        
        if len(parts) < 2:
            return False

        field = parts[0]
        operator = parts[1]
        value = parts[2] if len(parts) > 2 else None

        actual = self._context_get(context, field)
        
        # Gestione speciale per is_empty / is_not_empty
        if operator == "is_empty":
            return actual is None or str(actual).strip() == ""
        if operator == "is_not_empty":
            return actual is not None and str(actual).strip() != ""
        
        if actual is None:
            return True  # campo non trovato → salta per sicurezza

        return self._compare(actual, operator, value)

    # ========================================================================
    # ACTION: set_field
    # ========================================================================
    def _action_set_field(self, action: Dict[str, Any], context: Dict[str, Any]):
        """
        Imposta una variabile nel context.

        Modalità:
        - Valore diretto:   {"field": "_calc.x", "value": 150}
        - Da altro campo:   {"field": "_calc.x", "value_from": "argano.potenza", "multiply_by": 1.2}
        - Addizione:         {"field": "_calc.x", "add_value": 150}
        """
        field = action.get("field", "")
        if not field:
            return

        if "add_value" in action:
            current = context.get(field, 0) or 0
            try:
                context[field] = float(current) + float(action["add_value"])
            except (ValueError, TypeError):
                self.warnings.append(f"set_field add_value non numerico: {action['add_value']}")
            return

        if "value_from" in action:
            source = self._context_get(context, action["value_from"])
            if source is not None:
                try:
                    val = float(source)
                    if "multiply_by" in action:
                        val *= float(action["multiply_by"])
                    if "add" in action:
                        val += float(action["add"])
                    context[field] = val
                except (ValueError, TypeError):
                    context[field] = source
            return

        value = action.get("value")
        if isinstance(value, str):
            value = self._replace_placeholders(value, context)
            value = self._try_convert_value(value)
        context[field] = value

    # ========================================================================
    # ACTION: lookup_table
    # ========================================================================
    def _action_lookup_table(self, action: Dict[str, Any], context: Dict[str, Any]):
        """
        Cerca un valore in una data table e imposta variabili nel context.

        Supporta lookup_range (numerico) e lookup_mapping (testuale).
        """
        tabella_nome = action.get("tabella", "")
        input_field = action.get("input_field", "")
        partition_field = action.get("partition_field", "")
        output_prefix = action.get("output_prefix", "_calc.")

        table = self.get_data_table(tabella_nome)
        if not table:
            self.warnings.append(f"lookup_table: tabella '{tabella_nome}' non trovata in {DATA_DIR}/")
            return

        input_value = self._context_get(context, input_field)
        if input_value is None:
            self.warnings.append(f"lookup_table: campo input '{input_field}' non trovato nel context")
            return

        tipo = table.get("tipo", "")

        if tipo == "lookup_range":
            self._lookup_range(table, input_value, partition_field, output_prefix, context)
        elif tipo in ("lookup_mapping", "constants"):
            self._lookup_mapping(table, input_value, output_prefix, context)
        else:
            self.warnings.append(f"lookup_table: tipo tabella '{tipo}' non supportato")

    def _lookup_range(self, table: Dict, input_value: Any, partition_field: str,
                      output_prefix: str, context: Dict[str, Any]):
        """Esegue lookup range (con partizioni opzionali)."""
        try:
            val = float(input_value)
        except (ValueError, TypeError):
            self.warnings.append(f"lookup_range: valore input '{input_value}' non numerico")
            return

        if "partizioni" in table and table.get("partizionato_per"):
            part_key = self._context_get(context, partition_field) if partition_field else None
            if part_key is None and table.get("partizionato_per"):
                part_key = self._context_get(context, table["partizionato_per"])

            if part_key is None:
                self.warnings.append(f"lookup_range: campo partizione non trovato")
                return

            part_key_str = str(part_key).strip()
            ranges = table["partizioni"].get(part_key_str)

            if ranges is None:
                for k, v in table["partizioni"].items():
                    if k.lower().replace(" ", "_") == part_key_str.lower().replace(" ", "_"):
                        ranges = v
                        break

            if ranges is None:
                self.warnings.append(
                    f"lookup_range: partizione '{part_key_str}' non trovata. "
                    f"Disponibili: {list(table['partizioni'].keys())}"
                )
                return
        elif "ranges" in table:
            ranges = table["ranges"]
        else:
            self.warnings.append("lookup_range: né 'ranges' né 'partizioni' nella tabella")
            return

        for r in ranges:
            da = r.get("da", 0) or 0
            a = r.get("a")
            if val >= float(da) and (a is None or val < float(a)):
                for k, v in r.get("output", {}).items():
                    context[f"{output_prefix}{k}"] = v
                return

        self.warnings.append(f"lookup_range: nessun range trovato per valore {val}")

    def _lookup_mapping(self, table: Dict, input_value: Any, output_prefix: str,
                        context: Dict[str, Any]):
        """Esegue lookup mapping (chiave→valori)."""
        valori = table.get("valori", {})
        key = str(input_value).strip().lower().replace(" ", "_")

        match = valori.get(key)
        if match is None:
            for k, v in valori.items():
                if k.lower() == key:
                    match = v
                    break

        if match is None:
            self.warnings.append(f"lookup_mapping: chiave '{key}' non trovata")
            return

        if isinstance(match, dict):
            for k, v in match.items():
                context[f"{output_prefix}{k}"] = v
        else:
            context[f"{output_prefix}value"] = match

    # ========================================================================
    # ACTION: accumulate_from_lookup
    # ========================================================================
    def _action_accumulate_from_lookup(self, action: Dict[str, Any], context: Dict[str, Any]):
        """
        Per ogni campo attivo nel context, cerca nel lookup i suoi attributi
        e accumula (somma) un valore raggruppando per un campo.
        """
        tabella_nome = action.get("tabella", "")
        campi = action.get("campi_da_verificare", [])
        campo_qta = action.get("campo_quantita")
        accumula_campo = action.get("accumula_campo", "")
        raggruppa_per = action.get("raggruppa_per", "")
        output_prefix = action.get("output_prefix", "_calc.acc_")
        output_suffix = action.get("output_suffix", "")
        output_totale = action.get("output_totale", "")

        table = self.get_data_table(tabella_nome)
        if not table:
            self.warnings.append(f"accumulate: tabella '{tabella_nome}' non trovata")
            return

        valori = table.get("valori", {})
        accumulatore: Dict[str, float] = {}
        totale = 0.0

        for campo_nome in campi:
            val = self._context_get(context, campo_nome)
            if not val:
                continue
            if isinstance(val, str) and val.lower() in ("false", "no", "0", ""):
                continue
            if isinstance(val, bool) and not val:
                continue

            key = campo_nome.strip().lower().replace(" ", "_")
            entry = valori.get(key)
            if entry is None:
                self.warnings.append(f"accumulate: '{campo_nome}' non trovato nel lookup '{tabella_nome}'")
                continue

            valore_da_accumulare = entry.get(accumula_campo, 0) or 0
            gruppo = str(entry.get(raggruppa_per, "altro"))

            qta = 1
            if campo_qta:
                qta_val = self._context_get(context, f"{campo_nome}_{campo_qta}")
                if qta_val is None:
                    qta_val = self._context_get(context, campo_qta)
                if qta_val is not None:
                    try:
                        qta = float(qta_val)
                    except (ValueError, TypeError):
                        pass

            contributo = float(valore_da_accumulare) * qta
            accumulatore[gruppo] = accumulatore.get(gruppo, 0) + contributo
            totale += contributo

        for gruppo, somma in accumulatore.items():
            context[f"{output_prefix}{gruppo}{output_suffix}"] = somma

        if output_totale:
            context[output_totale] = totale

        logger.debug(f"accumulate: {len(accumulatore)} gruppi, totale={totale}")

    # ========================================================================
    # ACTION: catalog_match
    # ========================================================================
    def _action_catalog_match(self, action: Dict[str, Any], context: Dict[str, Any]):
        """
        Cerca nel catalogo il record che soddisfa criteri multipli.
        """
        tabella_nome = action.get("tabella", "")
        table = self.get_data_table(tabella_nome)
        if not table:
            self.warnings.append(f"catalog_match: tabella '{tabella_nome}' non trovata")
            return

        if table.get("tipo") != "catalog":
            self.warnings.append(f"catalog_match: tabella '{tabella_nome}' non è tipo 'catalog'")
            return

        records = table.get("records", [])
        if not records:
            return

        # 1. Costruisci criteri dinamici dal context
        criteri = []
        cd = action.get("criteri_dinamici")
        if cd:
            pattern = cd.get("pattern", "")
            prefix = cd.get("sorgente_prefix", "_calc.")
            suffix = cd.get("sorgente_suffix", "")
            operatore = cd.get("operatore", ">=")
            soglia = cd.get("solo_se_maggiore_di", 0)

            for ctx_key, ctx_val in context.items():
                if ctx_key.startswith(prefix) and (not suffix or ctx_key.endswith(suffix)):
                    try:
                        val_num = float(ctx_val)
                    except (ValueError, TypeError):
                        continue

                    if soglia is not None and val_num <= float(soglia):
                        continue

                    key_part = ctx_key[len(prefix):]
                    if suffix and key_part.endswith(suffix):
                        key_part = key_part[:-len(suffix)]

                    col_name = pattern.replace("{key}", key_part)
                    criteri.append({
                        "colonna": col_name,
                        "operatore": operatore,
                        "valore": val_num
                    })

        # 2. Criteri fissi
        for cf in action.get("criteri_fissi", []):
            valore = cf.get("valore")
            if isinstance(valore, str):
                valore = self._replace_placeholders(valore, context)
                valore = self._try_convert_value(valore)
            criteri.append({
                "colonna": cf["colonna"],
                "operatore": cf.get("operatore", ">="),
                "valore": valore
            })

        # 3. Filtri
        for filt in action.get("filtri", []):
            valore = filt.get("valore")
            if isinstance(valore, str):
                valore = self._replace_placeholders(valore, context)
            criteri.append({
                "colonna": filt["colonna"],
                "operatore": filt.get("operatore", "=="),
                "valore": valore
            })

        # 4. Filtra records
        candidati = []
        for record in records:
            match = True
            for criterio in criteri:
                col = criterio["colonna"]
                op = criterio["operatore"]
                val_atteso = criterio["valore"]

                val_record = record.get(col)
                if val_record is None:
                    match = False
                    break

                if not self._compare(val_record, op, val_atteso):
                    match = False
                    break

            if match:
                candidati.append(record)

        if not candidati:
            self.warnings.append(
                f"catalog_match: nessun record trovato in '{tabella_nome}' "
                f"con {len(criteri)} criteri"
            )
            return

        # 5. Ordina e prendi il primo
        ordinamento = action.get("ordinamento", {})
        if ordinamento:
            col_ord = ordinamento.get("colonna", "")
            asc = ordinamento.get("direzione", "ASC").upper() == "ASC"
            try:
                candidati.sort(
                    key=lambda r: float(r.get(col_ord, 0) or 0),
                    reverse=not asc
                )
            except (ValueError, TypeError):
                pass

        best = candidati[0]

        # 6. Scrivi output nel context
        for ctx_field, catalog_col in action.get("output", {}).items():
            context[ctx_field] = best.get(catalog_col)

        logger.debug(
            f"catalog_match: trovato '{best.get('codice', '?')}' "
            f"tra {len(candidati)}/{len(records)}"
        )

    # ========================================================================
    # 6. PLACEHOLDER E PARAMETRI
    # ========================================================================
    def _replace_placeholders(self, text_val: str, context: Dict[str, Any]) -> str:
        """Sostituisce placeholder: {{campo}}, {CAMPO}, [CAMPO]"""
        if not text_val:
            return text_val

        pattern = r'\{\{([\w.]+)\}\}|\{(\w+)\}|\[(\w+)\]'

        def replacer(match):
            field_name = match.group(1) or match.group(2) or match.group(3)
            value = self._context_get(context, field_name)
            if value is not None:
                return str(value)
            return match.group(0)

        return re.sub(pattern, replacer, text_val)

    def _extract_parameters(self, codice: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Estrae parametri da codice parametrico es. TRAVERSO-[LUNG]."""
        parametri = {}
        matches = re.findall(r'\[(\w+)\]', codice)
        for param_name in matches:
            value = self._context_get(context, param_name)
            if value is not None:
                parametri[param_name.upper()] = value
        return parametri

    # ========================================================================
    # 7. ADD MATERIAL
    # ========================================================================
    def _add_material(self, preventivo, material_data: Dict[str, Any],
                      rule_id: str, context: Dict[str, Any]) -> bool:
        """Aggiunge materiale al preventivo con supporto placeholder e parametri."""
        from models import Materiale

        try:
            codice = self._replace_placeholders(material_data.get("codice", ""), context)
            descrizione = self._replace_placeholders(
                material_data.get("descrizione", ""), context
            )

            # Verifica duplicato
            existing = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id,
                Materiale.codice == codice,
                Materiale.regola_id == rule_id
            ).first()

            if existing:
                return False

            quantita = material_data.get("quantita", 1.0)
            if isinstance(quantita, str):
                quantita = self._replace_placeholders(quantita, context)
                try:
                    quantita = float(quantita)
                except (ValueError, TypeError):
                    quantita = 1.0

            prezzo_unitario = material_data.get("prezzo_unitario", 0.0)
            if isinstance(prezzo_unitario, str):
                prezzo_unitario = self._replace_placeholders(prezzo_unitario, context)
                try:
                    prezzo_unitario = float(prezzo_unitario)
                except (ValueError, TypeError):
                    prezzo_unitario = 0.0

            parametri = self._extract_parameters(codice, context)

            materiale = Materiale(
                preventivo_id=preventivo.id,
                codice=codice,
                descrizione=descrizione,
                categoria=material_data.get("categoria", "Materiale Automatico"),
                quantita=quantita,
                unita_misura=material_data.get("unita_misura",
                             material_data.get("unita", "pz")),
                prezzo_unitario=prezzo_unitario,
                prezzo_totale=quantita * prezzo_unitario,
                aggiunto_da_regola=True,
                regola_id=rule_id,
                lato=material_data.get("lato"),
                note=material_data.get("note"),
                ordine=material_data.get("ordine", 0),
            )

            if parametri:
                for i, (nome, valore) in enumerate(parametri.items(), 1):
                    if i <= 5:
                        setattr(materiale, f"parametro{i}_nome", nome)
                        setattr(materiale, f"parametro{i}_valore", str(valore))

            self.db.add(materiale)
            return True

        except Exception as e:
            self.errors.append(
                f"Errore aggiunta materiale {material_data.get('codice')}: {e}"
            )
            return False

    # ========================================================================
    # 8. ORCHESTRAZIONE PRINCIPALE
    # ========================================================================
    def evaluate_rules(self, preventivo) -> Dict[str, Any]:
        """
        Entry point principale. Valuta tutte le regole per un preventivo.

        Per ogni regola:
        1. Valuta conditions sul context corrente
        2. Se attiva, esegue tutte le actions in sequenza
        3. Ogni action aggiorna il context → le successive lo vedono

        Le regole sono ordinate per priorità. Regole con priorità bassa
        (es: 10) vengono eseguite prima → i loro _calc.* sono disponibili
        per regole con priorità più alta (es: 50).

        Regole vecchie (solo conditions + materials) funzionano identiche.
        """
        from models import Materiale

        self.warnings = []
        self.errors = []
        self._data_tables = {}
        self._action_trace = []

        # 1. Costruisci context
        context = self.build_config_context(preventivo)

        # 2. Carica data tables
        self._load_data_tables()

        # 3. Carica regole ordinate per priorità
        all_rules = self.load_all_rules()
        if not all_rules:
            self.warnings.append("Nessuna regola trovata")
            return self._build_result(set(), 0, 0, preventivo, context)

        # 4. Esegui ogni regola in ordine di priorità
        active_rules: Set[str] = set()
        added_count = 0

        for rule in all_rules:
            rule_id = rule.get("id", "unknown")
            enabled = rule.get("enabled", True)

            if not enabled:
                continue

            try:
                # Valuta conditions sul context CORRENTE (include _calc.* da regole precedenti)
                if self.should_apply_rule(rule, context):
                    active_rules.add(rule_id)
                    added = self.apply_rule_actions(rule, preventivo, context)
                    added_count += added
            except Exception as e:
                self.errors.append(f"Errore regola {rule_id}: {e}")

        # 5. Rimuovi materiali orfani (regole non più attive)
        existing_auto_materials = self.db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo.id,
            Materiale.aggiunto_da_regola == True
        ).all()

        removed_count = 0
        for mat in existing_auto_materials:
            if mat.regola_id not in active_rules:
                self.db.delete(mat)
                removed_count += 1

        # 6. Commit e aggiorna totale
        try:
            self.db.commit()
        except Exception as e:
            self.errors.append(f"Errore commit: {e}")
            self.db.rollback()
            return self._build_result(active_rules, 0, 0, preventivo, context)

        self._update_totale(preventivo)

        return self._build_result(active_rules, added_count, removed_count, preventivo, context)

    def _update_totale(self, preventivo):
        """Ricalcola il totale del preventivo."""
        from models import Materiale
        try:
            all_materials = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id
            ).all()
            totale = sum(m.prezzo_totale or 0 for m in all_materials)
            if hasattr(preventivo, "total_price"):
                preventivo.total_price = totale
            if hasattr(preventivo, "totale_materiali"):
                preventivo.totale_materiali = totale
            self.db.commit()
        except Exception as e:
            self.errors.append(f"Errore aggiornamento totale: {e}")

    def _build_result(self, active_rules: Set[str], added: int, removed: int,
                      preventivo, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Costruisce il dizionario risultato."""
        from models import Materiale

        total_materials = self.db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo.id
        ).count()

        total_price = 0.0
        if hasattr(preventivo, "total_price"):
            total_price = preventivo.total_price or 0.0
        elif hasattr(preventivo, "totale_materiali"):
            total_price = preventivo.totale_materiali or 0.0

        result = {
            "active_rules": sorted(active_rules),
            "materials_added": added,
            "materials_removed": removed,
            "total_materials": total_materials,
            "total_price": total_price,
            "warnings": self.warnings,
            "errors": self.errors,
            "action_trace": getattr(self, '_action_trace', []),
        }

        if context:
            calc_vars = {k: v for k, v in context.items() if k.startswith("_calc.")}
            if calc_vars:
                result["calc_variables"] = calc_vars

        return result

    # ========================================================================
    # UTILITY: debug
    # ========================================================================
    def get_context_debug(self, preventivo) -> Dict[str, Any]:
        """Restituisce il context completo + data tables per debug."""
        self._data_tables = {}
        self._load_data_tables()
        context = self.build_config_context(preventivo)
        return {
            "preventivo_id": preventivo.id,
            "total_keys": len(context),
            "context": context,
            "sezioni_dedicate_trovate": [
                sez for sez, rel in SEZIONI_DEDICATE.items()
                if getattr(preventivo, rel, None) is not None
            ],
            "data_tables": list(self._data_tables.keys()),
        }
