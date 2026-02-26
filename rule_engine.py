"""
rule_engine.py - Rule Engine unificato
Combina il meglio di:
  - evaluate_rules() da main.py (rimozione orfani smart, trigger automatico, aggiornamento totali)
  - RuleEngine class da rule_engine.py (AND/OR, placeholder, parametri BOM, operatori estesi)

Nuove funzionalità:
  - build_config_context() legge da TUTTE le fonti (ORM dedicati + valori_configurazione dinamici)
  - Supporto regole da DB (tabella regole) E da file JSON (directory rules/)
  - Pipeline Builder: azioni collect_sum, math_expr, catalog_select (phase 1.5)
"""
from typing import List, Dict, Any, Tuple, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import inspect as sa_inspect, text
import re
import os
import json
import logging
import math
import fnmatch

logger = logging.getLogger(__name__)


# ============================================================================
# CONFIGURAZIONE SEZIONI DEDICATE
# ============================================================================
# Mappa: nome_sezione -> (nome_relationship su Preventivo, nome_classe_model)
# Se il tuo Preventivo ha relationship "dati_principali" -> model DatiPrincipali,
# aggiungile qui. Il context builder leggerà automaticamente tutti i campi.

SEZIONI_DEDICATE = {
    "dati_principali": "dati_principali",
    "normative": "normative",
    "argano": "argano",
    "disposizione_vano": "disposizione_vano",
    "porte": "porte",
    "dati_commessa": "dati_commessa",
}

# Campi da escludere dal context (tecnici/interni)
CAMPI_ESCLUSI = {"id", "preventivo_id", "created_at", "updated_at"}


class RuleEngine:
    """
    Motore valutazione regole business unificato.
    
    Flusso:
    1. build_config_context() → raccoglie tutti i dati configurazione
    2. Carica regole attive (DB + file)
    3. PASS 1: Lookup rules (phase 1)
    4. PASS 1.5: Pipeline rules (collect_sum, math_expr, catalog_select)
    5. PASS 2: Material rules (phase 2)
    6. Rimuove materiali orfani (regole non più attive)
    7. Aggiorna totale preventivo
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
        - Con prefisso: "normative.en_81_20" → "2020"
        - Senza prefisso: "en_81_20" → "2020"  (per compatibilità regole esistenti)
        
        In caso di conflitto tra chiavi senza prefisso (es. due sezioni hanno
        un campo "tipo"), vince l'ultimo inserito. Usare il prefisso per precisione.
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
                # Chiave con prefisso sezione
                context[f"{sezione_nome}.{campo}"] = valore
                # Chiave piatta (senza prefisso) per compatibilità
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
                # Prova a convertire in numero se possibile
                valore_convertito = self._try_convert_value(valore)
                context[f"{sezione}.{codice_campo}"] = valore_convertito
                context[codice_campo] = valore_convertito
                
        except Exception as e:
            # Tabella potrebbe non esistere ancora
            self.warnings.append(f"Tabella valori_configurazione non disponibile: {e}")

        # --- JSON legacy (preventivo.configurazione) come fallback ---
        config_json = getattr(preventivo, "configurazione", None)
        if config_json and isinstance(config_json, dict):
            for k, v in config_json.items():
                # Non sovrascrivere valori già presenti da fonti più affidabili
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
            # Fallback: usa __dict__
            for key, value in vars(obj).items():
                if key.startswith("_") or key in CAMPI_ESCLUSI:
                    continue
                if value is not None:
                    campi[key] = value
        return campi

    def _try_convert_value(self, valore: str) -> Any:
        """Tenta conversione stringa → numero se possibile."""
        if valore is None:
            return None
        if isinstance(valore, (int, float, bool)):
            return valore
        valore_str = str(valore).strip()
        if not valore_str:
            return valore_str
        # Prova int
        try:
            return int(valore_str)
        except ValueError:
            pass
        # Prova float
        try:
            return float(valore_str)
        except ValueError:
            pass
        return valore_str

    # ========================================================================
    # 2. CARICAMENTO REGOLE
    # ========================================================================
    def _load_rules_from_db(self) -> List[Dict[str, Any]]:
        """Carica regole attive dalla tabella regole, ordinate per priorità."""
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
                # Parse JSON se stringa
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
        
        # Carica anche regole rule_*.json dalla root
        for filename in sorted(os.listdir(".")):
            if not filename.startswith("rule_") or not filename.endswith(".json"):
                continue
            try:
                with open(filename, "r", encoding="utf-8") as f:
                    rule = json.load(f)
                rule["source"] = "file"
                rule.setdefault("id", filename.replace(".json", "").replace("rule_", ""))
                rule.setdefault("priorita", rule.get("priority", 100))
                rules.append(rule)
            except Exception as e:
                self.errors.append(f"Errore caricamento {filename}: {e}")
        
        return rules

    def load_all_rules(self) -> List[Dict[str, Any]]:
        """
        Carica regole da TUTTE le fonti (DB + file), 
        deduplica per rule_id (DB ha priorità), ordina per priorità.
        """
        rules_db = self._load_rules_from_db()
        rules_file = self._load_rules_from_files()
        
        # DB ha precedenza: se stessa rule_id esiste in DB e file, usa DB
        db_ids = {r["id"] for r in rules_db}
        rules_file_unique = [r for r in rules_file if r["id"] not in db_ids]
        
        all_rules = rules_db + rules_file_unique
        all_rules.sort(key=lambda r: r.get("priorita", 100))
        
        return all_rules

    # ========================================================================
    # 3. VALUTAZIONE CONDIZIONI
    # ========================================================================
    def evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """
        Valuta una singola condizione.
        
        Supporta field lookup con e senza prefisso sezione:
        - "field": "en_81_20"              → cerca context["en_81_20"]
        - "field": "normative.en_81_20"    → cerca context["normative.en_81_20"]
        """
        if isinstance(condition, str):
            return False

        field = condition.get("field", "")
        operator = condition.get("operator", "equals")
        expected_value = condition.get("value")

        # Lookup: prova prima la chiave esatta, poi lowercase
        actual_value = context.get(field)
        if actual_value is None:
            actual_value = context.get(field.lower())
        
        # Se non trovato e non ha punto, prova con tutte le sezioni
        if actual_value is None and "." not in field:
            for key, val in context.items():
                if key.endswith(f".{field}") or key.endswith(f".{field.lower()}"):
                    actual_value = val
                    break

        # Valore non trovato nel context
        if actual_value is None:
            return False

        # Stringa vuota = non valorizzato
        if isinstance(actual_value, str) and actual_value.strip() == "":
            return False

        # Valuta operatore
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
        
        Supporta 3 formati di condizioni:
        
        1. Lista di condizioni (AND implicito) - formato file JSON:
           "conditions": [{"field": "x", "operator": "equals", "value": "y"}, ...]
        
        2. Condizione singola:
           "conditions": {"field": "x", "operator": "equals", "value": "y"}
        
        3. Condizioni con logica esplicita:
           "conditions": {"logic": "OR", "conditions": [...]}
        """
        conditions = rule.get("conditions")
        
        if not conditions:
            # Nessuna condizione = applica sempre
            return True

        # Formato 1: lista di condizioni → AND implicito
        if isinstance(conditions, list):
            return all(self.evaluate_condition(c, context) for c in conditions)

        # Formato 2: condizione singola (ha "field")
        if isinstance(conditions, dict) and "field" in conditions:
            return self.evaluate_condition(conditions, context)

        # Formato 3: logica esplicita AND/OR
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
        
        Formato file JSON (materials array diretto):
          {"materials": [{"codice": "X", "descrizione": "Y", ...}]}
        
        Formato DB (actions array con tipo):
          {"actions": [{"action": "add_material", "material": {...}}]}
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
            else:
                self.warnings.append(f"Action type sconosciuto: {action_type}")

        return materiali_aggiunti

    # ========================================================================
    # 4b. PIPELINE STEP EXECUTION (phase 1.5)
    # ========================================================================
    def _exec_pipeline_steps(self, rule: Dict[str, Any], context: Dict[str, Any],
                              preventivo) -> int:
        """
        Esegue gli step di una pipeline rule.
        
        pipeline_steps è un array di azioni in sequenza:
        - collect_sum: raccoglie e somma valori da _calc.* e/o materiali
        - math_expr: calcolo aritmetico con variabili dal contesto
        - catalog_select: seleziona dal catalogo in base a un criterio singolo
        - lookup_each: per ogni campo selezionato, cerca nella lookup e scrive nel context
        - group_sum: raggruppa per un campo e somma un altro
        - multi_match: match multi-criterio su catalogo appiattito
        - add_material: aggiunge un materiale dal risultato
        
        Ogni step può leggere output degli step precedenti dal context.
        """
        steps = rule.get("pipeline_steps", [])
        if not steps:
            return 0

        rule_id = rule.get("id", "unknown")
        materiali_aggiunti = 0

        for i, step in enumerate(steps):
            action = step.get("action", "")
            try:
                if action == "collect_sum":
                    self._exec_collect_sum(step, context, preventivo)
                elif action == "math_expr":
                    self._exec_math_expr(step, context)
                elif action == "catalog_select":
                    self._exec_catalog_select(step, context)
                elif action == "lookup_each":
                    self._exec_lookup_each(step, context)
                elif action == "group_sum":
                    self._exec_group_sum(step, context)
                elif action == "multi_match":
                    self._exec_multi_match(step, context)
                elif action == "add_material":
                    mat_data = step.get("material", step)
                    if self._add_material(preventivo, mat_data, rule_id, context):
                        materiali_aggiunti += 1
                else:
                    self.warnings.append(
                        f"Pipeline step #{i} azione sconosciuta: {action} (rule {rule_id})"
                    )
            except Exception as e:
                self.errors.append(
                    f"Pipeline step #{i} ({action}) errore in {rule_id}: {e}"
                )

        return materiali_aggiunti

    def _exec_collect_sum(self, step: Dict[str, Any], context: Dict[str, Any],
                           preventivo) -> None:
        """
        Raccoglie valori da più fonti e li somma.
        
        sources:
        - {"type": "calc", "pattern": "_calc.*.va_24v"}
            → cerca nel context tutte le chiavi che matchano il pattern
        - {"type": "materials", "field": "va_assorbimento", "filter": {"categoria": "..."}}
            → query materiali dal DB con filtro opzionale
        - {"type": "context", "field": "campo_specifico"}
            → legge un singolo valore dal context
        
        output: chiave nel context dove scrivere il risultato (es. "_calc.pipeline.totale_va")
        """
        sources = step.get("sources", [])
        output_key = step.get("output", "_calc.pipeline.sum_result")
        totale = 0.0

        for source in sources:
            src_type = source.get("type", "")

            if src_type == "calc":
                # Pattern matching su chiavi _calc.* nel context
                pattern = source.get("pattern", "")
                for key, val in context.items():
                    if fnmatch.fnmatch(key, pattern):
                        try:
                            totale += float(val)
                        except (ValueError, TypeError):
                            self.warnings.append(
                                f"collect_sum: non numerico {key}={val}"
                            )

            elif src_type == "materials":
                # Query materiali dal DB
                field_name = source.get("field", "")
                filter_cond = source.get("filter", {})
                
                if not field_name:
                    continue
                    
                try:
                    pid = preventivo.id
                    query = f"SELECT {field_name} FROM materiali WHERE preventivo_id = :pid"
                    params: Dict[str, Any] = {"pid": pid}
                    
                    for fk, fv in filter_cond.items():
                        safe_key = f"f_{fk}"
                        query += f" AND {fk} = :{safe_key}"
                        params[safe_key] = fv
                    
                    rows = self.db.execute(text(query), params).fetchall()
                    for row in rows:
                        try:
                            if row[0] is not None:
                                totale += float(row[0])
                        except (ValueError, TypeError):
                            pass
                except Exception as e:
                    self.warnings.append(f"collect_sum materials query error: {e}")

            elif src_type == "context":
                # Singolo valore dal context
                field = source.get("field", "")
                val = self._resolve_value(field, context)
                if val is not None:
                    try:
                        totale += float(val)
                    except (ValueError, TypeError):
                        self.warnings.append(
                            f"collect_sum context: non numerico {field}={val}"
                        )

        context[output_key] = totale
        logger.debug(f"collect_sum → {output_key} = {totale}")

    def _exec_math_expr(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """
        Valuta un'espressione aritmetica sicura con variabili dal context.
        
        expression: stringa con operazioni base (+, -, *, /) e riferimenti a _calc.*
        output: chiave dove scrivere il risultato
        round: "up_10", "up_50", "up_100", "ceil", "floor", "round_2", ecc.
        """
        expression = step.get("expression", "")
        output_key = step.get("output", "_calc.pipeline.expr_result")
        round_mode = step.get("round", None)

        if not expression:
            self.warnings.append("math_expr: expression vuota")
            return

        # Sostituisci le variabili _calc.xxx con i valori dal context
        resolved_expr = expression
        # Trova tutti i riferimenti a variabili (parole con punti o underscore)
        var_pattern = re.compile(r'_calc\.[\w.]+|[a-zA-Z_][\w.]*')
        
        used_vars = set(var_pattern.findall(expression))
        for var_name in sorted(used_vars, key=len, reverse=True):
            val = self._resolve_value(var_name, context)
            if val is not None:
                try:
                    resolved_expr = resolved_expr.replace(var_name, str(float(val)))
                except (ValueError, TypeError):
                    self.warnings.append(f"math_expr: non numerico {var_name}={val}")
                    context[output_key] = 0
                    return

        # Eval sicuro: solo numeri e operazioni base
        allowed_chars = set("0123456789.+-*/() ")
        clean = resolved_expr.strip()
        if not all(c in allowed_chars for c in clean):
            self.errors.append(
                f"math_expr: caratteri non ammessi in '{clean}'"
            )
            return

        try:
            result = eval(clean, {"__builtins__": {}}, {})
            result = float(result)
        except Exception as e:
            self.errors.append(f"math_expr eval error: {e} expr='{clean}'")
            return

        # Arrotondamento
        if round_mode:
            result = self._apply_rounding(result, round_mode)

        context[output_key] = result
        logger.debug(f"math_expr → {output_key} = {result} (expr: {expression})")

    def _apply_rounding(self, value: float, mode: str) -> float:
        """Applica arrotondamento in varie modalità."""
        if mode == "ceil":
            return math.ceil(value)
        elif mode == "floor":
            return math.floor(value)
        elif mode.startswith("up_"):
            # up_50 → arrotonda per eccesso al multiplo di 50 più vicino
            try:
                step = int(mode.replace("up_", ""))
                return math.ceil(value / step) * step
            except ValueError:
                return math.ceil(value)
        elif mode.startswith("round_"):
            try:
                decimals = int(mode.replace("round_", ""))
                return round(value, decimals)
            except ValueError:
                return round(value, 2)
        elif mode == "round":
            return round(value)
        return value

    def _exec_catalog_select(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """
        Seleziona un record da un catalogo (data table JSON) in base a criteri.
        
        tabella: nome della data table (es. "trasformatori_std")
        criterio: {"colonna": "potenza_va", "operatore": ">=", "valore": "_calc.xxx"}
        filtri: [{"colonna": "tipo", "operatore": "==", "valore": "Monofase"}] (opzionale)
        ordinamento: {"colonna": "potenza_va", "direzione": "ASC"}
        limit: 1
        output_prefix: "_calc.trasformatore_selezionato."
        """
        tabella_nome = step.get("tabella", "")
        criterio = step.get("criterio", {})
        filtri = step.get("filtri", [])
        ordinamento = step.get("ordinamento", {})
        limit = step.get("limit", 1)
        output_prefix = step.get("output_prefix", f"_calc.{tabella_nome}.")

        # Carica la data table
        table_data = self._load_data_table(tabella_nome)
        if not table_data:
            self.warnings.append(f"catalog_select: tabella '{tabella_nome}' non trovata")
            return

        records = table_data.get("records", [])
        if not records:
            self.warnings.append(f"catalog_select: tabella '{tabella_nome}' vuota")
            return

        # Applica filtri fissi (es. tipo = "Monofase")
        filtered = records
        for filtro in filtri:
            col = filtro.get("colonna", "")
            op = filtro.get("operatore", "==")
            val_raw = filtro.get("valore", "")
            # Resolve se è un riferimento a _calc
            val = self._resolve_value(str(val_raw), context) if isinstance(val_raw, str) and val_raw.startswith("_calc.") else val_raw
            
            new_filtered = []
            for rec in filtered:
                rec_val = rec.get(col)
                if rec_val is not None and self._catalog_compare(rec_val, op, val):
                    new_filtered.append(rec)
            filtered = new_filtered

        # Applica criterio principale (es. potenza_va >= totale_va_sicurezza)
        if criterio:
            col = criterio.get("colonna", "")
            op = criterio.get("operatore", ">=")
            val_raw = criterio.get("valore", 0)
            
            # Resolve valore dinamico
            if isinstance(val_raw, str) and (val_raw.startswith("_calc.") or val_raw.startswith("_")):
                val = self._resolve_value(val_raw, context)
                if val is None:
                    self.warnings.append(
                        f"catalog_select: valore criterio '{val_raw}' non trovato nel context"
                    )
                    return
            else:
                val = val_raw

            try:
                val = float(val)
            except (ValueError, TypeError):
                self.warnings.append(f"catalog_select: valore criterio non numerico: {val}")
                return

            result = []
            for rec in filtered:
                rec_val = rec.get(col)
                if rec_val is not None:
                    try:
                        if self._catalog_compare(float(rec_val), op, val):
                            result.append(rec)
                    except (ValueError, TypeError):
                        pass
            filtered = result

        # Ordinamento
        if ordinamento:
            sort_col = ordinamento.get("colonna", "")
            sort_dir = ordinamento.get("direzione", "ASC").upper()
            
            def sort_key(rec):
                v = rec.get(sort_col, 0)
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return str(v)
            
            filtered.sort(key=sort_key, reverse=(sort_dir == "DESC"))

        # Limita risultati
        filtered = filtered[:limit]

        if not filtered:
            self.warnings.append(
                f"catalog_select: nessun record trovato in '{tabella_nome}' con i criteri dati"
            )
            return

        # Scrivi risultati nel context
        selected = filtered[0]
        for col_name, col_val in selected.items():
            context[f"{output_prefix}{col_name}"] = col_val
        
        # Scrivi anche un flag di successo
        context[f"{output_prefix}_found"] = True
        context[f"{output_prefix}_count"] = len(filtered)

        logger.debug(
            f"catalog_select → {output_prefix}* = {selected.get(ordinamento.get('colonna', ''), '?')}"
        )

    # ========================================================================
    # 4c. PIPELINE ACTIONS: lookup_each, group_sum, multi_match
    # ========================================================================
    def _exec_lookup_each(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """
        Per ogni campo configuratore che ha valore "true"/"si"/"1",
        cerca il nome del campo nella data table e scrive i risultati nel context.
        
        Supporta RIGHE MULTIPLE per lo stesso componente (es. un componente che
        richiede uscite a tensioni diverse). Ogni riga viene scritta con suffisso _N.
        
        sezione: sezione del configuratore da scansionare
        tabella: nome data table lookup
        campo_lookup: colonna nella tabella da matchare col nome campo
        output_prefix: prefisso per i risultati
        
        Risultato per componente con 3 righe:
          _calc.util.pattino_retrattile_0.watt = 150
          _calc.util.pattino_retrattile_0.tensione_uscita = 75
          _calc.util.pattino_retrattile_1.watt = 150
          _calc.util.pattino_retrattile_1.tensione_uscita = 15
          _calc.util.pattino_retrattile_2.watt = 150
          _calc.util.pattino_retrattile_2.tensione_uscita = 18
        """
        sezione = step.get("sezione", "")
        tabella_nome = step.get("tabella", "")
        campo_lookup = step.get("campo_lookup", "componente")
        output_prefix = step.get("output_prefix", "_calc.util.")
        
        # Carica la data table
        table_data = self._load_data_table(tabella_nome)
        if not table_data:
            self.warnings.append(f"lookup_each: tabella '{tabella_nome}' non trovata")
            return
        
        records = table_data.get("records", [])
        
        # Indicizza per campo_lookup → LISTA di record (supporta righe multiple)
        lookup_index: Dict[str, List[Dict[str, Any]]] = {}
        for rec in records:
            key = str(rec.get(campo_lookup, "")).strip().lower()
            if key:
                lookup_index.setdefault(key, []).append(rec)
        
        # Scansiona il context per trovare campi della sezione con valore true
        found_count = 0
        row_count = 0
        for ctx_key, ctx_val in context.items():
            campo_nome = None
            if sezione and ctx_key.startswith(f"{sezione}."):
                campo_nome = ctx_key[len(sezione) + 1:]
            elif not sezione:
                campo_nome = ctx_key
            
            if campo_nome is None:
                continue
            
            if not self._is_truthy(ctx_val):
                continue
            
            # Cerca nella lookup
            campo_lower = campo_nome.lower().strip()
            recs = lookup_index.get(campo_lower, [])
            if not recs:
                continue
            
            found_count += 1
            
            # Scrivi ogni riga con suffisso _N
            for idx, rec in enumerate(recs):
                suffix = f"{campo_nome}_{idx}" if len(recs) > 1 else campo_nome
                for col_name, col_val in rec.items():
                    context[f"{output_prefix}{suffix}.{col_name}"] = col_val
                row_count += 1
        
        context[f"{output_prefix}_count"] = found_count
        context[f"{output_prefix}_rows"] = row_count
        logger.debug(f"lookup_each → {found_count} componenti, {row_count} righe totali")

    def _exec_group_sum(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """
        Raggruppa valori dal context per un campo e somma un altro campo.
        
        pattern_value: pattern per i valori da sommare (es. "_calc.util.*.watt")
        pattern_group: pattern per il campo di raggruppamento (es. "_calc.util.*.tensione_uscita")
        output_prefix: prefisso output (es. "_calc.grouped.")
        power_factor: se specificato, divide per PF dopo la somma → VA
        
        Le due pattern devono avere lo stesso wildcard (*) che identifica l'utilizzatore.
        
        Risultato:
          _calc.grouped.75 = 300  (somma watt degli utilizzatori a 75V)
          _calc.grouped.18 = 121  (somma watt degli utilizzatori a 18V)
          _calc.grouped._keys = [75, 18, ...]
        """
        pattern_value = step.get("pattern_value", "")
        pattern_group = step.get("pattern_group", "")
        output_prefix = step.get("output_prefix", "_calc.grouped.")
        power_factor_key = step.get("power_factor", None)
        
        if not pattern_value or not pattern_group:
            self.warnings.append("group_sum: pattern_value e pattern_group richiesti")
            return
        
        # Estrai il prefisso/suffisso dal pattern per trovare le chiavi corrispondenti
        # Pattern: "_calc.util.*.watt" → prefisso="_calc.util.", suffisso=".watt"
        # Pattern: "_calc.util.*.tensione_uscita" → prefisso="_calc.util.", suffisso=".tensione_uscita"
        
        def parse_pattern(p):
            if '*' not in p:
                return p, "", ""
            idx = p.index('*')
            return p, p[:idx], p[idx+1:]
        
        _, val_prefix, val_suffix = parse_pattern(pattern_value)
        _, grp_prefix, grp_suffix = parse_pattern(pattern_group)
        
        # Trova tutti i "nomi" (il * nei pattern)
        nomi = set()
        for key in context.keys():
            if key.startswith(val_prefix) and key.endswith(val_suffix):
                nome = key[len(val_prefix):]
                if val_suffix:
                    nome = nome[:-len(val_suffix)]
                if nome:
                    nomi.add(nome)
        
        # Raggruppa e somma
        groups: Dict[str, float] = {}
        for nome in nomi:
            val_key = f"{val_prefix}{nome}{val_suffix}"
            grp_key = f"{grp_prefix}{nome}{grp_suffix}"
            
            value = context.get(val_key)
            group = context.get(grp_key)
            
            if value is None or group is None:
                continue
            
            try:
                v = float(value)
            except (ValueError, TypeError):
                continue
            
            group_str = str(int(float(group)) if isinstance(group, (int, float)) else group)
            groups[group_str] = groups.get(group_str, 0) + v
        
        # Applica power factor se specificato
        pf = 0.8  # default
        if power_factor_key:
            pf_val = self._resolve_value(power_factor_key, context)
            if pf_val is not None:
                try:
                    pf = float(pf_val)
                except (ValueError, TypeError):
                    pass
        
        if power_factor_key and pf > 0:
            groups = {k: round(v / pf, 1) for k, v in groups.items()}
        
        # Scrivi risultati
        for group_key, total in groups.items():
            context[f"{output_prefix}{group_key}"] = total
        
        # Lista delle chiavi di gruppo
        context[f"{output_prefix}_keys"] = sorted(groups.keys())
        context[f"{output_prefix}_count"] = len(groups)
        
        logger.debug(f"group_sum → {len(groups)} gruppi: {groups}")

    def _exec_multi_match(self, step: Dict[str, Any], context: Dict[str, Any]) -> None:
        """
        Match multi-criterio su catalogo appiattito.
        
        Trova il trasformatore che soddisfa TUTTI i requisiti per tensione:
        per ogni tensione richiesta, deve avere un'uscita con va_disponibili >= va_richiesti.
        
        tabella: nome data table catalogo appiattito
        requisiti_prefix: prefisso dei requisiti raggruppati (es. "_calc.grouped.")
          Le chiavi sono le tensioni, i valori sono i VA necessari
        colonna_codice: colonna che identifica il trasformatore (es. "codice_trasf")
        colonna_tensione: colonna tensione nel catalogo (es. "tensione_uscita")
        colonna_va: colonna VA disponibili (es. "va_disponibili")
        colonna_ordinamento: colonna per ordinare i candidati (es. "potenza_totale_va")
        filtri: filtri fissi opzionali (es. [{"colonna": "tipo", "valore": "Monofase"}])
        output_prefix: dove scrivere il risultato
        """
        tabella_nome = step.get("tabella", "")
        requisiti_prefix = step.get("requisiti_prefix", "_calc.grouped.")
        col_codice = step.get("colonna_codice", "codice_trasf")
        col_tensione = step.get("colonna_tensione", "tensione_uscita")
        col_va = step.get("colonna_va", "va_disponibili")
        col_sort = step.get("colonna_ordinamento", "potenza_totale_va")
        filtri = step.get("filtri", [])
        output_prefix = step.get("output_prefix", "_calc.trasformatore.")
        
        # Carica catalogo
        table_data = self._load_data_table(tabella_nome)
        if not table_data:
            self.warnings.append(f"multi_match: tabella '{tabella_nome}' non trovata")
            return
        
        records = table_data.get("records", [])
        
        # Applica filtri fissi
        for filtro in filtri:
            f_col = filtro.get("colonna", "")
            f_val = filtro.get("valore", "")
            records = [r for r in records if str(r.get(f_col, "")).lower() == str(f_val).lower()]
        
        # Leggi requisiti dal context
        requisiti: Dict[str, float] = {}
        keys_list = context.get(f"{requisiti_prefix}_keys", [])
        
        if keys_list:
            for key in keys_list:
                val = context.get(f"{requisiti_prefix}{key}")
                if val is not None:
                    try:
                        requisiti[str(key)] = float(val)
                    except (ValueError, TypeError):
                        pass
        else:
            # Fallback: scansiona il context per il prefisso
            for ctx_key, ctx_val in context.items():
                if ctx_key.startswith(requisiti_prefix) and not ctx_key.endswith(('_keys', '_count')):
                    tensione = ctx_key[len(requisiti_prefix):]
                    try:
                        requisiti[tensione] = float(ctx_val)
                    except (ValueError, TypeError):
                        pass
        
        if not requisiti:
            self.warnings.append("multi_match: nessun requisito trovato")
            return
        
        logger.debug(f"multi_match requisiti: {requisiti}")
        
        # Raggruppa catalogo per codice trasformatore
        catalogo_per_codice: Dict[str, List[Dict[str, Any]]] = {}
        for rec in records:
            codice = rec.get(col_codice, "")
            if codice:
                catalogo_per_codice.setdefault(codice, []).append(rec)
        
        # Per ogni trasformatore, verifica se soddisfa TUTTI i requisiti
        candidati = []
        
        for codice, righe in catalogo_per_codice.items():
            # Costruisci mappa tensione → max VA disponibili per questo trasformatore
            va_per_tensione: Dict[str, float] = {}
            for riga in righe:
                t = str(int(float(riga.get(col_tensione, 0))))
                va = float(riga.get(col_va, 0))
                # Se ci sono più uscite alla stessa tensione, somma
                va_per_tensione[t] = va_per_tensione.get(t, 0) + va
            
            # Verifica che tutte le tensioni richieste siano coperte
            soddisfa_tutto = True
            dettaglio = {}
            for tensione_richiesta, va_richiesti in requisiti.items():
                va_disp = va_per_tensione.get(tensione_richiesta, 0)
                if va_disp < va_richiesti:
                    soddisfa_tutto = False
                    break
                dettaglio[tensione_richiesta] = {
                    "richiesti": va_richiesti,
                    "disponibili": va_disp,
                    "margine": va_disp - va_richiesti,
                }
            
            if soddisfa_tutto:
                # Prendi info generali dal primo record
                info = righe[0]
                potenza = float(info.get(col_sort, 0))
                candidati.append({
                    "codice": codice,
                    "potenza": potenza,
                    "info": info,
                    "dettaglio": dettaglio,
                })
        
        if not candidati:
            self.warnings.append(
                f"multi_match: nessun trasformatore soddisfa tutti i requisiti: {requisiti}"
            )
            context[f"{output_prefix}_found"] = False
            return
        
        # Ordina per potenza (il più piccolo che soddisfa)
        candidati.sort(key=lambda c: c["potenza"])
        
        # Scrivi il vincitore nel context
        winner = candidati[0]
        for col_name, col_val in winner["info"].items():
            context[f"{output_prefix}{col_name}"] = col_val
        
        context[f"{output_prefix}_found"] = True
        context[f"{output_prefix}_candidati"] = len(candidati)
        context[f"{output_prefix}_dettaglio"] = winner["dettaglio"]
        
        logger.debug(
            f"multi_match → codice={winner['codice']} potenza={winner['potenza']}VA "
            f"({len(candidati)} candidati su {len(catalogo_per_codice)} trasformatori)"
        )

    def _is_truthy(self, value: Any) -> bool:
        """Verifica se un valore è 'attivo' (true, si, 1, on, ecc.)."""
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        s = str(value).strip().lower()
        return s in ("true", "1", "si", "sì", "yes", "on", "vero", "x")

    def _catalog_compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Confronto per catalog_select."""
        try:
            a = float(actual)
            b = float(expected)
            if operator in (">=", "gte"):
                return a >= b
            elif operator in (">", "gt"):
                return a > b
            elif operator in ("<=", "lte"):
                return a <= b
            elif operator in ("<", "lt"):
                return a < b
            elif operator in ("==", "equals"):
                return a == b
            elif operator in ("!=", "not_equals"):
                return a != b
        except (ValueError, TypeError):
            # Fallback su confronto stringa
            if operator in ("==", "equals"):
                return str(actual).lower() == str(expected).lower()
            elif operator in ("!=", "not_equals"):
                return str(actual).lower() != str(expected).lower()
        return False

    def _resolve_value(self, field: str, context: Dict[str, Any]) -> Any:
        """Risolve un valore dal context con fallback multi-strategia."""
        # Tentativo diretto
        val = context.get(field)
        if val is not None:
            return val
        # Lowercase
        val = context.get(field.lower())
        if val is not None:
            return val
        # Senza prefisso sezione
        if "." in field:
            short = field.split(".")[-1]
            val = context.get(short)
            if val is not None:
                return val
        # Ricerca parziale
        for key, v in context.items():
            if key.endswith(f".{field}") or key.endswith(f".{field.lower()}"):
                return v
        return None

    def _load_data_table(self, nome: str) -> Optional[Dict[str, Any]]:
        """
        Carica una data table JSON.
        Cerca in: ./data/, ./, ./rules/data/
        """
        search_paths = [
            os.path.join("./data", f"{nome}.json"),
            os.path.join(".", f"{nome}.json"),
            os.path.join("./rules/data", f"{nome}.json"),
        ]
        
        for path in search_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception as e:
                    self.warnings.append(f"Errore caricamento data table {path}: {e}")
        
        return None

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

        # Pattern: {FIELD} o [FIELD] o {{sezione.campo}}
        pattern = r'\{\{([\w.]+)\}\}|\{(\w+)\}|\[(\w+)\]'

        def replacer(match):
            # {{sezione.campo}} → lookup diretto
            field_name = match.group(1) or match.group(2) or match.group(3)
            field_lower = field_name.lower()
            
            # Prova lookup diretto
            value = context.get(field_lower)
            if value is None:
                value = context.get(field_name)
            # Prova con ricerca parziale
            if value is None and "." not in field_lower:
                for key, val in context.items():
                    if key.endswith(f".{field_lower}"):
                        value = val
                        break
            
            if value is not None:
                return str(value)
            return match.group(0)  # Mantieni placeholder se non trovato

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
                # Cerca con prefisso sezione
                for key, val in context.items():
                    if key.endswith(f".{param_lower}"):
                        value = val
                        break
            if value is not None:
                parametri[param_name.upper()] = value

        return parametri

    # ========================================================================
    # 6. ORCHESTRAZIONE PRINCIPALE
    # ========================================================================
    def evaluate_rules(self, preventivo) -> Dict[str, Any]:
        """
        Entry point principale. Valuta tutte le regole per un preventivo.
        
        Flusso:
        1. Costruisce context da tutte le fonti
        2. Carica regole (DB + file)
        3. PASS 1: Valuta condizioni → determina regole attive
        4. PASS 1.5: Esegue pipeline_steps delle regole pipeline (arricchisce context)
        5. PASS 2: Aggiunge materiali da regole attive + pipeline
        6. Rimuove materiali orfani
        7. Commit e aggiorna totale
        
        Returns:
            Dict con risultati: active_rules, materials_added, materials_removed, ecc.
        """
        from models import Materiale
        
        self.warnings = []
        self.errors = []

        # 1. Costruisci context
        context = self.build_config_context(preventivo)
        
        # 2. Carica regole
        all_rules = self.load_all_rules()
        if not all_rules:
            self.warnings.append("Nessuna regola trovata (né DB né file)")
            return self._build_result(set(), 0, 0, preventivo)

        # 3. Valuta condizioni → determina regole attive
        active_rules: Set[str] = set()
        rules_to_apply: List[Dict[str, Any]] = []
        pipeline_rules: List[Dict[str, Any]] = []

        for rule in all_rules:
            rule_id = rule.get("id", "unknown")
            enabled = rule.get("enabled", True)
            
            if not enabled:
                continue
            
            try:
                if self.should_apply_rule(rule, context):
                    active_rules.add(rule_id)
                    
                    # Separa pipeline rules dalle material rules
                    if rule.get("pipeline_steps"):
                        pipeline_rules.append(rule)
                    else:
                        rules_to_apply.append(rule)
            except Exception as e:
                self.errors.append(f"Errore valutazione regola {rule_id}: {e}")

        # 4. PASS 1.5: Esegui pipeline steps (arricchiscono il context)
        pipeline_materials = 0
        for rule in pipeline_rules:
            try:
                added = self._exec_pipeline_steps(rule, context, preventivo)
                pipeline_materials += added
            except Exception as e:
                self.errors.append(
                    f"Errore pipeline {rule.get('id')}: {e}"
                )

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

        # 6. Aggiungi materiali nuovi (regole non-pipeline)
        added_count = 0
        for rule in rules_to_apply:
            try:
                added = self.apply_rule_actions(rule, preventivo, context)
                added_count += added
            except Exception as e:
                self.errors.append(
                    f"Errore applicazione regola {rule.get('id')}: {e}"
                )

        added_count += pipeline_materials

        # 7. Commit e aggiorna totale
        try:
            self.db.commit()
        except Exception as e:
            self.errors.append(f"Errore commit: {e}")
            self.db.rollback()
            return self._build_result(active_rules, 0, 0, preventivo)

        self._update_totale(preventivo)

        return self._build_result(active_rules, added_count, removed_count, preventivo)

    def _update_totale(self, preventivo):
        """Ricalcola il totale del preventivo sommando tutti i materiali."""
        from models import Materiale
        
        try:
            all_materials = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id
            ).all()
            
            totale = sum(m.prezzo_totale or 0 for m in all_materials)
            
            # Aggiorna il campo totale (supporta entrambi i nomi)
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

    def _add_material(self, preventivo, material_data: Dict[str, Any], 
                      rule_id: str, context: Dict[str, Any]) -> bool:
        """Aggiunge materiale al preventivo con supporto placeholder e parametri."""
        from models import Materiale
        
        try:
            # Sostituisci placeholder nel codice e descrizione
            codice = self._replace_placeholders(material_data.get("codice", ""), context)
            descrizione = self._replace_placeholders(
                material_data.get("descrizione", ""), context
            )

            # Se il codice è un riferimento a _calc, risolvilo
            if codice.startswith("_calc."):
                resolved = self._resolve_value(codice, context)
                if resolved:
                    codice = str(resolved)

            if not codice:
                self.warnings.append(f"add_material: codice vuoto per regola {rule_id}")
                return False

            # Verifica duplicato (stesso codice + stessa regola)
            existing = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id,
                Materiale.codice == codice,
                Materiale.regola_id == rule_id
            ).first()

            if existing:
                return False

            # Quantità e prezzo (possono essere riferimenti _calc)
            quantita = self._resolve_numeric(material_data.get("quantita", 1.0), context)
            prezzo_unitario = self._resolve_numeric(
                material_data.get("prezzo_unitario", 0.0), context
            )

            # Estrai parametri da placeholder nel codice
            parametri = self._extract_parameters(codice, context)

            # Crea materiale
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

            # Assegna parametri (fino a 5 slot)
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

    def _resolve_numeric(self, value: Any, context: Dict[str, Any]) -> float:
        """Risolve un valore numerico, che può essere diretto o un riferimento _calc."""
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            if value.startswith("_calc."):
                resolved = self._resolve_value(value, context)
                if resolved is not None:
                    try:
                        return float(resolved)
                    except (ValueError, TypeError):
                        pass
            try:
                return float(value)
            except (ValueError, TypeError):
                pass
        return 0.0

    def _set_field(self, preventivo, action: Dict[str, Any], context: Dict[str, Any]):
        """Imposta un campo nel preventivo o nelle sue sezioni (futuro)."""
        # TODO: implementare set_field per modificare configurazione
        field = action.get("field", "")
        value = action.get("value")
        self.warnings.append(f"set_field non ancora implementato: {field}={value}")

    # ========================================================================
    # UTILITY: debug context
    # ========================================================================
    def get_context_debug(self, preventivo) -> Dict[str, Any]:
        """
        Restituisce il context completo per debug/diagnostica.
        Utile per capire cosa "vede" il rule engine.
        """
        context = self.build_config_context(preventivo)
        return {
            "preventivo_id": preventivo.id,
            "total_keys": len(context),
            "context": context,
            "sezioni_dedicate_trovate": [
                sez for sez, rel in SEZIONI_DEDICATE.items()
                if getattr(preventivo, rel, None) is not None
            ],
        }

    def simulate_pipeline(self, pipeline_rule: Dict[str, Any], 
                          preventivo) -> Dict[str, Any]:
        """
        Simula l'esecuzione di una pipeline senza modificare il DB.
        Utile per il preview nel frontend.
        """
        self.warnings = []
        self.errors = []
        
        context = self.build_config_context(preventivo)
        
        step_results = []
        steps = pipeline_rule.get("pipeline_steps", [])
        
        for i, step in enumerate(steps):
            action = step.get("action", "")
            before_keys = set(context.keys())
            
            try:
                if action == "collect_sum":
                    self._exec_collect_sum(step, context, preventivo)
                elif action == "math_expr":
                    self._exec_math_expr(step, context)
                elif action == "catalog_select":
                    self._exec_catalog_select(step, context)
                elif action == "lookup_each":
                    self._exec_lookup_each(step, context)
                elif action == "group_sum":
                    self._exec_group_sum(step, context)
                elif action == "multi_match":
                    self._exec_multi_match(step, context)
                elif action == "add_material":
                    pass  # Non eseguiamo in simulazione
                
                # Trova le chiavi nuove aggiunte
                new_keys = set(context.keys()) - before_keys
                new_values = {k: context[k] for k in new_keys}
                
                step_results.append({
                    "step": i,
                    "action": action,
                    "status": "ok",
                    "output": new_values,
                })
            except Exception as e:
                step_results.append({
                    "step": i,
                    "action": action,
                    "status": "error",
                    "error": str(e),
                })

        return {
            "steps": step_results,
            "final_context_calc": {
                k: v for k, v in context.items() if k.startswith("_calc.")
            },
            "warnings": self.warnings,
            "errors": self.errors,
        }
