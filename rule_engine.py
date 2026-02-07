"""
rule_engine.py - Sistema valutazione regole business
"""
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from models import Preventivo, Materiale, Regola
import re


class RuleEngine:
    """Motore valutazione regole business"""
    
    def __init__(self, db: Session):
        self.db = db
        self.warnings = []
        self.errors = []
    
    def evaluate_rules(self, preventivo: Preventivo, force_refresh: bool = False) -> Tuple[int, int, List[str]]:
        """
        Valuta regole per un preventivo e aggiunge materiali automaticamente
        
        Args:
            preventivo: Preventivo da valutare
            force_refresh: Se True, rimuove materiali da regole e ricalcola
        
        Returns:
            Tuple (materiali_aggiunti, materiali_rimossi, regole_applicate)
        """
        # Reset warnings/errors
        self.warnings = []
        self.errors = []
        
        # Se force_refresh, rimuovi materiali aggiunti da regole
        materiali_rimossi = 0
        if force_refresh:
            materiali_rimossi = self._remove_rule_materials(preventivo.id)
        
        # Carica regole attive ordinate per priorità
        regole = self.db.query(Regola).filter(
            Regola.attiva == True
        ).order_by(Regola.priorita.asc()).all()
        
        if not regole:
            self.warnings.append("Nessuna regola attiva trovata")
            return 0, materiali_rimossi, []
        
        # Prepara contesto per valutazione
        context = self._prepare_context(preventivo)
        
        # Applica regole
        materiali_aggiunti = 0
        regole_applicate = []
        
        for regola in regole:
            try:
                if self._should_apply_rule(regola, context):
                    added = self._apply_rule(regola, preventivo, context)
                    materiali_aggiunti += added
                    if added > 0:
                        regole_applicate.append(regola.rule_id)
            except Exception as e:
                self.errors.append(f"Errore valutazione regola {regola.rule_id}: {str(e)}")
        
        return materiali_aggiunti, materiali_rimossi, regole_applicate
    
    def _prepare_context(self, preventivo: Preventivo) -> Dict[str, Any]:
        """Prepara contesto per valutazione regole"""
        config = preventivo.configurazione or {}
        
        # Normalizza chiavi a lowercase per case-insensitive matching
        context = {k.lower(): v for k, v in config.items()}
        
        # Aggiungi metadati preventivo
        context.update({
            "preventivo_id": preventivo.id,
            "preventivo_tipo": preventivo.tipo,
            "cliente_id": preventivo.cliente_id,
        })
        
        return context
    
    def _should_apply_rule(self, regola: Regola, context: Dict[str, Any]) -> bool:
        """
        Verifica se regola deve essere applicata basandosi su conditions
        
        Supporta:
        - condition singola: {"field": "trazione", "operator": "equals", "value": "Gearless"}
        - multiple conditions con logic: {"logic": "AND", "conditions": [...]}
        """
        rule_json = regola.rule_json
        
        if "conditions" not in rule_json:
            # Nessuna condizione = applica sempre
            return True
        
        conditions = rule_json["conditions"]
        
        # Condizione singola
        if "field" in conditions:
            return self._evaluate_condition(conditions, context)
        
        # Multiple conditions
        if "logic" in conditions:
            logic = conditions.get("logic", "AND").upper()
            sub_conditions = conditions.get("conditions", [])
            
            results = [self._evaluate_condition(cond, context) for cond in sub_conditions]
            
            if logic == "AND":
                return all(results)
            elif logic == "OR":
                return any(results)
            else:
                self.warnings.append(f"Logic operator sconosciuto: {logic}")
                return False
        
        return False
    
    def _evaluate_condition(self, condition: Dict[str, Any], context: Dict[str, Any]) -> bool:
        """Valuta singola condizione"""
        field = condition.get("field", "").lower()
        operator = condition.get("operator", "equals")
        expected_value = condition.get("value")
        
        # Ottieni valore dal context
        actual_value = context.get(field)
        
        if actual_value is None:
            return False
        
        # Valuta operator
        if operator == "equals":
            return str(actual_value).lower() == str(expected_value).lower()
        elif operator == "not_equals":
            return str(actual_value).lower() != str(expected_value).lower()
        elif operator == "contains":
            return str(expected_value).lower() in str(actual_value).lower()
        elif operator == "greater_than":
            try:
                return float(actual_value) > float(expected_value)
            except (ValueError, TypeError):
                return False
        elif operator == "less_than":
            try:
                return float(actual_value) < float(expected_value)
            except (ValueError, TypeError):
                return False
        elif operator == "greater_equal":
            try:
                return float(actual_value) >= float(expected_value)
            except (ValueError, TypeError):
                return False
        elif operator == "less_equal":
            try:
                return float(actual_value) <= float(expected_value)
            except (ValueError, TypeError):
                return False
        elif operator == "in":
            if isinstance(expected_value, list):
                return str(actual_value).lower() in [str(v).lower() for v in expected_value]
            return False
        else:
            self.warnings.append(f"Operator sconosciuto: {operator}")
            return False
    
    def _apply_rule(self, regola: Regola, preventivo: Preventivo, context: Dict[str, Any]) -> int:
        """Applica azioni della regola"""
        rule_json = regola.rule_json
        actions = rule_json.get("actions", [])
        
        materiali_aggiunti = 0
        
        for action in actions:
            action_type = action.get("action")
            
            if action_type == "add_material":
                material_data = action.get("material", {})
                if self._add_material(preventivo, material_data, regola, context):
                    materiali_aggiunti += 1
            elif action_type == "set_field":
                # TODO: implementare set_field per modificare configurazione
                pass
            else:
                self.warnings.append(f"Action type sconosciuto: {action_type}")
        
        return materiali_aggiunti
    
    def _add_material(self, preventivo: Preventivo, material_data: Dict[str, Any], 
                     regola: Regola, context: Dict[str, Any]) -> bool:
        """Aggiunge materiale al preventivo"""
        try:
            # Sostituisci parametri placeholder nel codice/descrizione
            codice = self._replace_placeholders(material_data.get("codice", ""), context)
            descrizione = self._replace_placeholders(material_data.get("descrizione", ""), context)
            
            # Verifica se materiale già esiste (evita duplicati)
            existing = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo.id,
                Materiale.codice == codice,
                Materiale.regola_id == regola.rule_id
            ).first()
            
            if existing:
                # Materiale già aggiunto da questa regola
                return False
            
            # Estrai parametri dai placeholder
            parametri = self._extract_parameters(codice, context)
            
            # Crea materiale
            materiale = Materiale(
                preventivo_id=preventivo.id,
                codice=codice,
                descrizione=descrizione,
                categoria=material_data.get("categoria"),
                quantita=material_data.get("quantita", 1.0),
                unita_misura=material_data.get("unita_misura", "pz"),
                prezzo_unitario=material_data.get("prezzo_unitario", 0.0),
                prezzo_totale=material_data.get("quantita", 1.0) * material_data.get("prezzo_unitario", 0.0),
                aggiunto_da_regola=True,
                regola_id=regola.rule_id,
                lato=material_data.get("lato"),
                note=material_data.get("note"),
                ordine=material_data.get("ordine", 0)
            )
            
            # Aggiungi parametri
            if parametri:
                for i, (nome, valore) in enumerate(parametri.items(), 1):
                    if i <= 5:
                        setattr(materiale, f"parametro{i}_nome", nome)
                        setattr(materiale, f"parametro{i}_valore", str(valore))
            
            self.db.add(materiale)
            self.db.commit()
            
            return True
            
        except Exception as e:
            self.errors.append(f"Errore aggiunta materiale {material_data.get('codice')}: {str(e)}")
            self.db.rollback()
            return False
    
    def _replace_placeholders(self, text: str, context: Dict[str, Any]) -> str:
        """Sostituisce placeholder {FIELD} nel testo con valori da context"""
        if not text:
            return text
        
        # Pattern: {FIELD} o [FIELD]
        pattern = r'\{(\w+)\}|\[(\w+)\]'
        
        def replacer(match):
            field_name = (match.group(1) or match.group(2)).lower()
            value = context.get(field_name)
            if value is not None:
                return str(value)
            return match.group(0)  # Mantieni placeholder se non trovato
        
        return re.sub(pattern, replacer, text)
    
    def _extract_parameters(self, codice: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Estrae parametri da codice parametrico es. TRAVERSO-[LUNG]"""
        parametri = {}
        
        # Pattern: [PARAM]
        pattern = r'\[(\w+)\]'
        matches = re.findall(pattern, codice)
        
        for param_name in matches:
            param_name_lower = param_name.lower()
            if param_name_lower in context:
                parametri[param_name.upper()] = context[param_name_lower]
        
        return parametri
    
    def _remove_rule_materials(self, preventivo_id: int) -> int:
        """Rimuove tutti i materiali aggiunti da regole"""
        try:
            deleted = self.db.query(Materiale).filter(
                Materiale.preventivo_id == preventivo_id,
                Materiale.aggiunto_da_regola == True
            ).delete()
            self.db.commit()
            return deleted
        except Exception as e:
            self.errors.append(f"Errore rimozione materiali: {str(e)}")
            self.db.rollback()
            return 0
