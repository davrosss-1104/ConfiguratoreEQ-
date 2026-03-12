"""
rule_engine.py - Rule Engine v2 con lookup_multi/lookup_table/catalog_match
Two-pass: prima lookup/calc → poi materiali.
FIX: _apply_actions ora chiamato anche per lookup_rules (add_material + materials legacy).
FIX: Aggiunto supporto set_field e skip_if in evaluate_rules.
"""
from typing import List, Dict, Any, Optional, Set
from sqlalchemy.orm import Session
from sqlalchemy import text
import re, os, json, logging

logger = logging.getLogger(__name__)

CAMPI_ESCLUSI = {"id", "preventivo_id", "created_at", "updated_at"}

# Tabelle ORM dedicate → prefix + alias
# dati_principali, normative, argano, porte → ora in valori_configurazione
TABELLE_DEDICATE = {
    "disposizione_vano": {"prefix": "disposizione_vano", "aliases": []},
    "dati_commessa":     {"prefix": "dati_commessa",     "aliases": []},
}

# alias → prefix della tabella (es. "trazione" → "argano")
ALIAS_MAP = {}
for _tbl, _cfg in TABELLE_DEDICATE.items():
    for _a in _cfg["aliases"]:
        ALIAS_MAP[_a] = _cfg["prefix"]


class RuleEngine:
    def __init__(self, db: Session):
        self.db = db
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self._data_cache: Dict[str, Any] = {}

    # ====================================================================
    # CONTEXT BUILDING
    # ====================================================================
    def build_config_context(self, preventivo) -> Dict[str, Any]:
        ctx: Dict[str, Any] = {}
        pid = preventivo.id

        # 0. Defaults da campi_configuratore
        try:
            rows = self.db.execute(text(
                "SELECT codice, valore_default FROM campi_configuratore "
                "WHERE attivo=1 AND valore_default IS NOT NULL AND valore_default != '-'"
            )).fetchall()
            for r in rows:
                if r[0] and r[1]:
                    ctx[r[0]] = _conv(r[1])
        except Exception:
            pass

        # 1. Metadati preventivo
        for attr in ("tipo", "categoria", "cliente_id", "template_id"):
            v = getattr(preventivo, attr, None)
            if v is not None:
                ctx[f"preventivo_{attr}"] = v
        ctx["preventivo_id"] = pid

        # 2. Tabelle dedicate (SQL diretto)
        for tbl_name, cfg in TABELLE_DEDICATE.items():
            self._load_table_ctx(ctx, pid, tbl_name, cfg["prefix"], cfg["aliases"])

        # 3. valori_configurazione (massima priorità, sovrascrive)
        try:
            rows = self.db.execute(text(
                "SELECT sezione, codice_campo, valore FROM valori_configurazione "
                "WHERE preventivo_id = :pid"
            ), {"pid": pid}).fetchall()
            for r in rows:
                sez, campo, val = r[0], r[1], r[2]
                v = _conv(val)
                def _set(k, val, ctx=ctx):
                    existing = ctx.get(k)
                    if existing not in (None, ""):
                        # Non sovrascrivere un valore non-vuoto con uno falsy
                        existing_s = str(existing).strip().lower()
                        val_s = str(val).strip().lower() if val is not None else ""
                        if existing_s not in ("false", "0", "no", "off", "") and val_s in ("false", "0", "no", "off", ""):
                            return
                        if existing_s not in (None, "") and val_s == "":
                            return
                    ctx[k] = val
                if sez:
                    _set(f"{sez}.{campo}", v)
                    # propaga alias
                    target = ALIAS_MAP.get(sez)
                    if target:
                        _set(f"{target}.{campo}", v)
                    for t2, c2 in TABELLE_DEDICATE.items():
                        if c2["prefix"] == sez:
                            for a in c2["aliases"]:
                                _set(f"{a}.{campo}", v)
                _set(campo, v)  # chiave piatta
        except Exception as e:
            self.warnings.append(f"valori_configurazione: {e}")

        # 4. JSON legacy
        cj = getattr(preventivo, "configurazione", None)
        if cj and isinstance(cj, dict):
            for k, v in cj.items():
                if k.lower() not in ctx:
                    ctx[k.lower()] = v

        return ctx

    def _load_table_ctx(self, ctx, pid, tbl_name, prefix, aliases):
        try:
            cols = self._table_columns(tbl_name)
            if not cols:
                return
            row = self.db.execute(
                text(f"SELECT {','.join(cols)} FROM {tbl_name} WHERE preventivo_id = :pid"),
                {"pid": pid}
            ).fetchone()
            if not row:
                return
            for i, col in enumerate(cols):
                if col in CAMPI_ESCLUSI:
                    continue
                v = row[i]
                if v is None:
                    continue
                v = _conv(v)
                ctx[f"{prefix}.{col}"] = v
                ctx[col] = v  # piatto
                for a in aliases:
                    ctx[f"{a}.{col}"] = v
        except Exception:
            pass

    def _table_columns(self, tbl):
        try:
            rows = self.db.execute(text(f"PRAGMA table_info({tbl})")).fetchall()
            if rows:
                return [r[1] for r in rows]
        except Exception:
            pass
        try:
            rows = self.db.execute(text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_NAME=:t ORDER BY ORDINAL_POSITION"
            ), {"t": tbl}).fetchall()
            if rows:
                return [r[0] for r in rows]
        except Exception:
            pass
        return []

    # ====================================================================
    # FIELD RESOLUTION (con alias chain)
    # ====================================================================
    def _resolve(self, field: str, ctx: Dict) -> Any:
        if not field:
            return None
        # 1. Esatto
        v = ctx.get(field)
        if v is not None and v != "":
            return v
        # 2. Lowercase
        v = ctx.get(field.lower())
        if v is not None and v != "":
            return v
        # 3. Alias sezione
        if "." in field:
            sez, campo = field.split(".", 1)
            # sez → prefix
            target = ALIAS_MAP.get(sez)
            if target:
                v = ctx.get(f"{target}.{campo}")
                if v is not None:
                    return v
            # prefix → alias
            for t, c in TABELLE_DEDICATE.items():
                if sez == c["prefix"]:
                    for a in c["aliases"]:
                        v = ctx.get(f"{a}.{campo}")
                        if v is not None:
                            return v
            # piatto
            v = ctx.get(campo)
            if v is not None:
                return v
        else:
            # cerca in qualsiasi sezione
            for k, v2 in ctx.items():
                if "." in k and k.split(".", 1)[1] == field:
                    return v2
        return None

    # ====================================================================
    # RULE LOADING
    # ====================================================================
    def load_all_rules(self) -> List[Dict]:
        db_rules = self._load_rules_db()
        file_rules = self._load_rules_files()
        db_ids = {r["id"] for r in db_rules}
        all_r = db_rules + [r for r in file_rules if r["id"] not in db_ids]
        all_r.sort(key=lambda r: r.get("priority", r.get("priorita", 100)))
        return all_r

    def _load_rules_db(self):
        try:
            rows = self.db.execute(text(
                "SELECT rule_id, nome, rule_json, priorita, categoria FROM regole WHERE attiva=1 ORDER BY priorita"
            )).fetchall()
            rules = []
            for r in rows:
                rj = json.loads(r[2]) if isinstance(r[2], str) else (r[2] or {})
                rj.setdefault("id", r[0])
                rj.setdefault("priority", r[3] or 100)
                rj["source"] = "db"
                rules.append(rj)
            return rules
        except Exception:
            return []

    def _load_rules_files(self):
        rules = []
        loaded = set()
        # 1. ./rules/
        if os.path.exists("./rules"):
            for fn in sorted(os.listdir("./rules")):
                if fn.endswith(".json"):
                    try:
                        with open(f"./rules/{fn}", "r", encoding="utf-8") as f:
                            r = json.load(f)
                        r.setdefault("id", fn.replace(".json", ""))
                        r["source"] = "file"
                        rules.append(r)
                        loaded.add(r["id"])
                    except Exception as e:
                        self.errors.append(f"Err {fn}: {e}")
        # 2. root rule_*.json
        for fn in sorted(os.listdir(".")):
            if not fn.startswith("rule_") or not fn.endswith(".json"):
                continue
            rid = fn.replace("rule_", "").replace(".json", "")
            if rid in loaded:
                continue
            try:
                with open(fn, "r", encoding="utf-8") as f:
                    r = json.load(f)
                r.setdefault("id", rid)
                r["source"] = "file"
                rules.append(r)
                loaded.add(rid)
            except Exception as e:
                self.errors.append(f"Err {fn}: {e}")
        return rules

    # ====================================================================
    # DATA TABLE LOADING (./data/ + root)
    # ====================================================================
    def _load_data(self, nome: str) -> Optional[Dict]:
        if nome in self._data_cache:
            return self._data_cache[nome]

        # Cerca in più directory
        search_paths = [
            f"./data/{nome}.json",
            f"./{nome}.json",
            f"./rules/data/{nome}.json",
        ]
        # Cerca anche in sottocartelle di ./data/
        data_dir = "./data"
        if os.path.isdir(data_dir):
            for sub in os.listdir(data_dir):
                subpath = os.path.join(data_dir, sub)
                if os.path.isdir(subpath):
                    candidate = os.path.join(subpath, f"{nome}.json")
                    if candidate not in search_paths:
                        search_paths.append(candidate)

        # Carica tutti i candidati trovati, preferisci lookup_range
        candidates = []
        for path in search_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        tbl = json.load(f)
                    candidates.append((path, tbl))
                except Exception as e:
                    self.errors.append(f"Data table {path}: {e}")

        if not candidates:
            self.errors.append(f"Data table '{nome}' non trovata (cercato in: {search_paths[:3]})")
            return None

        # Se c'è un solo candidato, usalo
        if len(candidates) == 1:
            path, tbl = candidates[0]
            self._data_cache[nome] = tbl
            return tbl

        # Se ci sono più candidati, preferisci lookup_range con partizioni
        for path, tbl in candidates:
            if tbl.get("tipo") == "lookup_range" and "partizioni" in tbl:
                self.warnings.append(f"Data table '{nome}': preferito {path} (lookup_range)")
                self._data_cache[nome] = tbl
                return tbl

        # Altrimenti prendi il primo
        path, tbl = candidates[0]
        self._data_cache[nome] = tbl
        return tbl

    # ====================================================================
    # CONDITION EVALUATION
    # ====================================================================
    _TRUTHY = {"true", "1", "yes", "sì", "si", "on", "vero"}
    _FALSY  = {"false", "0", "no", "off", "falso", ""}

    def _normalize_bool(self, val) -> str:
        """Normalizza valori booleani per confronto: true/1/yes → 'true', false/0/no → 'false'."""
        s = str(val).strip().lower()
        if s in self._TRUTHY:
            return "true"
        if s in self._FALSY:
            return "false"
        return s

    def _eval_cond(self, c: Dict, ctx: Dict) -> bool:
        field = c.get("field", "")
        op = c.get("operator", "equals")
        exp = c.get("value")
        actual = self._resolve(field, ctx)

        if actual is None or (isinstance(actual, str) and not actual.strip()):
            return op == "is_empty"

        try:
            if op == "equals":
                # Prima confronto standard
                if str(actual).lower() == str(exp).lower():
                    return True
                # Poi confronto booleano normalizzato (true/1/yes ↔ false/0/no)
                return self._normalize_bool(actual) == self._normalize_bool(exp)
            if op == "not_equals":
                if str(actual).lower() != str(exp).lower():
                    na, ne = self._normalize_bool(actual), self._normalize_bool(exp)
                    # Se sono entrambi bool-like, confronta normalizzati
                    if na in ("true", "false") and ne in ("true", "false"):
                        return na != ne
                    return True
                return False
            if op == "contains":     return str(exp).lower() in str(actual).lower()
            if op == "not_contains": return str(exp).lower() not in str(actual).lower()
            if op == "starts_with":  return str(actual).lower().startswith(str(exp).lower())
            if op == "greater_than": return float(actual) > float(exp)
            if op == "less_than":    return float(actual) < float(exp)
            if op == "greater_equal":return float(actual) >= float(exp)
            if op == "less_equal":   return float(actual) <= float(exp)
            if op == "in":           return isinstance(exp, list) and str(actual).lower() in [str(v).lower() for v in exp]
            if op == "not_in":       return not isinstance(exp, list) or str(actual).lower() not in [str(v).lower() for v in exp]
            if op == "is_empty":     return False  # se arriviamo qui actual ha valore
            if op == "is_not_empty": return True
        except (ValueError, TypeError):
            return False
        return False

    def should_apply(self, rule, ctx) -> bool:
        conds = rule.get("conditions")
        if not conds:
            return True
        if isinstance(conds, list):
            if len(conds) == 0:
                return True
            return all(self._eval_cond(c, ctx) for c in conds)
        if isinstance(conds, dict):
            if "field" in conds:
                return self._eval_cond(conds, ctx)
            logic = conds.get("logic", "AND").upper()
            subs = conds.get("conditions", [])
            results = [self._eval_cond(c, ctx) for c in subs]
            return all(results) if logic == "AND" else any(results)
        return False

    # ====================================================================
    # SKIP_IF EVALUATION (per singola action)
    # ====================================================================
    def _eval_skip_if(self, skip_expr: str, ctx: Dict) -> bool:
        """
        Valuta l'espressione skip_if di un'azione.
        Formati supportati:
          - "campo is_empty"         → True se campo è None/vuoto
          - "campo is_not_empty"     → True se campo ha valore
          - "campo == valore"        → confronto stringa
          - "campo != valore"        → diverso
          - "campo > valore"         → confronto numerico
          - "campo < valore"         → confronto numerico
          - "campo >= valore"        → confronto numerico
          - "campo <= valore"        → confronto numerico
        """
        if not skip_expr or not skip_expr.strip():
            return False

        expr = skip_expr.strip()

        # "campo is_empty"
        if expr.endswith(" is_empty"):
            field = expr.replace(" is_empty", "").strip()
            v = self._resolve(field, ctx)
            return v is None or (isinstance(v, str) and not v.strip())

        # "campo is_not_empty"
        if expr.endswith(" is_not_empty"):
            field = expr.replace(" is_not_empty", "").strip()
            v = self._resolve(field, ctx)
            return v is not None and (not isinstance(v, str) or v.strip() != "")

        # Operatori di confronto
        for op_str, op_fn in [
            (">=", lambda a, b: float(a) >= float(b)),
            ("<=", lambda a, b: float(a) <= float(b)),
            ("!=", lambda a, b: str(a).lower() != str(b).lower()),
            ("==", lambda a, b: str(a).lower() == str(b).lower()),
            (">",  lambda a, b: float(a) > float(b)),
            ("<",  lambda a, b: float(a) < float(b)),
        ]:
            if op_str in expr:
                parts = expr.split(op_str, 1)
                if len(parts) == 2:
                    field = parts[0].strip()
                    expected = parts[1].strip()
                    actual = self._resolve(field, ctx)
                    if actual is None:
                        return False
                    try:
                        return op_fn(actual, expected)
                    except (ValueError, TypeError):
                        return False

        return False

    # ====================================================================
    # SET_FIELD ACTION
    # ====================================================================
    def _exec_set_field(self, action: Dict, ctx: Dict):
        """Esegue un'azione set_field: imposta un valore nel context."""
        field = action.get("field", "")
        if not field:
            return

        # Modalità: valore diretto, da altro campo, o somma
        if "value_from" in action:
            # Copia da altro campo
            src = action["value_from"]
            v = self._resolve(src, ctx)
            if v is not None:
                multiply = action.get("multiply_by")
                if multiply is not None:
                    try:
                        v = float(v) * float(multiply)
                    except (ValueError, TypeError):
                        pass
                add = action.get("add")
                if add is not None:
                    try:
                        v = float(v) + float(add)
                    except (ValueError, TypeError):
                        pass
                ctx[field] = v
        elif "add_value" in action:
            # Somma al valore esistente
            existing = self._resolve(field, ctx) or 0
            try:
                ctx[field] = float(existing) + float(action["add_value"])
            except (ValueError, TypeError):
                pass
        else:
            # Valore diretto (può contenere placeholder {{campo}})
            val = action.get("value", "")
            if isinstance(val, str) and "{{" in val:
                val = self._replace_ph(val, ctx)
            ctx[field] = _conv(val) if isinstance(val, str) else val

    # ====================================================================
    # LOOKUP_TABLE (tipo: lookup_range / constants)
    # ====================================================================
    def _exec_lookup_table(self, action: Dict, ctx: Dict) -> Dict:
        tbl_name = action.get("tabella", "")
        input_field = action.get("input_field", "")
        prefix = action.get("output_prefix", f"_calc.{tbl_name}.")
        partition_field = action.get("partition_field")

        tbl = self._load_data(tbl_name)
        if not tbl:
            return {}

        input_val = self._resolve(input_field, ctx)
        if input_val is None:
            self.warnings.append(f"lookup_table({tbl_name}): campo '{input_field}' non nel context")
            return {}

        tipo = tbl.get("tipo", "")
        if tipo == "lookup_range":
            return self._range_lookup(tbl, input_val, partition_field, prefix, ctx)
        elif tipo == "constants":
            return self._constants_lookup(tbl, input_val, prefix, ctx)
        else:
            self.warnings.append(f"lookup_table: tipo '{tipo}' non supportato")
            return {}

    # ====================================================================
    # LOOKUP_MULTI (multi-key, works on lookup_range + flat)
    # ====================================================================
    def _exec_lookup_multi(self, action: Dict, ctx: Dict) -> Dict:
        tbl_name = action.get("tabella", "")
        input_fields = action.get("input_fields", [])
        prefix = action.get("output_prefix", f"_calc.{tbl_name}.")

        tbl = self._load_data(tbl_name)
        if not tbl:
            return {}

        tipo = tbl.get("tipo", "")
        if tipo == "lookup_range":
            return self._lookup_multi_on_range(tbl, tbl_name, input_fields, prefix, ctx)
        elif tipo == "lookup_multi":
            return self._lookup_multi_flat(tbl, input_fields, prefix, ctx)
        else:
            self.warnings.append(f"lookup_multi({tbl_name}): tipo '{tipo}', provo auto-detect")
            if "partizioni" in tbl:
                return self._lookup_multi_on_range(tbl, tbl_name, input_fields, prefix, ctx)
            elif "records" in tbl:
                return self._lookup_multi_flat(tbl, input_fields, prefix, ctx)
            self.warnings.append(f"lookup_multi({tbl_name}): formato non riconosciuto")
            return {}

    def _lookup_multi_on_range(self, tbl, tbl_name, input_fields, prefix, ctx) -> Dict:
        """Adatta lookup_multi su data table lookup_range partizionata."""
        partizioni = tbl.get("partizioni", {})
        part_key_name = tbl.get("partizionato_per", "")

        if not partizioni:
            self.warnings.append(f"lookup_multi({tbl_name}): nessuna partizione")
            return {}

        # Identifica: quale input è il range numerico, quale dà la partizione
        range_val = None
        partition_val = None

        for inf in input_fields:
            match_type = inf.get("match", "exact")
            resolved = self._resolve_input_field(inf, ctx)

            if resolved is None:
                fld = inf.get("field", "") or str(inf.get("fields", []))
                self.warnings.append(f"lookup_multi({tbl_name}): campo '{fld}' non nel context")
                return {}

            if match_type == "lte":
                range_val = resolved
            elif match_type == "exact":
                # Il campo exact potrebbe essere composito (tipo_avviamento_freq)
                # Devo identificare quale sotto-campo corrisponde alla partizione
                if inf.get("type") == "composite":
                    for f in inf.get("fields", []):
                        v = self._resolve(f, ctx)
                        if v is None:
                            continue
                        vs = str(v).strip()

                        # 1. Match diretto contro partizioni
                        pk_match = self._fuzzy_match_partition(vs, partizioni)
                        if pk_match:
                            partition_val = pk_match
                            break

                        # 2. Se il nome campo corrisponde a partizionato_per
                        if part_key_name and "." in f:
                            fname = f.split(".")[-1]
                            if (fname == part_key_name
                                or fname.replace("_", "") == part_key_name.replace("_", "")
                                or part_key_name in fname
                                or fname in part_key_name):
                                pk_match = self._fuzzy_match_partition(vs, partizioni)
                                if pk_match:
                                    partition_val = pk_match
                                    break
                                # Ultimo tentativo: estrai solo i numeri
                                nums = ''.join(c for c in vs if c.isdigit())
                                if nums and nums in partizioni:
                                    partition_val = nums
                                    break
                else:
                    vs = str(resolved).strip()
                    pk_match = self._fuzzy_match_partition(vs, partizioni)
                    if pk_match:
                        partition_val = pk_match

        # Fallback: cerca nel context direttamente per partizionato_per
        if partition_val is None and part_key_name:
            pv = self._resolve(part_key_name, ctx)
            if pv is not None:
                pvs = str(pv).strip()
                pk_match = self._fuzzy_match_partition(pvs, partizioni)
                if pk_match:
                    partition_val = pk_match
                else:
                    # Estrai numeri
                    nums = ''.join(c for c in pvs if c.isdigit())
                    if nums and nums in partizioni:
                        partition_val = nums

        if partition_val is None:
            if len(partizioni) == 1:
                partition_val = list(partizioni.keys())[0]
            else:
                self.warnings.append(
                    f"lookup_multi({tbl_name}): partizione non determinata. "
                    f"Chiave: '{part_key_name}', disponibili: {list(partizioni.keys())}"
                )
                return {}

        if range_val is None:
            self.warnings.append(f"lookup_multi({tbl_name}): nessun campo numerico (match:lte)")
            return {}

        return self._range_lookup(tbl, range_val, None, prefix, ctx,
                                   forced_partition=partition_val)

    def _fuzzy_match_partition(self, value: str, partizioni: Dict) -> Optional[str]:
        """
        Tenta di matchare un valore contro le chiavi delle partizioni.
        Strategie (in ordine):
        1. Match esatto
        2. Case-insensitive
        3. Il valore inizia con la chiave partizione (es. "50 Hz (400V)" → "50")
        4. La chiave è contenuta nel valore
        5. Estrai prefisso numerico dal valore
        """
        vs = value.strip()
        vsl = vs.lower()

        # 1. Esatto
        if vs in partizioni:
            return vs

        # 2. Case-insensitive
        for pk in partizioni:
            if str(pk).lower() == vsl:
                return str(pk)

        # 3. Valore inizia con chiave partizione
        for pk in partizioni:
            pks = str(pk)
            if vs.startswith(pks + " ") or vs.startswith(pks + "(") or vs.startswith(pks + "_"):
                return pks

        # 4. Chiave contenuta nel valore (solo se la chiave è abbastanza lunga o numerica)
        for pk in partizioni:
            pks = str(pk)
            if len(pks) >= 2 and pks in vs:
                return pks

        # 5. Estrai primo numero dal valore
        nums = re.match(r'(\d+)', vs)
        if nums:
            n = nums.group(1)
            if n in partizioni:
                return n

        return None

    def _lookup_multi_flat(self, tbl, input_fields, prefix, ctx) -> Dict:
        """Lookup su records piatti. Supporta materiali embedded nei record."""
        records = tbl.get("records", [])
        if not records:
            self.warnings.append("lookup_multi flat: nessun record")
            return {}

        inputs = []
        has_lte = False
        lte_col = ""
        for inf in input_fields:
            val = self._resolve_input_field(inf, ctx)
            if val is None:
                fld = inf.get("field", "") or str(inf.get("fields", []))
                self.warnings.append(f"lookup_multi flat: campo '{fld}' non nel context")
                return {}
            inputs.append((inf, val))
            if inf.get("match") == "lte":
                has_lte = True
                lte_col = inf.get("colonna_tabella", "")

        # Ordina per colonna lte (ascendente) per garantire match "ceiling" corretto
        if has_lte and lte_col:
            try:
                records = sorted(records, key=lambda r: float(r.get(lte_col, 0) or 0))
            except (ValueError, TypeError):
                pass

        for rec in records:
            if self._record_matches(rec, inputs):
                written = self._write_record(rec, prefix, ctx)
                # Salva materiali embedded nel record per processing successivo
                if rec.get("materiali"):
                    pending_key = f"_pending_materials"
                    existing = ctx.get(pending_key, [])
                    ctx[pending_key] = existing + rec["materiali"]
                    print(f"[LOOKUP_MULTI] Found {len(rec['materiali'])} embedded materiali in matched record")
                return written

        self.warnings.append("lookup_multi flat: nessun match")
        return {}

    def _resolve_input_field(self, inf, ctx):
        if inf.get("type") == "composite":
            parts = []
            for f in inf.get("fields", []):
                v = self._resolve(f, ctx)
                if v is None:
                    return None
                parts.append(str(v))
            return inf.get("separator", "_").join(parts)
        return self._resolve(inf.get("field", ""), ctx)

    def _record_matches(self, rec, inputs):
        for inf, val in inputs:
            col = inf.get("colonna_tabella", "")
            match_type = inf.get("match", "exact")
            rv = rec.get(col)
            if rv is None:
                return False
            try:
                if match_type == "exact":
                    if str(rv).lower() != str(val).lower():
                        return False
                elif match_type == "lte":
                    if float(val) > float(rv):
                        return False
            except (ValueError, TypeError):
                return False
        return True

    def _write_record(self, rec, prefix, ctx):
        written = {}
        for section in ("output", "articoli"):
            for k, v in rec.get(section, {}).items():
                key = f"{prefix}{k}"
                ctx[key] = v
                written[key] = v
        # campi diretti (non-meta)
        skip = {"output", "articoli", "materiali", "da", "a", "_meta"}
        for k, v in rec.items():
            if k not in skip and not k.startswith("_"):
                key = f"{prefix}{k}"
                if key not in ctx:
                    ctx[key] = v
                    written[key] = v
        return written

    # ====================================================================
    # RANGE LOOKUP (shared logic)
    # ====================================================================
    def _range_lookup(self, tbl, input_val, partition_field, prefix, ctx,
                       forced_partition=None) -> Dict:
        try:
            num = float(input_val)
        except (ValueError, TypeError):
            self.warnings.append(f"range_lookup: '{input_val}' non numerico")
            return {}

        partizioni = tbl.get("partizioni", {})
        if not partizioni:
            self.warnings.append("range_lookup: nessuna partizione")
            return {}

        # Scegli partizione
        if forced_partition:
            pk = forced_partition
        elif partition_field:
            pv = self._resolve(partition_field, ctx)
            if pv is None:
                self.warnings.append(f"range_lookup: '{partition_field}' non nel context")
                return {}
            pvs = str(pv).strip()
            pk_match = self._fuzzy_match_partition(pvs, partizioni)
            if pk_match:
                pk = pk_match
            else:
                # Ultimo tentativo: estrai numeri
                nums = ''.join(c for c in pvs if c.isdigit())
                if nums and nums in partizioni:
                    pk = nums
                else:
                    pk = pvs  # lascia fallire sotto
        elif len(partizioni) == 1:
            pk = list(partizioni.keys())[0]
        else:
            self.warnings.append(f"range_lookup: {len(partizioni)} partizioni, nessun campo specificato")
            return {}

        # Case-insensitive match
        ranges = partizioni.get(pk)
        if ranges is None:
            for k, v in partizioni.items():
                if str(k).lower() == pk.lower():
                    ranges = v
                    break
        if ranges is None:
            self.warnings.append(f"range_lookup: partizione '{pk}' non trovata ({list(partizioni.keys())})")
            return {}

        # Trova range [da, a)
        matched = None
        for entry in ranges:
            da = entry.get("da")
            a = entry.get("a")
            if (da is None or num >= float(da)) and (a is None or num < float(a)):
                matched = entry
                break

        # Fallback "ceiling": se il valore è sotto il minimo della tabella,
        # prendi la prima riga (il range più piccolo che copre valori superiori)
        if not matched and ranges:
            # Ordina per 'da' crescente e prendi il primo
            sorted_ranges = sorted(ranges, key=lambda e: float(e.get("da", 0) or 0))
            first_da = float(sorted_ranges[0].get("da", 0) or 0)
            if num < first_da:
                matched = sorted_ranges[0]
                self.warnings.append(
                    f"range_lookup: {num} sotto il minimo ({first_da}) in partizione '{pk}' "
                    f"→ usato primo range (ceiling)"
                )

        if not matched:
            self.warnings.append(f"range_lookup: nessun range per {num} in partizione '{pk}'")
            return {}

        # Scrivi output + articoli
        written = {}
        for section in ("output", "articoli"):
            for k, v in matched.get(section, {}).items():
                key = f"{prefix}{k}"
                ctx[key] = v
                written[key] = v

        return written

    # ====================================================================
    # CONSTANTS LOOKUP
    # ====================================================================
    def _constants_lookup(self, tbl, input_val, prefix, ctx) -> Dict:
        valori = tbl.get("valori", {})
        key = str(input_val).strip()
        entry = valori.get(key)
        if entry is None:
            for k, v in valori.items():
                if str(k).lower() == key.lower():
                    entry = v
                    break
        if entry is None:
            self.warnings.append(f"constants: '{key}' non trovata")
            return {}

        written = {}
        if isinstance(entry, dict):
            for k, v in entry.items():
                ck = f"{prefix}{k}"
                ctx[ck] = v
                written[ck] = v
        else:
            ck = f"{prefix}value"
            ctx[ck] = entry
            written[ck] = entry
        return written

    # ====================================================================
    # CATALOG_MATCH
    # ====================================================================
    def _exec_catalog_match(self, action: Dict, ctx: Dict) -> Dict:
        tbl_name = action.get("tabella", "")
        criteri = action.get("criteri_fissi", [])
        ordinamento = action.get("ordinamento", {})
        output_map = action.get("output", {})

        tbl = self._load_data(tbl_name)
        if not tbl or tbl.get("tipo") != "catalog":
            self.warnings.append(f"catalog_match: '{tbl_name}' non catalog")
            return {}

        records = list(tbl.get("records", []))
        if ordinamento:
            col = ordinamento.get("colonna", "")
            desc = ordinamento.get("direzione", "ASC").upper() == "DESC"
            try:
                records.sort(key=lambda r: (r.get(col) is None, r.get(col, "")), reverse=desc)
            except Exception:
                pass

        matched = None
        for rec in records:
            if all(self._criterio_ok(rec, c, ctx) for c in criteri):
                matched = rec
                break

        if not matched:
            self.warnings.append(f"catalog_match: nessun match in '{tbl_name}'")
            return {}

        written = {}
        if output_map:
            for ck, col in output_map.items():
                v = matched.get(col)
                if v is not None:
                    ctx[ck] = v
                    written[ck] = v
        else:
            prefix = f"_calc.{tbl_name}."
            for k, v in matched.items():
                ck = f"{prefix}{k}"
                ctx[ck] = v
                written[ck] = v
        return written

    def _criterio_ok(self, rec, c, ctx):
        col = c.get("colonna", "")
        op = c.get("operatore", "==")
        campo = c.get("campo")
        val_spec = c.get("valore")
        val = self._resolve(campo, ctx) if campo else val_spec
        rv = rec.get(col)
        if rv is None or val is None:
            return False
        try:
            if op in ("==", "=", "equals"):   return str(rv).lower() == str(val).lower()
            if op in (">=", "gte"):            return float(rv) >= float(val)
            if op in ("<=", "lte"):            return float(rv) <= float(val)
            if op in (">", "gt"):              return float(rv) > float(val)
            if op in ("<", "lt"):              return float(rv) < float(val)
        except (ValueError, TypeError):
            return False
        return False

    # ====================================================================
    # MATERIALS
    # ====================================================================
    def _add_material(self, preventivo, mat_data, rule_id, ctx) -> bool:
        """Aggiunge materiale via SQL diretto (bypassa problemi ORM)."""
        codice = ""
        try:
            codice = self._replace_ph(mat_data.get("codice", ""), ctx)
            desc = self._replace_ph(mat_data.get("descrizione", ""), ctx)

            if "{{" in codice or not codice.strip():
                self.warnings.append(f"Skip materiale: codice '{codice}' non risolto (regola {rule_id})")
                return False

            # Check duplicato
            existing = self.db.execute(text(
                "SELECT id FROM materiali WHERE preventivo_id=:pid AND codice=:cod AND regola_id=:rid"
            ), {"pid": preventivo.id, "cod": codice, "rid": rule_id}).fetchone()
            if existing:
                return False

            quantita_raw = mat_data.get("quantita", 1)
            if isinstance(quantita_raw, str):
                try:
                    float(quantita_raw)  # è un numero stringa tipo "1" o "2.5"
                except (ValueError, TypeError):
                    # È un riferimento a campo ctx (es. "_vd.lunghezza_cavo_quadro")
                    quantita_raw = ctx.get(quantita_raw) or ctx.get(f"_vd.{quantita_raw}", 1)
            q = float(quantita_raw) if quantita_raw is not None else 1.0
            pu = float(mat_data.get("prezzo_unitario", 0))
            if pu == 0 and codice:
                pu = self._lookup_prezzo(codice)

            self.db.execute(text("""
                INSERT INTO materiali 
                    (preventivo_id, codice, descrizione, categoria, quantita, 
                     prezzo_unitario, prezzo_totale, aggiunto_da_regola, regola_id, note)
                VALUES 
                    (:pid, :cod, :desc, :cat, :qty, :pu, :pt, 1, :rid, :note)
            """), {
                "pid": preventivo.id, "cod": codice, "desc": desc,
                "cat": mat_data.get("categoria", "Materiale Automatico"),
                "qty": q, "pu": pu, "pt": q * pu,
                "rid": rule_id, "note": mat_data.get("note"),
            })
            return True
        except Exception as e:
            self.errors.append(f"Errore materiale '{codice}': {e}")
            print(f"[ADD_MAT] EXCEPTION: '{codice}' → {type(e).__name__}: {e}")
            return False

    def _lookup_prezzo(self, codice):
        try:
            r = self.db.execute(text(
                "SELECT prezzo_vendita FROM articoli_bom WHERE codice=:c"
            ), {"c": codice}).fetchone()
            return float(r[0]) if r and r[0] else 0.0
        except Exception:
            return 0.0

    def _replace_ph(self, text_val, ctx):
        if not text_val or "{{" not in text_val:
            return text_val or ""
        def repl(m):
            fn = m.group(1)
            v = self._resolve(fn, ctx)
            return str(v) if v is not None else m.group(0)
        return re.sub(r'\{\{([\w.]+)\}\}', repl, text_val)

    def _apply_actions(self, rule, preventivo, ctx) -> int:
        """Processa TUTTE le azioni di una regola: set_field, add_material, legacy materials."""
        added = 0
        rid = rule.get("id", "unknown")

        # 1. Legacy materials
        for mat in rule.get("materials", []):
            if self._add_material(preventivo, mat, rid, ctx):
                added += 1

        # 2. Actions
        for action in rule.get("actions", []):
            at = action.get("action", "")

            # Skip_if check
            skip_expr = action.get("skip_if")
            if skip_expr and self._eval_skip_if(skip_expr, ctx):
                continue

            if at == "add_material":
                # Supporta sia formato con wrapper {"material":{...}} sia formato flat {"codice":..., "quantita":...}
                mat_data = action.get("material") or {k: v for k, v in action.items() if k != "action"}
                if self._add_material(preventivo, mat_data, rid, ctx):
                    added += 1
            elif at == "set_field":
                self._exec_set_field(action, ctx)
            # lookup_table/lookup_multi/catalog_match sono già eseguiti nel Pass 1
            # quindi qui non li rieseguiamo

        return added

    def _add_materials_from_value_mappings(self, rule, preventivo, ctx) -> int:
        """
        Dopo un lookup, scansiona tutti i valori _calc.* e per ognuno che
        ha un mapping in _value_mappings con tipo='articolo', aggiunge il materiale.
        """
        vm = rule.get("_value_mappings", {})
        if not vm:
            print(f"[VM] No _value_mappings in rule")
            return 0

        rid = rule.get("id", "unknown")
        added = 0

        # Raccogli tutti i valori scritti dal lookup
        calc_keys = {k: v for k, v in ctx.items() if k.startswith("_calc.")}
        print(f"[VM] {rid}: {len(calc_keys)} _calc keys, {len(vm)} value_mappings")
        print(f"[VM]   VM keys: {list(vm.keys())}")
        
        for ctx_key, ctx_val in calc_keys.items():
            val_str = str(ctx_val).strip()
            mapping = vm.get(val_str)
            if mapping and mapping.get("tipo") == "articolo":
                print(f"[VM]   MATCH: {ctx_key}={val_str} → {len(mapping.get('articoli', []))} articoli")
                # Multi-articolo
                articoli_list = mapping.get("articoli", [])
                if articoli_list:
                    for art in articoli_list:
                        mat_data = {
                            "codice": art.get("codice_articolo", art.get("codice", "")),
                            "descrizione": art.get("descrizione_articolo", art.get("descrizione", "")),
                            "quantita": art.get("quantita", 1),
                            "categoria": "Materiale Automatico (lookup)",
                        }
                        ok = self._add_material(preventivo, mat_data, rid, ctx)
                        print(f"[VM]     add {mat_data['codice']}: {'OK' if ok else 'SKIP/FAIL'}")
                        if ok:
                            added += 1
                else:
                    codice = mapping.get("codice_articolo", mapping.get("codice", ""))
                    if codice:
                        mat_data = {
                            "codice": codice,
                            "descrizione": mapping.get("descrizione_articolo", mapping.get("descrizione", "")),
                            "quantita": 1,
                            "categoria": "Materiale Automatico (lookup)",
                        }
                        ok = self._add_material(preventivo, mat_data, rid, ctx)
                        print(f"[VM]     add {codice}: {'OK' if ok else 'SKIP/FAIL'}")
                        if ok:
                            added += 1

        return added

    def _add_materials_from_matched_records(self, rule, preventivo, ctx) -> int:
        """
        Processa i materiali embedded nei record della data table matchata.
        Questi vengono salvati in ctx['_pending_materials'] da _lookup_multi_flat.
        """
        pending = ctx.get("_pending_materials", [])
        if not pending:
            return 0

        rid = rule.get("id", "unknown")
        added = 0
        print(f"[RECORD_MAT] {rid}: {len(pending)} materiali pending da record")

        for mat_data in pending:
            # I materiali da record hanno già codice, descrizione, quantita, categoria
            ok = self._add_material(preventivo, mat_data, rid, ctx)
            print(f"[RECORD_MAT]   add {mat_data.get('codice', '?')}: {'OK' if ok else 'SKIP/FAIL'}")
            if ok:
                added += 1

        # Pulisci pending per evitare re-processing
        ctx.pop("_pending_materials", None)
        return added

    def _simulate_value_mapping_materials(self, rule, ctx) -> list:
        """Test-mode: simula quali materiali verrebbero aggiunti da _value_mappings."""
        vm = rule.get("_value_mappings", {})
        if not vm:
            return []

        would_add = []
        for ctx_key, ctx_val in ctx.items():
            if not ctx_key.startswith("_calc."):
                continue
            val_str = str(ctx_val).strip()
            mapping = vm.get(val_str)
            if not mapping or mapping.get("tipo") != "articolo":
                continue

            articoli_list = mapping.get("articoli", [])
            if articoli_list:
                for art in articoli_list:
                    would_add.append({
                        "source": "value_mapping",
                        "ctx_key": ctx_key,
                        "ctx_value": val_str,
                        "codice": art.get("codice_articolo", art.get("codice", "")),
                        "descrizione": art.get("descrizione_articolo", art.get("descrizione", "")),
                        "quantita": art.get("quantita", 1),
                    })
            else:
                would_add.append({
                    "source": "value_mapping",
                    "ctx_key": ctx_key,
                    "ctx_value": val_str,
                    "codice": mapping.get("codice_articolo", mapping.get("codice", "")),
                    "descrizione": mapping.get("descrizione_articolo", mapping.get("descrizione", "")),
                    "quantita": 1,
                })

        return would_add

    def _simulate_matched_record_materials(self, ctx) -> list:
        """Test-mode: simula materiali embedded nei record matchati dalla data table."""
        pending = ctx.get("_pending_materials", [])
        if not pending:
            return []
        return [{
            "source": "record_materiali",
            "codice": m.get("codice", ""),
            "descrizione": m.get("descrizione", ""),
            "quantita": m.get("quantita", 1),
            "categoria": m.get("categoria", ""),
        } for m in pending]

    # ====================================================================
    # RULE CLASSIFICATION
    # ====================================================================
    def _is_pipeline(self, rule) -> bool:
        return bool(rule.get("pipeline_steps"))

    def _is_lookup(self, rule) -> bool:
        if self._is_pipeline(rule):
            return False
        for a in rule.get("actions", []):
            if a.get("action") in ("lookup_table", "lookup_multi", "catalog_match"):
                return True
        return False

    def _has_materials(self, rule) -> bool:
        """Verifica se una regola ha materiali (legacy o add_material actions)."""
        if rule.get("materials"):
            return True
        for a in rule.get("actions", []):
            if a.get("action") == "add_material":
                return True
        return False

    # ====================================================================
    # PIPELINE — HELPERS
    # ====================================================================

    def _match_pattern(self, pattern: str, ctx: Dict) -> Dict[str, Any]:
        """Match wildcard pattern like '_calc.util.*.watt' → {wildcard: value}."""
        if "*" not in pattern:
            return {}
        parts = pattern.split("*")
        if len(parts) != 2:
            return {}
        prefix, suffix = parts
        results = {}
        for k, v in ctx.items():
            if k.startswith(prefix) and k.endswith(suffix):
                wildcard = k[len(prefix):]
                if suffix:
                    wildcard = wildcard[:-len(suffix)]
                wildcard = wildcard.strip(".")
                if wildcard:
                    results[wildcard] = v
        return results

    def _resolve_pipeline_ref(self, ref: str, ctx: Dict) -> Any:
        """Resolve a pipeline reference — could be _calc path or context field."""
        if not ref:
            return None
        v = ctx.get(ref)
        if v is not None:
            return v
        return self._resolve(ref, ctx)

    def _round_value(self, val: float, round_type: str) -> float:
        import math
        if not round_type:
            return val
        rt = round_type.lower().strip()
        if rt == "ceil":     return float(math.ceil(val))
        if rt == "floor":    return float(math.floor(val))
        if rt == "round":    return float(round(val))
        if rt == "round_2":  return round(val, 2)
        if rt == "up_10":    return float(math.ceil(val / 10) * 10)
        if rt == "up_50":    return float(math.ceil(val / 50) * 50)
        if rt == "up_100":   return float(math.ceil(val / 100) * 100)
        return val

    # ====================================================================
    # PIPELINE — STEP EXECUTORS
    # ====================================================================

    def _pipeline_lookup_each(self, step: Dict, ctx: Dict) -> Dict:
        """Per ogni checkbox attiva nella sezione, cerca nella data table."""
        sezione = step.get("sezione", "")
        tabella = step.get("tabella", "")
        campo_lookup = step.get("campo_lookup", "componente")
        output_prefix = step.get("output_prefix", "_calc.util.")

        if not sezione or not tabella:
            raise ValueError("lookup_each: 'sezione' e 'tabella' obbligatori")

        tbl = self._load_data(tabella)
        if not tbl:
            raise ValueError(f"Tabella '{tabella}' non trovata")

        records = tbl.get("records", [])
        sez_prefix = f"{sezione}."

        # Trova checkbox attive nella sezione
        active_components = []
        for k, v in ctx.items():
            if k.startswith(sez_prefix):
                campo = k[len(sez_prefix):]
                if v and str(v).lower() not in ("false", "0", "no", "off", ""):
                    active_components.append(campo)

        written = {}
        for comp in active_components:
            matched = None
            comp_low = comp.lower()
            for rec in records:
                if str(rec.get(campo_lookup, "")).lower() == comp_low:
                    matched = rec
                    break

            if not matched:
                self.warnings.append(f"lookup_each: '{comp}' non trovato in '{tabella}'")
                continue

            # Scrivi tutti i campi del record
            for rk, rv in matched.items():
                if rk in ("output", "materiali", "articoli"):
                    continue
                ck = f"{output_prefix}{comp}.{rk}"
                ctx[ck] = rv
                written[ck] = rv

            # Scrivi campi output
            for rk, rv in matched.get("output", {}).items():
                ck = f"{output_prefix}{comp}.{rk}"
                ctx[ck] = rv
                written[ck] = rv

        return written

    def _pipeline_collect_sum(self, step: Dict, ctx: Dict) -> Dict:
        """Somma valori da più fonti: calc patterns, context, DB materiali."""
        sources = step.get("sources", [])
        output = step.get("output", "_calc.pipeline.sum_result")
        total = 0.0

        for src in sources:
            src_type = src.get("type", "")

            if src_type == "calc":
                pattern = src.get("pattern", "")
                matches = self._match_pattern(pattern, ctx)
                for _wc, val in matches.items():
                    try:
                        total += float(val)
                    except (ValueError, TypeError):
                        pass

            elif src_type == "context":
                field = src.get("field", "")
                val = self._resolve_pipeline_ref(field, ctx)
                if val is not None:
                    try:
                        total += float(val)
                    except (ValueError, TypeError):
                        pass

            elif src_type == "materials":
                field = src.get("field", "")
                filt = src.get("filter", {})
                if field and hasattr(self, "db"):
                    try:
                        q = "SELECT * FROM materiali WHERE preventivo_id=:pid"
                        params: Dict[str, Any] = {"pid": ctx.get("_preventivo_id", 0)}
                        for fk, fv in filt.items():
                            q += f" AND {fk}=:{fk}"
                            params[fk] = fv
                        rows = self.db.execute(text(q), params).fetchall()
                        for row in rows:
                            rd = dict(row._mapping) if hasattr(row, "_mapping") else {}
                            v = rd.get(field, 0)
                            try:
                                total += float(v)
                            except (ValueError, TypeError):
                                pass
                    except Exception as e:
                        self.warnings.append(f"collect_sum DB: {e}")

        ctx[output] = total
        return {output: total}

    def _pipeline_group_sum(self, step: Dict, ctx: Dict) -> Dict:
        """Raggruppa valori per una chiave e somma — opzionalmente applica power factor."""
        pattern_value = step.get("pattern_value", "")
        pattern_group = step.get("pattern_group", "")
        output_prefix = step.get("output_prefix", "_calc.grouped.")
        pf_field = step.get("power_factor", "")

        values = self._match_pattern(pattern_value, ctx)
        groups_map = self._match_pattern(pattern_group, ctx)

        # Raggruppa per chiave di gruppo (entrambi i pattern condividono il *)
        grouped: Dict[str, float] = {}
        for wildcard, watt_val in values.items():
            group_key = groups_map.get(wildcard)
            if group_key is None:
                self.warnings.append(f"group_sum: nessun gruppo per wildcard '{wildcard}'")
                continue
            gk = str(group_key)
            try:
                grouped[gk] = grouped.get(gk, 0.0) + float(watt_val)
            except (ValueError, TypeError):
                pass

        # Power factor
        pf = 1.0
        if pf_field:
            pf_val = self._resolve_pipeline_ref(pf_field, ctx)
            if pf_val:
                try:
                    pf = float(pf_val)
                    if pf <= 0:
                        pf = 1.0
                except (ValueError, TypeError):
                    pf = 1.0

        written = {}
        for gk, total_w in grouped.items():
            va = total_w / pf if pf != 1.0 else total_w
            ck = f"{output_prefix}{gk}"
            ctx[ck] = va
            written[ck] = va

        return written

    def _pipeline_math_expr(self, step: Dict, ctx: Dict) -> Dict:
        """Valuta un'espressione matematica con riferimenti _calc."""
        import re as _re
        expression = step.get("expression", "")
        output = step.get("output", "_calc.pipeline.expr_result")
        round_type = step.get("round", "")

        if not expression:
            raise ValueError("math_expr: expression vuota")

        # Sostituisci tutti i riferimenti _calc.xxx e sezione.campo
        tokens = _re.findall(r'[a-zA-Z_][a-zA-Z0-9_.]*', expression)
        # Ordina per lunghezza decrescente per evitare sostituzioni parziali
        tokens = sorted(set(tokens), key=len, reverse=True)

        eval_expr = expression
        for token in tokens:
            # Salta keyword math built-in
            if token in ("ceil", "floor", "round", "abs", "min", "max", "pow"):
                continue
            val = self._resolve_pipeline_ref(token, ctx)
            if val is not None:
                try:
                    eval_expr = eval_expr.replace(token, str(float(val)))
                except (ValueError, TypeError):
                    raise ValueError(f"math_expr: '{token}' = '{val}' non numerico")

        # Validazione sicurezza: solo numeri, operatori, parentesi, spazi, punto
        allowed = set("0123456789.+-*/() eE")
        for c in eval_expr:
            if c not in allowed:
                raise ValueError(f"math_expr: carattere non consentito '{c}' in '{eval_expr}'")

        result = float(eval(eval_expr))
        if round_type:
            result = self._round_value(result, round_type)

        ctx[output] = result
        return {output: result}

    def _pipeline_catalog_select(self, step: Dict, ctx: Dict) -> Dict:
        """Seleziona il primo record di un catalogo che soddisfa il criterio."""
        tabella = step.get("tabella", "")
        criterio = step.get("criterio", {})
        filtri = step.get("filtri", [])
        ordinamento = step.get("ordinamento", {})
        limit = step.get("limit", 1)
        output_prefix = step.get("output_prefix", f"_calc.{tabella}.")

        tbl = self._load_data(tabella)
        if not tbl:
            raise ValueError(f"Tabella '{tabella}' non trovata")

        records = list(tbl.get("records", []))

        # Ordinamento
        if ordinamento and ordinamento.get("colonna"):
            col = ordinamento["colonna"]
            desc = ordinamento.get("direzione", "ASC").upper() == "DESC"
            def _sort_key(r):
                v = r.get(col)
                if v is None:
                    return (1, 0)
                try:
                    return (0, float(v))
                except (ValueError, TypeError):
                    return (0, str(v))
            try:
                records.sort(key=_sort_key, reverse=desc)
            except Exception:
                pass

        # Criteri: principale + filtri aggiuntivi
        all_criteria = []
        if criterio and criterio.get("colonna"):
            all_criteria.append(criterio)
        all_criteria.extend(filtri or [])

        matched = []
        for rec in records:
            ok = True
            for crit in all_criteria:
                col_name = crit.get("colonna", "")
                op = crit.get("operatore", ">=")
                val_ref = crit.get("valore", "")

                # Risolvi riferimento
                if isinstance(val_ref, str) and (val_ref.startswith("_calc.") or "." in val_ref):
                    compare_val = self._resolve_pipeline_ref(val_ref, ctx)
                else:
                    compare_val = val_ref

                rec_val = rec.get(col_name)
                if rec_val is None or compare_val is None:
                    ok = False
                    break

                try:
                    rv = float(rec_val)
                    cv = float(compare_val)
                    if   op == ">="  and not (rv >= cv): ok = False
                    elif op == ">"   and not (rv > cv):  ok = False
                    elif op == "<="  and not (rv <= cv): ok = False
                    elif op == "<"   and not (rv < cv):  ok = False
                    elif op in ("==", "=") and not (str(rec_val).lower() == str(compare_val).lower()): ok = False
                except (ValueError, TypeError):
                    if op in ("==", "="):
                        if str(rec_val).lower() != str(compare_val).lower():
                            ok = False
                    else:
                        ok = False

                if not ok:
                    break

            if ok:
                matched.append(rec)
                if len(matched) >= limit:
                    break

        if not matched:
            self.warnings.append(f"catalog_select: nessun match in '{tabella}'")
            return {}

        written = {}
        rec = matched[0]
        for k, v in rec.items():
            if isinstance(v, dict):
                # Campi nested (es. "output": {...}) → flatten
                for nk, nv in v.items():
                    ck = f"{output_prefix}{nk}"
                    ctx[ck] = nv
                    written[ck] = nv
            else:
                ck = f"{output_prefix}{k}"
                ctx[ck] = v
                written[ck] = v

        return written

    def _pipeline_multi_match(self, step: Dict, ctx: Dict) -> Dict:
        """Trova l'articolo più piccolo che copre TUTTI i requisiti per tensione/VA."""
        tabella = step.get("tabella", "")
        requisiti_prefix = step.get("requisiti_prefix", "_calc.grouped.")
        colonna_codice = step.get("colonna_codice", "codice_trasf")
        colonna_tensione = step.get("colonna_tensione", "tensione_uscita")
        colonna_va = step.get("colonna_va", "va_disponibili")
        colonna_ordinamento = step.get("colonna_ordinamento", "potenza_totale_va")
        output_prefix = step.get("output_prefix", "_calc.trasformatore.")

        # Raccogli requisiti: _calc.va_per_tensione.24 = 43.75
        requisiti: Dict[str, float] = {}
        for k, v in ctx.items():
            if k.startswith(requisiti_prefix):
                tensione = k[len(requisiti_prefix):]
                try:
                    requisiti[str(tensione)] = float(v)
                except (ValueError, TypeError):
                    pass

        if not requisiti:
            self.warnings.append(f"multi_match: nessun requisito con prefix '{requisiti_prefix}'")
            return {}

        tbl = self._load_data(tabella)
        if not tbl:
            raise ValueError(f"Tabella '{tabella}' non trovata")

        records = tbl.get("records", [])

        # Raggruppa record per codice — ogni codice è un potenziale trasformatore
        from collections import defaultdict
        catalogo: Dict[str, list] = defaultdict(list)
        for rec in records:
            code = rec.get(colonna_codice)
            if code:
                catalogo[str(code)].append(rec)

        # Per ogni trasformatore, verifica se copre TUTTI i requisiti
        candidates = []
        for code, recs in catalogo.items():
            uscite: Dict[str, float] = {}
            potenza_totale = 0.0
            for rec in recs:
                tens = str(rec.get(colonna_tensione, ""))
                try:
                    va = float(rec.get(colonna_va, 0))
                except (ValueError, TypeError):
                    va = 0.0
                uscite[tens] = uscite.get(tens, 0.0) + va
                try:
                    potenza_totale = max(potenza_totale, float(rec.get(colonna_ordinamento, 0)))
                except (ValueError, TypeError):
                    pass

            covers_all = True
            for req_tens, req_va in requisiti.items():
                if uscite.get(req_tens, 0) < req_va:
                    covers_all = False
                    break

            if covers_all:
                candidates.append({
                    "codice": code, "uscite": uscite,
                    "potenza_totale": potenza_totale, "records": recs,
                })

        if not candidates:
            self.warnings.append(
                f"multi_match: nessun articolo in '{tabella}' copre tutti i requisiti {requisiti}"
            )
            return {}

        # Ordina per potenza crescente → prendi il più piccolo
        candidates.sort(key=lambda c: c["potenza_totale"])
        best = candidates[0]

        written = {}
        ck = f"{output_prefix}{colonna_codice}"
        ctx[ck] = best["codice"]
        written[ck] = best["codice"]

        ck = f"{output_prefix}{colonna_ordinamento}"
        ctx[ck] = best["potenza_totale"]
        written[ck] = best["potenza_totale"]

        for tens, va in best["uscite"].items():
            ck = f"{output_prefix}uscita_{tens}_va"
            ctx[ck] = va
            written[ck] = va

        # Tutti i campi dal primo record
        for k, v in best["records"][0].items():
            if isinstance(v, dict):
                for nk, nv in v.items():
                    ck = f"{output_prefix}{nk}"
                    if ck not in written:
                        ctx[ck] = nv
                        written[ck] = nv
            else:
                ck = f"{output_prefix}{k}"
                if ck not in written:
                    ctx[ck] = v
                    written[ck] = v

        return written

    def _pipeline_add_material(self, step: Dict, ctx: Dict,
                               preventivo=None, dry_run=False) -> Dict:
        """Aggiunge un materiale, risolvendo riferimenti _calc."""
        mat = step.get("material", {})

        codice_ref = mat.get("codice", "")
        desc_ref = mat.get("descrizione", "")
        quantita_ref = mat.get("quantita", 1)
        categoria = mat.get("categoria", "Materiale Automatico")

        # Risolvi codice (può essere _calc.trasformatore.codice_trasf)
        if isinstance(codice_ref, str) and codice_ref.startswith("_calc."):
            codice = ctx.get(codice_ref)
            if not codice:
                return {"skipped": True, "reason": f"{codice_ref} non risolto"}
            codice = str(codice)
        else:
            codice = str(codice_ref)
        codice = self._replace_ph(codice, ctx)
        if not codice or codice.startswith("_calc."):
            return {"skipped": True, "reason": f"codice non risolto: {codice}"}

        # Risolvi descrizione
        if isinstance(desc_ref, str) and desc_ref.startswith("_calc."):
            desc = str(ctx.get(desc_ref, desc_ref))
        else:
            desc = str(desc_ref)
        desc = self._replace_ph(desc, ctx)

        # Risolvi quantità
        try:
            if isinstance(quantita_ref, str) and quantita_ref.startswith("_calc."):
                quantita = float(ctx.get(quantita_ref, 1))
            else:
                quantita = float(quantita_ref)
        except (ValueError, TypeError):
            quantita = 1.0

        result = {
            "codice": codice, "descrizione": desc,
            "quantita": quantita, "categoria": categoria,
        }

        if dry_run or preventivo is None:
            result["mode"] = "dry_run"
            return result

        added = self._add_material(preventivo, {
            "codice": codice, "descrizione": desc,
            "quantita": quantita, "categoria": categoria,
        }, "pipeline", ctx)
        result["added"] = added
        return result

    # ====================================================================
    # PIPELINE — ORCHESTRATOR
    # ====================================================================

    def _exec_pipeline_step(self, step: Dict, ctx: Dict,
                            preventivo=None, dry_run=False) -> Dict:
        """Esegue un singolo step di pipeline. Ritorna {status, output, error}."""
        action = step.get("action", "")
        result: Dict[str, Any] = {"step_action": action, "status": "ok", "output": {}, "error": None}

        try:
            if action == "lookup_each":
                result["output"] = self._pipeline_lookup_each(step, ctx)
            elif action == "collect_sum":
                result["output"] = self._pipeline_collect_sum(step, ctx)
            elif action == "group_sum":
                result["output"] = self._pipeline_group_sum(step, ctx)
            elif action == "math_expr":
                result["output"] = self._pipeline_math_expr(step, ctx)
            elif action == "catalog_select":
                result["output"] = self._pipeline_catalog_select(step, ctx)
            elif action == "multi_match":
                result["output"] = self._pipeline_multi_match(step, ctx)
            elif action == "add_material":
                result["output"] = self._pipeline_add_material(
                    step, ctx, preventivo, dry_run)
            else:
                result["status"] = "error"
                result["error"] = f"Azione sconosciuta: {action}"
        except Exception as e:
            result["status"] = "error"
            result["error"] = str(e)
            import traceback; traceback.print_exc()

        return result

    def execute_pipeline(self, rule: Dict, preventivo, ctx: Dict) -> int:
        """Esegue una pipeline rule e ritorna il numero di materiali aggiunti."""
        steps = rule.get("pipeline_steps", [])
        if not steps:
            return 0

        rid = rule.get("id", "pipeline")
        added = 0
        for i, step in enumerate(steps):
            print(f"[PIPELINE] {rid} step {i}: {step.get('action')}")
            result = self._exec_pipeline_step(step, ctx, preventivo, dry_run=False)
            if result["status"] == "error":
                self.errors.append(
                    f"Pipeline {rid} step {i} ({step.get('action')}): {result['error']}")
                break
            out = result.get("output", {})
            if out:
                print(f"[PIPELINE]   → {len(out)} output keys")
            if step.get("action") == "add_material" and out.get("added"):
                added += 1

        return added

    def simulate_pipeline(self, pipeline_rule: Dict, preventivo) -> Dict:
        """Simula una pipeline senza modificare il DB. Usato dal frontend."""
        self.warnings = []
        self.errors = []
        self._data_cache = {}

        ctx = self.build_config_context(preventivo)

        # Esegui prima le lookup rules normali per popolare _calc context
        all_rules = self.load_all_rules()
        for rule in all_rules:
            if not rule.get("enabled", True):
                continue
            if self._is_pipeline(rule):
                continue
            if not self._is_lookup(rule):
                continue
            if not self.should_apply(rule, ctx):
                continue
            for action in rule.get("actions", []):
                at = action.get("action")
                skip_expr = action.get("skip_if")
                if skip_expr and self._eval_skip_if(skip_expr, ctx):
                    continue
                if at == "lookup_table":
                    self._exec_lookup_table(action, ctx)
                elif at == "lookup_multi":
                    self._exec_lookup_multi(action, ctx)
                elif at == "catalog_match":
                    self._exec_catalog_match(action, ctx)
                elif at == "set_field":
                    self._exec_set_field(action, ctx)

        # Esegui gli step della pipeline in dry_run
        steps = pipeline_rule.get("pipeline_steps", [])
        step_results = []

        for i, step in enumerate(steps):
            result = self._exec_pipeline_step(step, ctx, preventivo=None, dry_run=True)
            step_results.append({
                "step": i,
                "action": step.get("action", ""),
                "status": result["status"],
                "output": result.get("output", {}),
                "error": result.get("error"),
            })
            if result["status"] == "error":
                break

        return {
            "steps": step_results,
            "final_context_calc": {k: v for k, v in ctx.items() if k.startswith("_calc.")},
            "warnings": self.warnings,
            "errors": self.errors,
        }

    # ====================================================================
    # MAIN EVALUATE — TWO-PASS
    # ====================================================================
    def evaluate_rules(self, preventivo) -> Dict:
        self.warnings = []
        self.errors = []
        self._data_cache = {}

        ctx = self.build_config_context(preventivo)
        ctx["_preventivo_id"] = preventivo.id
        try:
            from variabili_derivate import apply_variabili_derivate
            apply_variabili_derivate(ctx, self.db)
        except Exception as e:
            self.warnings.append(f"variabili_derivate: {e}")
        all_rules = self.load_all_rules()

        if not all_rules:
            self.warnings.append("Nessuna regola trovata")
            return self._make_result(set(), 0, 0, preventivo)

        # Classifica regole in 3 categorie
        lookup_rules = [r for r in all_rules if self._is_lookup(r)]
        pipeline_rules = [r for r in all_rules if self._is_pipeline(r)]
        mat_rules = [r for r in all_rules
                     if not self._is_lookup(r) and not self._is_pipeline(r)]
        active: Set[str] = set()

        # ── PASS 1: Lookup → arricchisci context con _calc.* ──
        for rule in lookup_rules:
            rid = rule.get("id", "unknown")
            if not rule.get("enabled", True):
                continue
            try:
                cond_ok = self.should_apply(rule, ctx)
                print(f"[EVAL] Lookup {rid}: conditions={'PASS' if cond_ok else 'FAIL'}")
                if cond_ok:
                    active.add(rid)
                    for action in rule.get("actions", []):
                        at = action.get("action")

                        # Skip_if check
                        skip_expr = action.get("skip_if")
                        if skip_expr and self._eval_skip_if(skip_expr, ctx):
                            continue

                        if at == "lookup_table":
                            self._exec_lookup_table(action, ctx)
                        elif at == "lookup_multi":
                            written = self._exec_lookup_multi(action, ctx)
                            print(f"[EVAL]   lookup_multi wrote: {written}")
                        elif at == "catalog_match":
                            self._exec_catalog_match(action, ctx)
                        elif at == "set_field":
                            self._exec_set_field(action, ctx)
                        # add_material verrà gestito dopo nel loop materiali
            except Exception as e:
                self.errors.append(f"Errore lookup {rid}: {e}")
                import traceback; traceback.print_exc()

        # ── PASS 1.5: Pipeline rules (vedono _calc.* delle lookup) ──
        for rule in pipeline_rules:
            rid = rule.get("id", "unknown")
            if not rule.get("enabled", True):
                continue
            try:
                if self.should_apply(rule, ctx):
                    active.add(rid)
                    print(f"[EVAL] Pipeline {rid}: executing {len(rule.get('pipeline_steps', []))} steps")
                    # L'esecuzione vera dei materiali avviene dopo il DELETE
            except Exception as e:
                self.errors.append(f"Errore pipeline conditions {rid}: {e}")

        # ── PASS 2: Material rules (ora vedono _calc.*) ──
        for rule in mat_rules:
            rid = rule.get("id", "unknown")
            if not rule.get("enabled", True):
                continue
            try:
                if self.should_apply(rule, ctx):
                    active.add(rid)
                    # Esegui eventuali set_field prima dei materiali
                    for action in rule.get("actions", []):
                        if action.get("action") == "set_field":
                            skip_expr = action.get("skip_if")
                            if skip_expr and self._eval_skip_if(skip_expr, ctx):
                                continue
                            self._exec_set_field(action, ctx)
            except Exception as e:
                self.errors.append(f"Errore regola {rid}: {e}")

        print(f"[EVAL] Active rules: {active}")
        print(f"[EVAL] _calc keys in ctx: {[k for k in ctx if k.startswith('_calc.')]}")

        # Rimuovi TUTTI i materiali automatici (verranno ri-aggiunti dalle regole attive)
        removed_result = self.db.execute(text(
            "SELECT COUNT(*) FROM materiali WHERE preventivo_id=:pid AND aggiunto_da_regola=1"
        ), {"pid": preventivo.id}).fetchone()
        removed = removed_result[0] if removed_result else 0
        self.db.execute(text(
            "DELETE FROM materiali WHERE preventivo_id=:pid AND aggiunto_da_regola=1"
        ), {"pid": preventivo.id})

        # ── Aggiungi materiali da TUTTE le regole attive ──
        added = 0

        # Mat rules: add_material + legacy materials
        for rule in mat_rules:
            rid = rule.get("id", "unknown")
            if rid in active:
                try:
                    n = self._apply_actions(rule, preventivo, ctx)
                    if n > 0:
                        print(f"[EVAL] mat_rule {rid}: added {n} materials")
                    added += n
                except Exception as e:
                    self.errors.append(f"Errore applicazione {rid}: {e}")

        # Lookup rules che hanno ANCHE add_material o legacy materials
        for rule in lookup_rules:
            rid = rule.get("id", "unknown")
            if rid in active:
                # Aggiungi materiali da add_material actions e legacy materials
                if self._has_materials(rule):
                    try:
                        n = self._apply_actions(rule, preventivo, ctx)
                        if n > 0:
                            print(f"[EVAL] lookup_rule {rid}: added {n} materials (add_material/legacy)")
                        added += n
                    except Exception as e:
                        self.errors.append(f"Errore materiali lookup {rid}: {e}")

                # Aggiungi materiali da _value_mappings
                has_vm = bool(rule.get("_value_mappings"))
                print(f"[EVAL] value_mappings for {rid}: has_vm={has_vm}")
                try:
                    n = self._add_materials_from_value_mappings(rule, preventivo, ctx)
                    print(f"[EVAL]   → added {n} from value_mappings")
                    added += n
                except Exception as e:
                    self.errors.append(f"Errore value_mappings {rid}: {e}")
                    import traceback; traceback.print_exc()

                # Aggiungi materiali embedded nei record della data table
                try:
                    n = self._add_materials_from_matched_records(rule, preventivo, ctx)
                    if n > 0:
                        print(f"[EVAL]   → added {n} from matched record materiali")
                    added += n
                except Exception as e:
                    self.errors.append(f"Errore record materials {rid}: {e}")

        # Pipeline rules: esecuzione completa (calcoli + materiali)
        for rule in pipeline_rules:
            rid = rule.get("id", "unknown")
            if rid in active:
                try:
                    n = self.execute_pipeline(rule, preventivo, ctx)
                    if n > 0:
                        print(f"[EVAL] pipeline {rid}: added {n} materials")
                    added += n
                except Exception as e:
                    self.errors.append(f"Errore pipeline {rid}: {e}")
                    import traceback; traceback.print_exc()

        try:
            self.db.commit()
        except Exception as e:
            self.errors.append(f"Errore commit: {e}")
            self.db.rollback()
            return self._make_result(active, 0, 0, preventivo)

        self._update_totale(preventivo)
        res = self._make_result(active, added, removed, preventivo)
        res["context_calc"] = {k: v for k, v in ctx.items() if k.startswith("_calc.")}
        return res

    # ====================================================================
    # TEST_RULES — SIMULAZIONE SENZA SIDE-EFFECTS
    # ====================================================================
    def test_rules(self, preventivo, override_context=None) -> Dict:
        self.warnings = []
        self.errors = []
        self._data_cache = {}

        ctx = self.build_config_context(preventivo)
        if override_context and isinstance(override_context, dict):
            for k, v in override_context.items():
                ctx[k] = _conv(v)

        report: Dict[str, Any] = {
            "preventivo_id": preventivo.id,
            "context_initial": dict(sorted(
                ((k, v) for k, v in ctx.items() if not k.startswith("_")),
                key=lambda x: x[0]
            )),
            "context_after_lookups": {},
            "lookup_results": [],
            "pipeline_results": [],
            "material_results": [],
            "rules_loaded": [],
            "summary": {},
        }

        all_rules = self.load_all_rules()
        report["rules_loaded"] = [
            {"id": r.get("id"), "enabled": r.get("enabled", True),
             "priority": r.get("priority", r.get("priorita")),
             "type": "pipeline" if self._is_pipeline(r) else ("lookup" if self._is_lookup(r) else "material"),
             "has_add_material": self._has_materials(r) or self._is_pipeline(r),
             "source": r.get("source", "?")}
            for r in all_rules
        ]

        lookup_rules = [r for r in all_rules if self._is_lookup(r)]
        pipeline_rules_list = [r for r in all_rules if self._is_pipeline(r)]
        mat_rules = [r for r in all_rules
                     if not self._is_lookup(r) and not self._is_pipeline(r)]

        # PASS 1: Lookup test
        for rule in lookup_rules:
            rid = rule.get("id", "unknown")
            rr: Dict[str, Any] = {
                "rule_id": rid, "enabled": rule.get("enabled", True),
                "conditions_detail": [], "conditions_result": False,
                "actions_result": []
            }

            if not rr["enabled"]:
                rr["skip_reason"] = "disabled"
                report["lookup_results"].append(rr)
                continue

            # Valuta condizioni
            conds = rule.get("conditions", [])
            if isinstance(conds, list) and len(conds) > 0:
                all_ok = True
                for c in conds:
                    actual = self._resolve(c.get("field", ""), ctx)
                    res = self._eval_cond(c, ctx)
                    rr["conditions_detail"].append({
                        "field": c.get("field"), "operator": c.get("operator"),
                        "expected": c.get("value"), "actual": actual, "result": res
                    })
                    if not res:
                        all_ok = False
                rr["conditions_result"] = all_ok
            else:
                rr["conditions_result"] = True  # nessuna condizione = sempre attiva

            if rr["conditions_result"]:
                for action in rule.get("actions", []):
                    at = action.get("action", "")

                    # Check skip_if in test mode
                    skip_expr = action.get("skip_if")
                    skipped = self._eval_skip_if(skip_expr, ctx) if skip_expr else False

                    ar: Dict[str, Any] = {"action": at, "tabella": action.get("tabella"), "skipped": skipped}

                    if skipped:
                        ar["skip_reason"] = f"skip_if: {skip_expr}"
                        rr["actions_result"].append(ar)
                        continue

                    if at == "lookup_table":
                        ar["input_field"] = action.get("input_field")
                        ar["input_value"] = self._resolve(action.get("input_field", ""), ctx)
                        pf = action.get("partition_field")
                        if pf:
                            ar["partition_field"] = pf
                            ar["partition_value"] = self._resolve(pf, ctx)
                        ar["values_written"] = self._exec_lookup_table(action, ctx)
                    elif at == "lookup_multi":
                        inputs_debug = []
                        for inf in action.get("input_fields", []):
                            inputs_debug.append({
                                "field": inf.get("field") or inf.get("fields"),
                                "type": inf.get("type", "single"),
                                "match": inf.get("match"),
                                "resolved": self._resolve_input_field(inf, ctx),
                            })
                        ar["inputs"] = inputs_debug
                        # Cattura warnings prima/dopo per diagnostica
                        warnings_before = len(self.warnings)
                        errors_before = len(self.errors)
                        ar["values_written"] = self._exec_lookup_multi(action, ctx)
                        # Mostra nuovi warnings/errors generati
                        ar["debug_warnings"] = self.warnings[warnings_before:]
                        ar["debug_errors"] = self.errors[errors_before:]
                        # Mostra info data table
                        tbl = self._load_data(action.get("tabella", ""))
                        if tbl:
                            ar["debug_table_tipo"] = tbl.get("tipo")
                            ar["debug_table_partizioni"] = list(tbl.get("partizioni", {}).keys()) if "partizioni" in tbl else "N/A"
                        else:
                            ar["debug_table_found"] = False
                    elif at == "catalog_match":
                        ar["values_written"] = self._exec_catalog_match(action, ctx)
                    elif at == "set_field":
                        self._exec_set_field(action, ctx)
                        ar["field"] = action.get("field")
                        ar["result_value"] = self._resolve(action.get("field", ""), ctx)
                    elif at == "add_material":
                        mat = action.get("material", {})
                        code_raw = mat.get("codice", "")
                        code_res = self._replace_ph(code_raw, ctx)
                        desc_res = self._replace_ph(mat.get("descrizione", ""), ctx)
                        ar["material"] = {
                            "codice_template": code_raw,
                            "codice_resolved": code_res,
                            "descrizione": desc_res,
                            "quantita": mat.get("quantita", 1),
                            "unresolved": "{{" in code_res,
                        }
                    rr["actions_result"].append(ar)

            # Materiali da _value_mappings
            if rr["conditions_result"]:
                rr["value_mapping_materials"] = self._simulate_value_mapping_materials(rule, ctx)
                rr["record_materials"] = self._simulate_matched_record_materials(ctx)
                # Pulisci pending dopo simulazione
                ctx.pop("_pending_materials", None)

            report["lookup_results"].append(rr)

        report["context_after_lookups"] = {
            k: v for k, v in ctx.items() if k.startswith("_calc.")
        }

        # PASS 1.5: Pipeline test
        for rule in pipeline_rules_list:
            rid = rule.get("id", "unknown")
            pr: Dict[str, Any] = {
                "rule_id": rid, "enabled": rule.get("enabled", True),
                "conditions_result": False, "step_results": [],
                "materials_would_add": [],
            }

            if not pr["enabled"]:
                pr["skip_reason"] = "disabled"
                report["pipeline_results"].append(pr)
                continue

            conds = rule.get("conditions", [])
            if isinstance(conds, list) and len(conds) > 0:
                all_ok = True
                for c in conds:
                    if not self._eval_cond(c, ctx):
                        all_ok = False
                pr["conditions_result"] = all_ok
            else:
                pr["conditions_result"] = True

            if pr["conditions_result"]:
                steps = rule.get("pipeline_steps", [])
                for i, step in enumerate(steps):
                    result = self._exec_pipeline_step(
                        step, ctx, preventivo=None, dry_run=True)
                    sr = {
                        "step": i,
                        "action": step.get("action", ""),
                        "status": result["status"],
                        "output": result.get("output", {}),
                        "error": result.get("error"),
                    }
                    pr["step_results"].append(sr)
                    if step.get("action") == "add_material" and result["status"] == "ok":
                        pr["materials_would_add"].append(result.get("output", {}))
                    if result["status"] == "error":
                        break

            report["pipeline_results"].append(pr)

        # Aggiorna context dopo pipelines
        report["context_after_pipelines"] = {
            k: v for k, v in ctx.items() if k.startswith("_calc.")
        }

        # PASS 2: Material test
        for rule in mat_rules:
            rid = rule.get("id", "unknown")
            rr = {
                "rule_id": rid, "enabled": rule.get("enabled", True),
                "conditions_detail": [], "conditions_result": False,
                "materials_would_add": []
            }

            if not rr["enabled"]:
                rr["skip_reason"] = "disabled"
                report["material_results"].append(rr)
                continue

            conds = rule.get("conditions", [])
            if isinstance(conds, list) and len(conds) > 0:
                all_ok = True
                for c in conds:
                    actual = self._resolve(c.get("field", ""), ctx)
                    res = self._eval_cond(c, ctx)
                    rr["conditions_detail"].append({
                        "field": c.get("field"), "operator": c.get("operator"),
                        "expected": c.get("value"), "actual": actual, "result": res
                    })
                    if not res:
                        all_ok = False
                rr["conditions_result"] = all_ok
            else:
                rr["conditions_result"] = self.should_apply(rule, ctx)

            if rr["conditions_result"]:
                # Esegui set_field per avere context aggiornato
                for action in rule.get("actions", []):
                    if action.get("action") == "set_field":
                        skip_expr = action.get("skip_if")
                        if skip_expr and self._eval_skip_if(skip_expr, ctx):
                            continue
                        self._exec_set_field(action, ctx)

                # Simula add_material da actions
                for action in rule.get("actions", []):
                    if action.get("action") == "add_material":
                        skip_expr = action.get("skip_if")
                        skipped = self._eval_skip_if(skip_expr, ctx) if skip_expr else False
                        if skipped:
                            continue
                        mat = action.get("material", {})
                        code_raw = mat.get("codice", "")
                        code_res = self._replace_ph(code_raw, ctx)
                        desc_res = self._replace_ph(mat.get("descrizione", ""), ctx)
                        rr["materials_would_add"].append({
                            "codice_template": code_raw,
                            "codice_resolved": code_res,
                            "descrizione": desc_res,
                            "quantita": mat.get("quantita", 1),
                            "unresolved": "{{" in code_res,
                        })

                # Legacy materials
                for mat in rule.get("materials", []):
                    code_raw = mat.get("codice", "")
                    code_res = self._replace_ph(code_raw, ctx)
                    desc_res = self._replace_ph(mat.get("descrizione", ""), ctx)
                    rr["materials_would_add"].append({
                        "codice_template": code_raw,
                        "codice_resolved": code_res,
                        "descrizione": desc_res,
                        "quantita": mat.get("quantita", 1),
                        "unresolved": "{{" in code_res,
                    })

            report["material_results"].append(rr)

        # Summary
        active_l = [r for r in report["lookup_results"] if r.get("conditions_result")]
        active_p = [r for r in report["pipeline_results"] if r.get("conditions_result")]
        active_m = [r for r in report["material_results"] if r.get("conditions_result")]
        vm_materials = sum(len(r.get("value_mapping_materials", [])) for r in active_l)
        record_materials = sum(len(r.get("record_materials", [])) for r in active_l)
        # Conta anche add_material nelle lookup rules
        lookup_add_mat = sum(
            len([a for a in r.get("actions_result", []) if a.get("action") == "add_material" and not a.get("skipped")])
            for r in active_l
        )
        pipeline_materials = sum(len(r.get("materials_would_add", [])) for r in active_p)
        report["summary"] = {
            "total_rules": len(all_rules),
            "lookup_rules": len(lookup_rules),
            "pipeline_rules": len(pipeline_rules_list),
            "material_rules": len(mat_rules),
            "active_lookups": len(active_l),
            "active_pipelines": len(active_p),
            "active_materials": len(active_m),
            "materials_would_add": (
                sum(len(r.get("materials_would_add", [])) for r in active_m)
                + vm_materials
                + record_materials
                + lookup_add_mat
                + pipeline_materials
            ),
            "vm_materials": vm_materials,
            "record_materials": record_materials,
            "lookup_add_materials": lookup_add_mat,
            "pipeline_materials": pipeline_materials,
            "calc_values": len(report.get("context_after_pipelines", report["context_after_lookups"])),
            "warnings": self.warnings,
            "errors": self.errors,
        }
        return report

    # ====================================================================
    # DEBUG
    # ====================================================================
    def get_context_debug(self, preventivo):
        ctx = self.build_config_context(preventivo)
        return {
            "preventivo_id": preventivo.id,
            "total_keys": len(ctx),
            "context": dict(sorted(ctx.items())),
            "sezioni_trovate": [t for t in TABELLE_DEDICATE if self._table_columns(t)],
        }

    # ====================================================================
    # UTILITY
    # ====================================================================
    def _update_totale(self, preventivo):
        try:
            row = self.db.execute(text(
                "SELECT COALESCE(SUM(prezzo_totale), 0) FROM materiali WHERE preventivo_id=:pid"
            ), {"pid": preventivo.id}).fetchone()
            tot = float(row[0]) if row else 0
            if hasattr(preventivo, "totale_materiali"):
                preventivo.totale_materiali = tot
            self.db.commit()
        except Exception:
            pass

    def _make_result(self, active, added, removed, preventivo):
        row = self.db.execute(text(
            "SELECT COUNT(*) FROM materiali WHERE preventivo_id=:pid"
        ), {"pid": preventivo.id}).fetchone()
        tc = row[0] if row else 0
        tp = getattr(preventivo, "totale_materiali", 0) or 0
        return {
            "active_rules": sorted(active), "materials_added": added,
            "materials_removed": removed, "total_materials": tc,
            "total_price": tp, "warnings": self.warnings, "errors": self.errors
        }


# ====================================================================
# MODULO-LEVEL UTILITY
# ====================================================================
def _conv(v):
    if v is None:
        return None
    if isinstance(v, (int, float, bool)):
        return v
    s = str(v).strip()
    if not s:
        return s
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        pass
    return s
