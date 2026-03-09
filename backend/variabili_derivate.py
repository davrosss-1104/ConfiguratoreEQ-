"""
variabili_derivate.py
=====================
Valutatore delle variabili derivate (Fase 1 — flat, no dipendenze tra variabili).

Viene chiamato da rule_engine.py PRIMA del Pass 1 (lookup), così le variabili
derivate sono disponibili come _vd.* nel contesto per tutte le regole.

Inoltre espone la funzione parse_posizioni_vano() che trasforma il JSON grezzo
di disposizione_vano.posizioni_elementi in campi flat leggibili dal rule engine.
"""

import json
import re
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# PARSING POSIZIONI VANO
# ─────────────────────────────────────────────────────────────────────────────

def parse_posizioni_vano(posizioni_json: Optional[str]) -> Dict[str, Any]:
    """
    Trasforma il JSON grezzo di posizioni_elementi in campi flat.

    Input JSON esempio:
      {
        "QM":    {"lato": "A", "segmento": 2, "distanza_metri": 5.0, "elemento_id": "QM"},
        "UPS":   {"lato": "INTERNO", "segmento": 4, "elemento_id": "UPS"},
        "BotI":  {"lato": "B", "segmento": 1, "elemento_id": "BotI"}
      }

    Output (campi flat aggiunti al ctx):
      vano.qm_presente        → True
      vano.qm_lato            → "A"
      vano.qm_segmento        → 2
      vano.qm_distanza        → 5.0

      vano.ups_presente       → True
      vano.ups_lato           → "INTERNO"

      vano.boti_presente      → True
      vano.boti_lato          → "B"

      vano.sirena_presente    → False   (non posizionata)
      vano.in_presente        → False

      vano.elementi_esterni   → ["QM"]          (lato A/B/C/D)
      vano.elementi_interni   → ["UPS"]
    """
    ctx: Dict[str, Any] = {}

    ELEMENTI_NOTI = ["QM", "IN", "UPS", "BotI", "Sirena", "Altro"]

    # Default: tutti non presenti
    for el in ELEMENTI_NOTI:
        key = el.lower().replace(" ", "_")
        ctx[f"vano.{key}_presente"] = False

    if not posizioni_json or posizioni_json.strip() in ("", "null", "{}"):
        ctx["vano.elementi_esterni"] = []
        ctx["vano.elementi_interni"] = []
        return ctx

    try:
        posizioni: Dict[str, Any] = json.loads(posizioni_json)
    except (json.JSONDecodeError, TypeError):
        logger.warning("parse_posizioni_vano: JSON non valido")
        ctx["vano.elementi_esterni"] = []
        ctx["vano.elementi_interni"] = []
        return ctx

    esterni = []
    interni = []

    for elemento_id, pos in posizioni.items():
        if not isinstance(pos, dict):
            continue
        key = elemento_id.lower().replace(" ", "_")
        lato = pos.get("lato", "")
        segmento = pos.get("segmento")
        distanza = pos.get("distanza_metri")

        ctx[f"vano.{key}_presente"] = True
        ctx[f"vano.{key}_lato"] = lato
        if segmento is not None:
            ctx[f"vano.{key}_segmento"] = int(segmento)
        if distanza is not None:
            ctx[f"vano.{key}_distanza"] = float(distanza)

        if lato == "INTERNO":
            interni.append(elemento_id)
        elif lato in ("A", "B", "C", "D"):
            esterni.append(elemento_id)

    ctx["vano.elementi_esterni"] = esterni
    ctx["vano.elementi_interni"] = interni

    return ctx


def parse_sbarchi_vano(sbarchi_json: Optional[str]) -> Dict[str, Any]:
    """
    Trasforma il JSON sbarchi in conteggi flat per lato.

    Input JSON esempio:
      [
        {"piano": 0, "lato_a": true, "lato_b": false, "lato_c": false, "lato_d": false},
        {"piano": 1, "lato_a": true, "lato_b": true,  "lato_c": false, "lato_d": false}
      ]

    Output:
      vano.sbarchi_lato_a  → 2
      vano.sbarchi_lato_b  → 1
      vano.sbarchi_lato_c  → 0
      vano.sbarchi_lato_d  → 0
      vano.num_sbarchi     → 3  (totale aperture)
    """
    ctx: Dict[str, Any] = {
        "vano.sbarchi_lato_a": 0,
        "vano.sbarchi_lato_b": 0,
        "vano.sbarchi_lato_c": 0,
        "vano.sbarchi_lato_d": 0,
        "vano.num_sbarchi": 0,
    }

    if not sbarchi_json or sbarchi_json.strip() in ("", "null", "[]"):
        return ctx

    try:
        sbarchi: List[Dict] = json.loads(sbarchi_json)
    except (json.JSONDecodeError, TypeError):
        return ctx

    totale = 0
    for s in sbarchi:
        if not isinstance(s, dict):
            continue
        for lato in ("a", "b", "c", "d"):
            val = s.get(f"lato_{lato}", False)
            if val:
                ctx[f"vano.sbarchi_lato_{lato}"] += 1
                totale += 1

    ctx["vano.num_sbarchi"] = totale
    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# EVALUATOR FORMULE
# ─────────────────────────────────────────────────────────────────────────────

MATH_BUILTINS = {
    "ceil", "floor", "round", "abs", "min", "max", "pow", "sqrt",
    "int", "float", "true", "false", "True", "False",
}

SAFE_CHARS = set("0123456789.+-*/() eEabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_")


def _safe_eval(expression: str) -> float:
    """Valuta espressione aritmetica in modo sicuro."""
    import math as _math
    allowed = SAFE_CHARS
    for c in expression:
        if c not in allowed:
            raise ValueError(f"Carattere non consentito '{c}' in '{expression}'")
    # Namespace sicuro
    ns = {
        "ceil":  _math.ceil,
        "floor": _math.floor,
        "round": round,
        "abs":   abs,
        "min":   min,
        "max":   max,
        "pow":   pow,
        "sqrt":  _math.sqrt,
    }
    return float(eval(expression, {"__builtins__": {}}, ns))


def evaluate_formula(
    formula: str,
    ctx: Dict[str, Any],
    parametri: List[Dict],
    nome_variabile: str = "?"
) -> Any:
    """
    Valuta una formula con:
    - Sostituzione campi dal contesto (es. corsa, dati_principali.corsa)
    - Sostituzione parametri configurabili (es. param_testa)
    - Condizionali: if(cond, val_vero, val_falso)
    - Espressioni aritmetiche sicure

    I parametri hanno la forma:
      [{"nome": "param_testa", "valore": 3.0, "descrizione": "..."}]

    La formula può essere:
      "corsa + param_testa + param_fossa + vano.qm_distanza"
      "if(tipo_trazione == 'oleodinamica', corsa * 2, corsa)"
    """
    # 1. Costruisci dizionario parametri
    params: Dict[str, Any] = {}
    for p in (parametri or []):
        nome_p = p.get("nome", "")
        val_p = p.get("valore")
        if nome_p and val_p is not None:
            try:
                params[nome_p] = float(val_p)
            except (ValueError, TypeError):
                params[nome_p] = val_p

    # 2. Gestisci condizionali if(cond, val_vero, val_falso)
    formula_elaborata = _expand_conditionals(formula, ctx, params)

    # 3. Sostituisci token con valori
    expr = _substitute_tokens(formula_elaborata, ctx, params, nome_variabile)

    # 4. Valuta
    try:
        return _safe_eval(expr)
    except Exception as e:
        raise ValueError(f"variabile '{nome_variabile}': errore valutazione '{expr}': {e}")


def _expand_conditionals(formula: str, ctx: Dict, params: Dict) -> str:
    """
    Espande if(condizione, val_vero, val_falso) prima della valutazione numerica.
    Supporta condizioni tipo:
      tipo_trazione == 'oleodinamica'
      corsa > 10
      vano.qm_presente == true
    """
    # Pattern: if(cond, val_vero, val_falso)
    # Gestione semplice: parsing manuale per evitare regex complesse con virgole annidate
    result = formula
    max_iterations = 10  # anti-loop

    for _ in range(max_iterations):
        m = re.search(r'\bif\s*\(', result)
        if not m:
            break
        start = m.start()
        # Trova le parentesi bilanciate
        depth = 0
        i = m.end() - 1  # punta alla '('
        inner_start = m.end()
        for j in range(m.end() - 1, len(result)):
            if result[j] == '(':
                depth += 1
            elif result[j] == ')':
                depth -= 1
                if depth == 0:
                    inner = result[inner_start:j]
                    end = j + 1
                    # Splitta: cond, val_vero, val_falso (rispettando virgole annidate)
                    parts = _split_args(inner)
                    if len(parts) == 3:
                        cond_str, val_vero_str, val_falso_str = parts
                        cond_val = _eval_condition(cond_str.strip(), ctx, params)
                        chosen = val_vero_str.strip() if cond_val else val_falso_str.strip()
                        result = result[:start] + chosen + result[end:]
                    break
        else:
            break  # parentesi non bilanciate

    return result


def _split_args(s: str) -> List[str]:
    """Splitta su virgola rispettando parentesi annidate."""
    parts = []
    depth = 0
    current = []
    for c in s:
        if c == '(':
            depth += 1
            current.append(c)
        elif c == ')':
            depth -= 1
            current.append(c)
        elif c == ',' and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(c)
    if current:
        parts.append(''.join(current))
    return parts


def _eval_condition(cond: str, ctx: Dict, params: Dict) -> bool:
    """
    Valuta una condizione booleana semplice.
    Supporta: ==, !=, >, <, >=, <=
    Valori: numeri, stringhe tra apici, true/false
    """
    # Operatori in ordine decrescente di lunghezza
    for op in (">=", "<=", "!=", "==", ">", "<"):
        if op in cond:
            left_s, right_s = cond.split(op, 1)
            left_val = _resolve_value(left_s.strip(), ctx, params)
            right_val = _resolve_value(right_s.strip(), ctx, params)
            try:
                lf, rf = float(left_val), float(right_val)
                if op == "==": return lf == rf
                if op == "!=": return lf != rf
                if op == ">":  return lf > rf
                if op == "<":  return lf < rf
                if op == ">=": return lf >= rf
                if op == "<=": return lf <= rf
            except (TypeError, ValueError):
                ls, rs = str(left_val).lower(), str(right_val).lower()
                if op == "==": return ls == rs
                if op == "!=": return ls != rs
            return False

    # Valore booleano diretto
    v = _resolve_value(cond, ctx, params)
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("true", "1", "sì", "si", "yes", "vero")
    if v is not None:
        try:
            return float(v) != 0
        except (ValueError, TypeError):
            pass
    return False


def _resolve_value(token: str, ctx: Dict, params: Dict) -> Any:
    """Risolve un token: stringa letterale, booleano, numero, o riferimento a ctx/params."""
    token = token.strip()

    # Stringa tra apici singoli o doppi
    if (token.startswith("'") and token.endswith("'")) or \
       (token.startswith('"') and token.endswith('"')):
        return token[1:-1]

    # Booleani
    if token.lower() == "true":
        return True
    if token.lower() == "false":
        return False

    # Numero
    try:
        return float(token)
    except ValueError:
        pass

    # Parametro
    if token in params:
        return params[token]

    # Contesto (esatto o flat)
    if token in ctx:
        return ctx[token]

    # Contesto case-insensitive
    token_lower = token.lower()
    for k, v in ctx.items():
        if k.lower() == token_lower:
            return v

    # Token non trovato: restituisce il token stesso come stringa
    # (es. "B", "D", "oleodinamica" nelle condizioni if senza virgolette)
    return token


def _substitute_tokens(formula: str, ctx: Dict, params: Dict, nome: str) -> str:
    """Sostituisce tutti i token identificatore con i loro valori numerici."""
    tokens = re.findall(r'[a-zA-Z_][a-zA-Z0-9_.]*', formula)
    tokens = sorted(set(tokens), key=len, reverse=True)

    result = formula
    for token in tokens:
        if token in MATH_BUILTINS:
            continue
        val = _resolve_value(token, ctx, params)
        # Se _resolve_value restituisce il token stesso (fallback stringa), trattalo come non trovato
        if val is None or val == token:
            logger.warning(f"variabile '{nome}': token '{token}' non trovato nel contesto, uso 0")
            result = result.replace(token, "0")
            continue
        try:
            result = result.replace(token, str(float(val)))
        except (ValueError, TypeError):
            # Valore non numerico — sostituisci con 0 per evitare errori in _safe_eval
            logger.warning(f"variabile '{nome}': token '{token}' = '{val}' non numerico, uso 0")
            result = result.replace(token, "0")

    return result


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — chiamato da rule_engine prima del Pass 1
# ─────────────────────────────────────────────────────────────────────────────

def apply_variabili_derivate(ctx: Dict[str, Any], db) -> Dict[str, Any]:
    """
    Carica le variabili derivate attive dal DB, le valuta in ordine,
    e scrive i risultati in ctx come _vd.<nome>.

    Chiamare PRIMA di Pass 1 (lookup) in evaluate_rules().
    """
    from sqlalchemy import text as sa_text


    # Parsa posizioni_elementi → vano.quadro_el_presente, vano.quadro_el_lato, ecc.
    posizioni_json = (
        ctx.get("disposizione_vano.posizioni_elementi")
        or ctx.get("posizioni_elementi")
    )
    if posizioni_json and "vano.quadro_el_presente" not in ctx:
        try:
            parsed = parse_posizioni_vano(posizioni_json)
            ctx.update(parsed)
        except Exception as e:
            logger.warning(f"apply_variabili_derivate: errore parse posizioni: {e}")

    # Parsa sbarchi
    sbarchi_json = (
        ctx.get("disposizione_vano.sbarchi")
        or ctx.get("sbarchi")
    )
    if sbarchi_json and "vano.num_sbarchi" not in ctx:
        try:
            parsed_s = parse_sbarchi_vano(sbarchi_json)
            ctx.update(parsed_s)
        except Exception as e:
            logger.warning(f"apply_variabili_derivate: errore parse sbarchi: {e}")

    try:
        rows = db.execute(sa_text(
            "SELECT nome, formula, parametri, tipo_risultato, unita_misura "
            "FROM variabili_derivate "
            "WHERE attivo = 1 "
            "ORDER BY ordine ASC, id ASC"
        )).fetchall()
    except Exception as e:
        logger.warning(f"apply_variabili_derivate: errore lettura DB: {e}")
        return ctx

    risultati: Dict[str, Any] = {}

    for row in rows:
        nome, formula, parametri_json, tipo_risultato, unita_misura = row
        try:
            parametri = json.loads(parametri_json) if parametri_json else []
        except json.JSONDecodeError:
            parametri = []

        try:
            valore = evaluate_formula(formula, ctx, parametri, nome)

            # Cast al tipo dichiarato
            if tipo_risultato == "numero":
                valore = float(valore)
            elif tipo_risultato == "intero":
                valore = int(round(float(valore)))
            elif tipo_risultato == "booleano":
                valore = bool(valore)
            else:
                valore = str(valore)

            # Scrivi nel contesto con prefisso _vd.
            ctx[f"_vd.{nome}"] = valore
            # Anche flat (compatibilità con condizioni semplici nelle regole)
            ctx[nome] = valore
            risultati[nome] = valore

            logger.debug(f"_vd.{nome} = {valore}")

        except Exception as e:
            logger.warning(f"apply_variabili_derivate: errore su '{nome}': {e}")
            ctx[f"_vd.{nome}"] = None

    if risultati:
        logger.info(f"Variabili derivate calcolate: {list(risultati.keys())}")

    return ctx
