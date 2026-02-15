"""
rule_engine.py - Rule Engine unificato
Combina il meglio di:
  - evaluate_rules() da main.py (rimozione orfani smart, trigger automatico, aggiornamento totali)
  - RuleEngine class da rule_engine.py (AND/OR, placeholder, parametri BOM, operatori estesi)

Nuove funzionalità:
  - build_config_context() legge da TUTTE le fonti (ORM dedicati + valori_configurazione dinamici)
  - Supporto regole da DB (tabella regole) E da file JSON (directory rules/)
  - Chiavi con prefisso sezione (normative.en_81_20) + chiavi piatte per compatibilità (en_81_20)
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
    2. Carica regole attive (DB + file JSON)
    3. Valuta condizioni (singole, AND, OR)
    4. Esegue azioni (add_material con placeholder e parametri)
    5. Rimuove materiali orfani (regole non più attive)
    6. Aggiorna totale preventivo
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

    def _add_material(self, preventivo, material_data: Dict[str, Any], 
                      rule_id: str, context: Dict[str, Any]) -> bool:
        """Aggiunge materiale al preventivo con supporto placeholder e parametri."""
        # Import lazy per evitare circular imports
        from models import Materiale
        
        try:
            # Sostituisci placeholder nel codice e descrizione
            codice = self._replace_placeholders(material_data.get("codice", ""), context)
            descrizione = self._replace_placeholders(
                material_data.get("descrizione", ""), context
            )

            # Verifica duplicato (stesso codice + stessa regola)
            existing = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id,
                Materiale.codice == codice,
                Materiale.regola_id == rule_id
            ).first()

            if existing:
                return False

            # Quantità e prezzo
            quantita = material_data.get("quantita", 1.0)
            prezzo_unitario = material_data.get("prezzo_unitario", 0.0)

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

    def _set_field(self, preventivo, action: Dict[str, Any], context: Dict[str, Any]):
        """Imposta un campo nel preventivo o nelle sue sezioni (futuro)."""
        # TODO: implementare set_field per modificare configurazione
        field = action.get("field", "")
        value = action.get("value")
        self.warnings.append(f"set_field non ancora implementato: {field}={value}")

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
        3. Valuta condizioni → determina regole attive
        4. Rimuove materiali di regole non più attive (orfani)
        5. Aggiunge materiali di regole nuove
        6. Aggiorna totale preventivo
        
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

        for rule in all_rules:
            rule_id = rule.get("id", "unknown")
            enabled = rule.get("enabled", True)
            
            if not enabled:
                continue
            
            try:
                if self.should_apply_rule(rule, context):
                    active_rules.add(rule_id)
                    rules_to_apply.append(rule)
            except Exception as e:
                self.errors.append(f"Errore valutazione regola {rule_id}: {e}")

        # 4. Rimuovi materiali orfani (regole non più attive)
        existing_auto_materials = self.db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo.id,
            Materiale.aggiunto_da_regola == True
        ).all()

        removed_count = 0
        for mat in existing_auto_materials:
            if mat.regola_id not in active_rules:
                self.db.delete(mat)
                removed_count += 1

        # 5. Aggiungi materiali nuovi
        added_count = 0
        for rule in rules_to_apply:
            try:
                added = self.apply_rule_actions(rule, preventivo, context)
                added_count += added
            except Exception as e:
                self.errors.append(
                    f"Errore applicazione regola {rule.get('id')}: {e}"
                )

        # 6. Commit e aggiorna totale
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
