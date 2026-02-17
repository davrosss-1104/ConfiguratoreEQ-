"""
rule_engine.py - Rule Engine unificato (v3 - Two-Phase + Lookup Table)
Combina il meglio di:
  - evaluate_rules() da main.py (rimozione orfani smart, trigger automatico, aggiornamento totali)
  - RuleEngine class da rule_engine.py (AND/OR, placeholder, parametri BOM, operatori estesi)

Funzionalita':
  - build_config_context() legge da TUTTE le fonti (ORM dedicati + valori_configurazione dinamici)
  - Supporto regole da DB (tabella regole) E da file JSON (directory rules/)
  - Chiavi con prefisso sezione (normative.en_81_20) + chiavi piatte per compatibilita' (en_81_20)
  - Two-phase evaluation: phase 1 (calcolo variabili), phase 2 (selezione materiali)
  - Action types: set_field, lookup_table, add_material
  - Variabili volatili _calc.* (solo in-memory per la valutazione corrente)
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
# CONFIGURAZIONE SEZIONI DEDICATE
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


class RuleEngine:
    """
    Motore valutazione regole business unificato.
    
    Flusso:
    1. build_config_context() -> raccoglie tutti i dati configurazione
    2. Carica regole attive (DB + file JSON)
    3. PASS 1: valuta regole phase=1 -> esegue set_field/lookup_table -> arricchisce context
    4. PASS 2: valuta TUTTE le regole -> determina active_rules -> aggiunge/rimuove materiali
    5. Aggiorna totale preventivo
    """

    def __init__(self, db: Session):
        self.db = db
        self.warnings: List[str] = []
        self.errors: List[str] = []

    # ========================================================================
    # 1. CONTEXT BUILDING
    # ========================================================================
    def build_config_context(self, preventivo) -> Dict[str, Any]:
        """
        Costruisce il context completo per la valutazione regole.
        
        Legge da:
        - Tabelle ORM dedicate (dati_principali, normative, argano, ...)
        - Tabella valori_configurazione (sezioni dinamiche)
        - Metadati preventivo
        
        Produce chiavi con DUE formati per ogni valore:
        - Con prefisso: "normative.en_81_20" -> "2020"
        - Senza prefisso: "en_81_20" -> "2020"  (per compatibilita' regole esistenti)
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

        # --- JSON legacy (preventivo.configurazione) come fallback ---
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

    def _try_convert_value(self, valore: str) -> Any:
        """Tenta conversione stringa -> numero se possibile."""
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
    # 2. CARICAMENTO REGOLE
    # ========================================================================
    def _load_rules_from_db(self) -> List[Dict[str, Any]]:
        """Carica regole attive dalla tabella regole, ordinate per priorita'."""
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

    def _load_rules_from_files(self, rules_dir: str = "./rules") -> List[Dict[str, Any]]:
        """Carica regole da file JSON nella directory rules/."""
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
        """
        Carica regole da TUTTE le fonti (DB + file), 
        deduplica per rule_id (DB ha priorita'), ordina per priorita'.
        """
        rules_db = self._load_rules_from_db()
        rules_file = self._load_rules_from_files()
        
        db_ids = {r["id"] for r in rules_db}
        rules_file_unique = [r for r in rules_file if r["id"] not in db_ids]
        
        all_rules = rules_db + rules_file_unique
        all_rules.sort(key=lambda r: r.get("priorita", 100))
        
        return all_rules

    # ========================================================================
    # 3. VALUTAZIONE CONDIZIONI
    # ========================================================================
    def evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """Valuta una singola condizione."""
        if isinstance(condition, str):
            return False

        field = condition.get("field", "")
        operator = condition.get("operator", "equals")
        expected_value = condition.get("value")

        actual_value = context.get(field)
        if actual_value is None:
            actual_value = context.get(field.lower())
        
        if actual_value is None and "." not in field:
            for key, val in context.items():
                if key.endswith(f".{field}") or key.endswith(f".{field.lower()}"):
                    actual_value = val
                    break

        if actual_value is None:
            return False

        if isinstance(actual_value, str) and actual_value.strip() == "":
            return False

        return self._compare(actual_value, operator, expected_value)

    def _compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Confronta actual vs expected con l'operatore dato."""
        try:
            if operator == "equals":
                return str(actual).lower() == str(expected).lower()
            elif operator == "not_equals":
                return str(actual).lower() != str(expected).lower()
            elif operator == "contains":
                return str(expected).lower() in str(actual).lower()
            elif operator == "not_contains":
                return str(expected).lower() not in str(actual).lower()
            elif operator == "starts_with":
                return str(actual).lower().startswith(str(expected).lower())
            elif operator == "greater_than":
                return float(actual) > float(expected)
            elif operator == "less_than":
                return float(actual) < float(expected)
            elif operator == "greater_equal":
                return float(actual) >= float(expected)
            elif operator == "less_equal":
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
        Supporta: lista (AND implicito), condizione singola, logica esplicita AND/OR.
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
            else:
                self.warnings.append(f"Logic operator sconosciuto: {logic}")
                return False

        self.warnings.append(f"Formato conditions non riconosciuto: {type(conditions)}")
        return False

    # ========================================================================
    # 4. ESECUZIONE AZIONI
    # ========================================================================
    def apply_rule_actions(self, rule: Dict[str, Any], preventivo, context: Dict[str, Any]) -> int:
        """
        Esegue le azioni di una regola. Supporta due formati:
        - materials array diretto (file JSON)
        - actions array con tipo (DB)
        """
        materiali_aggiunti = 0
        rule_id = rule.get("id", "unknown")

        # Formato 1: materials array diretto (file JSON)
        materials = rule.get("materials", [])
        for mat_data in materials:
            if self._add_material(preventivo, mat_data, rule_id, context):
                materiali_aggiunti += 1

        # Formato 2: actions array (DB)
        actions = rule.get("actions", [])
        for action in actions:
            action_type = action.get("action")
            if action_type == "add_material":
                mat_data = action.get("material", {})
                if self._add_material(preventivo, mat_data, rule_id, context):
                    materiali_aggiunti += 1
            elif action_type == "set_field":
                self._set_field(preventivo, action, context)
            elif action_type == "lookup_table":
                self._lookup_table(preventivo, action, context)
            else:
                self.warnings.append(f"Action type sconosciuto: {action_type}")

        return materiali_aggiunti

    def _add_material(self, preventivo, material_data: Dict[str, Any], 
                      rule_id: str, context: Dict[str, Any]) -> bool:
        """Aggiunge materiale al preventivo con supporto placeholder e parametri."""
        from models import Materiale
        
        try:
            codice = self._replace_placeholders(material_data.get("codice", ""), context)
            descrizione = self._replace_placeholders(
                material_data.get("descrizione", ""), context
            )

            existing = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id,
                Materiale.codice == codice,
                Materiale.regola_id == rule_id
            ).first()

            if existing:
                return False

            quantita = material_data.get("quantita", 1.0)
            prezzo_unitario = material_data.get("prezzo_unitario", 0.0)
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

    def _set_field(self, preventivo, action: Dict[str, Any], context: Dict[str, Any]):
        """
        Imposta un campo nel context in-place.
        
        - Campi con prefisso _calc. -> volatili (solo in-memory)
        - Campi senza _calc.       -> persistiti in valori_configurazione
        """
        field = action.get("field", "")
        value = action.get("value", "")
        
        if not field:
            return
        
        # Risolvi placeholder nel valore
        if isinstance(value, str) and "{{" in value:
            value = self._replace_placeholders(value, context)
        
        # Scrivi nel context (con e senza prefisso per compatibilita')
        context[field] = value
        if "." in field:
            short_key = field.split(".", 1)[1]
            context[short_key] = value
        
        logger.debug(f"set_field: {field} = {value}")
        
        # Persisti se non e' variabile volatile _calc.*
        if not field.startswith("_calc."):
            try:
                if "." in field:
                    sezione, nome = field.split(".", 1)
                else:
                    sezione, nome = "calcolati", field
                
                existing = self.db.execute(text("""
                    SELECT id FROM valori_configurazione 
                    WHERE preventivo_id = :pid AND codice_campo = :campo
                """), {"pid": preventivo.id, "campo": field}).fetchone()
                
                if existing:
                    self.db.execute(text("""
                        UPDATE valori_configurazione SET valore = :val 
                        WHERE preventivo_id = :pid AND codice_campo = :campo
                    """), {"val": str(value), "pid": preventivo.id, "campo": field})
                else:
                    self.db.execute(text("""
                        INSERT INTO valori_configurazione (preventivo_id, sezione, codice_campo, valore)
                        VALUES (:pid, :sez, :campo, :val)
                    """), {"pid": preventivo.id, "sez": sezione, "campo": field, "val": str(value)})
                    
            except Exception as e:
                self.warnings.append(f"set_field persist error ({field}): {e}")

    def _lookup_table(self, preventivo, action: dict, context: dict):
        """
        Cerca un valore in una tabella inline e imposta le variabili trovate.
        
        Formato action:
        {
            "action": "lookup_table",
            "lookup_field": "argano.potenza_motore_kw",
            "partition_field": "tensioni.frequenza_rete",  (opzionale)
            "rows": {
                "50": [{"min": 0, "max": 5.15, "set": {"_calc.cont_dir": "D18"}}, ...],
                "60": [...]
            }
            // OPPURE senza partizione:
            "rows": [{"min": 0, "max": 5.15, "set": {"_calc.qualcosa": "valore"}}, ...]
        }
        
        Logica: trova la riga dove min <= lookup_value < max, poi esegue set_field
        per ogni coppia in "set".
        """
        lookup_field = action.get("lookup_field", "")
        partition_field = action.get("partition_field", "")
        rows_data = action.get("rows", {})
        
        lookup_raw = self._get_context_value(context, lookup_field)
        if lookup_raw is None:
            logger.debug(f"lookup_table: campo {lookup_field} non trovato nel context")
            return
        
        try:
            lookup_value = float(lookup_raw)
        except (ValueError, TypeError):
            self.warnings.append(
                f"lookup_table: {lookup_field}='{lookup_raw}' non e' numerico"
            )
            return
        
        # Seleziona la tabella (con o senza partizione)
        if partition_field and isinstance(rows_data, dict):
            partition_raw = self._get_context_value(context, partition_field)
            if partition_raw is None:
                logger.debug(f"lookup_table: partition {partition_field} non trovata")
                return
            
            # Normalizza chiave partizione (50.0 -> "50", "50" -> "50")
            partition_key = str(partition_raw).strip()
            try:
                pf = float(partition_key)
                if pf == int(pf):
                    partition_key = str(int(pf))
            except (ValueError, TypeError):
                pass
            
            rows = rows_data.get(partition_key, [])
            if not rows:
                self.warnings.append(
                    f"lookup_table: nessuna partizione per {partition_field}='{partition_key}'"
                )
                return
        elif isinstance(rows_data, list):
            rows = rows_data
        else:
            self.warnings.append("lookup_table: formato rows non riconosciuto")
            return
        
        # Cerca la riga corrispondente (min <= value < max)
        matched_row = None
        for row in rows:
            row_min = float(row.get("min", 0))
            row_max = float(row.get("max", 999999))
            if row_min <= lookup_value < row_max:
                matched_row = row
                break
        
        if matched_row is None:
            logger.debug(
                f"lookup_table: nessuna riga per {lookup_field}={lookup_value}"
            )
            return
        
        # Imposta tutte le variabili dalla riga trovata
        vars_to_set = matched_row.get("set", {})
        for var_field, var_value in vars_to_set.items():
            self._set_field(preventivo, {
                "field": var_field, 
                "value": var_value
            }, context)
        
        logger.info(
            f"lookup_table: {lookup_field}={lookup_value} -> "
            f"matched row [{matched_row.get('min')}, {matched_row.get('max')}), "
            f"set {len(vars_to_set)} variables"
        )

    def _get_context_value(self, context: dict, field: str):
        """Helper: cerca un campo nel context con fallback."""
        val = context.get(field)
        if val is not None:
            return val
        val = context.get(field.lower())
        if val is not None:
            return val
        if "." in field:
            short = field.split(".", 1)[1]
            val = context.get(short)
            if val is not None:
                return val
            val = context.get(short.lower())
        return val

    # ========================================================================
    # 5. PLACEHOLDER E PARAMETRI
    # ========================================================================
    def _replace_placeholders(self, text_val: str, context: Dict[str, Any]) -> str:
        """
        Sostituisce placeholder nel testo con valori dal context.
        Supporta: {FIELD}, [FIELD], {{sezione.campo}}
        """
        if not text_val:
            return text_val

        pattern = r'\{\{([\w.]+)\}\}|\{(\w+)\}|\[(\w+)\]'

        def replacer(match):
            field_name = match.group(1) or match.group(2) or match.group(3)
            field_lower = field_name.lower()
            
            value = context.get(field_lower)
            if value is None:
                value = context.get(field_name)
            if value is None and "." not in field_lower:
                for key, val in context.items():
                    if key.endswith(f".{field_lower}"):
                        value = val
                        break
            
            if value is not None:
                return str(value)
            return match.group(0)

        return re.sub(pattern, replacer, text_val)

    def _extract_parameters(self, codice: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Estrae parametri da codice parametrico es. TRAVERSO-[LUNG]."""
        parametri = {}
        pattern = r'\[(\w+)\]'
        matches = re.findall(pattern, codice)

        for param_name in matches:
            param_lower = param_name.lower()
            value = context.get(param_lower)
            if value is None:
                for key, val in context.items():
                    if key.endswith(f".{param_lower}"):
                        value = val
                        break
            if value is not None:
                parametri[param_name.upper()] = value

        return parametri

    # ========================================================================
    # 6. ORCHESTRAZIONE PRINCIPALE - TWO-PASS EVALUATION
    # ========================================================================
    def evaluate_rules(self, preventivo) -> Dict[str, Any]:
        """
        Entry point principale - TWO-PASS evaluation.
        
        PASS 1 (phase=1, calcolo):
          - Pulisce variabili _calc.* dal context
          - Valuta regole con phase=1 (ordinate per priority)
          - Esegue solo le actions (set_field, lookup_table) -> arricchisce context
          - NON aggiunge materiali
        
        PASS 2 (phase=2 o assente, materiali):
          - Valuta TUTTE le regole enabled con il context arricchito
          - Determina active_rules
          - Rimuove materiali orfani, aggiunge nuovi
          - Aggiorna totale
        """
        from models import Materiale
        
        self.warnings = []
        self.errors = []

        # 1. Costruisci context
        context = self.build_config_context(preventivo)
        
        # 2. Carica regole
        all_rules = self.load_all_rules()
        if not all_rules:
            self.warnings.append("Nessuna regola trovata")
            return self._build_result(set(), 0, 0, preventivo)

        # Separa regole per fase
        phase1_rules = []
        phase2_rules = []
        for rule in all_rules:
            if not rule.get("enabled", True):
                continue
            if rule.get("phase") == 1:
                phase1_rules.append(rule)
            else:
                phase2_rules.append(rule)
        
        # Ordina per priority (piu' basso = prima)
        phase1_rules.sort(key=lambda r: r.get("priority", r.get("priorita", 50)))
        phase2_rules.sort(key=lambda r: r.get("priority", r.get("priorita", 50)))

        # -- PASS 1: CALCOLO VARIABILI --
        calc_keys = [k for k in context if k.startswith("_calc.")]
        for k in calc_keys:
            del context[k]
        
        for rule in phase1_rules:
            rule_id = rule.get("id", "unknown")
            try:
                if self.should_apply_rule(rule, context):
                    for action in rule.get("actions", []):
                        action_type = action.get("action")
                        if action_type == "set_field":
                            self._set_field(preventivo, action, context)
                        elif action_type == "lookup_table":
                            self._lookup_table(preventivo, action, context)
                        else:
                            logger.debug(f"Phase 1 skip action type: {action_type}")
            except Exception as e:
                self.errors.append(f"Errore phase 1 regola {rule_id}: {e}")
        
        computed = {k: v for k, v in context.items() if k.startswith("_calc.")}
        if computed:
            logger.info(f"Phase 1 computed {len(computed)} variables: "
                        f"{list(computed.keys())[:10]}...")

        # -- PASS 2: SELEZIONE MATERIALI --
        active_rules: Set[str] = set()
        rules_to_apply: List[Dict[str, Any]] = []

        for rule in (phase1_rules + phase2_rules):
            rule_id = rule.get("id", "unknown")
            try:
                if self.should_apply_rule(rule, context):
                    active_rules.add(rule_id)
                    if rule.get("phase") != 1:
                        rules_to_apply.append(rule)
            except Exception as e:
                self.errors.append(f"Errore valutazione regola {rule_id}: {e}")

        # Rimuovi materiali orfani
        existing_auto_materials = self.db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo.id,
            Materiale.aggiunto_da_regola == True
        ).all()

        removed_count = 0
        for mat in existing_auto_materials:
            if mat.regola_id not in active_rules:
                self.db.delete(mat)
                removed_count += 1

        # Aggiungi materiali nuovi (solo da phase 2)
        added_count = 0
        for rule in rules_to_apply:
            try:
                added = self.apply_rule_actions(rule, preventivo, context)
                added_count += added
            except Exception as e:
                self.errors.append(
                    f"Errore applicazione regola {rule.get('id')}: {e}"
                )

        # Commit e aggiorna totale
        try:
            self.db.commit()
        except Exception as e:
            self.errors.append(f"Errore commit: {e}")
            self.db.rollback()
            return self._build_result(active_rules, 0, 0, preventivo)

        self._update_totale(preventivo)

        result = self._build_result(active_rules, added_count, removed_count, preventivo)
        result["computed_variables"] = computed
        return result

    def _update_totale(self, preventivo):
        """Ricalcola il totale del preventivo sommando tutti i materiali."""
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
                      preventivo) -> Dict[str, Any]:
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

        return {
            "active_rules": sorted(active_rules),
            "materials_added": added,
            "materials_removed": removed,
            "total_materials": total_materials,
            "total_price": total_price,
            "warnings": self.warnings,
            "errors": self.errors,
        }

    # ========================================================================
    # UTILITY: debug context
    # ========================================================================
    def get_context_debug(self, preventivo) -> Dict[str, Any]:
        """
        Restituisce il context completo per debug/diagnostica.
        Simula anche il pass 1 per mostrare le variabili calcolate.
        """
        context = self.build_config_context(preventivo)
        
        # Simula phase 1 per mostrare variabili calcolate
        all_rules = self.load_all_rules()
        phase1_rules = sorted(
            [r for r in all_rules if r.get("enabled", True) and r.get("phase") == 1],
            key=lambda r: r.get("priority", r.get("priorita", 50))
        )
        
        for rule in phase1_rules:
            try:
                if self.should_apply_rule(rule, context):
                    for action in rule.get("actions", []):
                        action_type = action.get("action")
                        if action_type == "set_field":
                            # Simula set_field solo in-memory (senza persistere)
                            field = action.get("field", "")
                            value = action.get("value", "")
                            if isinstance(value, str) and "{{" in value:
                                value = self._replace_placeholders(value, context)
                            context[field] = value
                            if "." in field:
                                context[field.split(".", 1)[1]] = value
                        elif action_type == "lookup_table":
                            self._lookup_table(preventivo, action, context)
            except Exception:
                pass
        
        computed = {k: v for k, v in context.items() if k.startswith("_calc.")}
        
        return {
            "preventivo_id": preventivo.id,
            "total_keys": len(context),
            "context": context,
            "computed_variables": computed,
            "sezioni_dedicate_trovate": [
                sez for sez, rel in SEZIONI_DEDICATE.items()
                if getattr(preventivo, rel, None) is not None
            ],
        }
