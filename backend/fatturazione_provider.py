"""
fatturazione_provider.py - Provider SDI (interfaccia generica + implementazione Aruba)

Architettura pluggable: base class SDIProvider + implementazioni concrete.
Attualmente implementato: Aruba Fatturazione Elettronica API v1.21
"""

import base64
import json
import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List, Tuple

logger = logging.getLogger("fatturazione.provider")


# ==========================================
# INTERFACCIA BASE
# ==========================================

class SDIProvider(ABC):
    """Interfaccia astratta per provider SDI"""

    @abstractmethod
    def authenticate(self) -> bool:
        """Autentica con il provider. Ritorna True se ok."""
        ...

    @abstractmethod
    def upload_invoice(self, xml_content: str, filename: str,
                       signed: bool = False) -> Dict[str, Any]:
        """
        Invia fattura XML al provider.
        
        Args:
            xml_content: Contenuto XML della fattura
            filename: Nome file (formato SDI)
            signed: Se il file è già firmato digitalmente
            
        Returns:
            dict con: success, upload_filename, error_code, error_description, raw_response
        """
        ...

    @abstractmethod
    def get_invoice_status(self, filename: str) -> Dict[str, Any]:
        """
        Recupera stato di una fattura inviata.
        
        Returns:
            dict con: stato, notifications, raw_response
        """
        ...

    @abstractmethod
    def search_sent_invoices(self, username: str = None,
                             date_from: str = None, date_to: str = None,
                             page: int = 0, size: int = 50) -> Dict[str, Any]:
        """
        Cerca fatture inviate.
        
        Returns:
            dict con: invoices, total, page, raw_response
        """
        ...

    @abstractmethod
    def search_received_invoices(self, username: str = None,
                                  date_from: str = None, date_to: str = None,
                                  page: int = 0, size: int = 50) -> Dict[str, Any]:
        """
        Cerca fatture ricevute.
        
        Returns:
            dict con: invoices, total, page, raw_response
        """
        ...

    @abstractmethod
    def get_invoice_detail(self, invoice_id: str = None,
                           filename: str = None) -> Dict[str, Any]:
        """
        Recupera dettaglio fattura (inviata o ricevuta).
        
        Returns:
            dict con: invoice_data, xml_content, notifications, raw_response
        """
        ...

    @abstractmethod
    def get_notifications(self, invoice_filename: str) -> List[Dict[str, Any]]:
        """Recupera notifiche per una fattura"""
        ...

    @abstractmethod
    def download_invoice_zip(self, filename: str) -> Optional[bytes]:
        """Scarica ZIP con fattura e notifiche"""
        ...


# ==========================================
# PROVIDER: ARUBA
# ==========================================

class ArubaSDIProvider(SDIProvider):
    """
    Implementazione Aruba Fatturazione Elettronica API v1.21
    
    Ambienti:
        DEMO: auth=demoauth.fatturazioneelettronica.aruba.it, ws=demows.fatturazioneelettronica.aruba.it
        PROD: auth=auth.fatturazioneelettronica.aruba.it, ws=ws.fatturazioneelettronica.aruba.it
    
    Codice destinatario ricezione Aruba: KRRH6B9
    """

    DEMO_AUTH_URL = "https://demoauth.fatturazioneelettronica.aruba.it"
    DEMO_WS_URL = "https://demows.fatturazioneelettronica.aruba.it"
    PROD_AUTH_URL = "https://auth.fatturazioneelettronica.aruba.it"
    PROD_WS_URL = "https://ws.fatturazioneelettronica.aruba.it"

    # Mapping stati Aruba → stati interni
    STATO_MAP = {
        "Inviata": "inviata",
        "Consegnata": "consegnata",
        "Accettata": "accettata",
        "NonConsegnata": "mancata_consegna",
        "Scartata": "scartata",
        "Rifiutata": "rifiutata",
        "ImpossibilitaDiRecapito": "mancata_consegna",
        "DecorrenzaTermini": "decorrenza_termini",
        "ErroreElaborazione": "errore",
        "InElaborazione": "inviata",
        "Prodotta": "generata",
    }

    def __init__(self, username: str, password: str, ambiente: str = "demo"):
        self.username = username
        self.password = password
        self.ambiente = ambiente.lower()

        if self.ambiente == "produzione" or self.ambiente == "prod":
            self.auth_url = self.PROD_AUTH_URL
            self.ws_url = self.PROD_WS_URL
        else:
            self.auth_url = self.DEMO_AUTH_URL
            self.ws_url = self.DEMO_WS_URL

        self._access_token = None
        self._token_expires = None

    # --- HTTP helpers ---

    def _get_session(self):
        """Lazy import requests per evitare dipendenze se non usato"""
        try:
            import httpx
            return httpx.Client(timeout=30.0)
        except ImportError:
            import requests
            return requests.Session()

    def _get_headers(self) -> dict:
        """Headers con authorization token"""
        if not self._access_token or self._is_token_expired():
            self.authenticate()
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json;charset=UTF-8",
            "Accept": "application/json",
        }

    def _is_token_expired(self) -> bool:
        if not self._token_expires:
            return True
        return datetime.now() >= self._token_expires

    def _handle_response(self, response, operation: str) -> dict:
        """Gestisce risposta HTTP e logga errori"""
        status = response.status_code
        try:
            data = response.json() if hasattr(response, 'json') else json.loads(response.text)
        except Exception:
            data = {"raw_text": response.text}

        if status == 200 or status == 201:
            return {"success": True, "data": data, "status_code": status}
        else:
            error_msg = data.get("errorDescription") or data.get("error") or str(data)
            error_code = data.get("errorCode") or data.get("error_code") or str(status)
            logger.error(f"Aruba {operation} failed: {status} - {error_msg}")
            return {
                "success": False,
                "error_code": error_code,
                "error_description": error_msg,
                "status_code": status,
                "data": data,
            }

    # --- Autenticazione ---

    def authenticate(self) -> bool:
        """
        POST /auth/signin
        Content-Type: application/x-www-form-urlencoded
        grant_type=password&username=X&password=Y
        """
        client = self._get_session()
        try:
            response = client.post(
                f"{self.auth_url}/auth/signin",
                data={
                    "grant_type": "password",
                    "username": self.username,
                    "password": self.password,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"}
            )
            if response.status_code == 200:
                data = response.json() if hasattr(response, 'json') else json.loads(response.text)
                self._access_token = data.get("access_token")
                expires_in = data.get("expires_in", 1800)
                self._token_expires = datetime.now() + timedelta(seconds=expires_in - 60)
                logger.info("Aruba authentication successful")
                return True
            else:
                logger.error(f"Aruba auth failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Aruba auth exception: {e}")
            return False
        finally:
            client.close()

    # --- Invio fatture ---

    def upload_invoice(self, xml_content: str, filename: str,
                       signed: bool = False) -> Dict[str, Any]:
        """
        POST /services/invoice/upload
        Body: { "dataFile": "<base64 XML>", "credential": null, "domain": null }
        
        Per fatture già firmate:
        POST /services/invoice/uploadSigned
        Body: { "dataFile": "<base64 .p7m>", "credential": null, "domain": null }
        """
        client = self._get_session()
        try:
            # Codifica XML in base64
            if isinstance(xml_content, str):
                xml_bytes = xml_content.encode("utf-8")
            else:
                xml_bytes = xml_content
            data_file_b64 = base64.b64encode(xml_bytes).decode("utf-8")

            endpoint = "/services/invoice/uploadSigned" if signed else "/services/invoice/upload"
            payload = {
                "dataFile": data_file_b64,
                "credential": None,
                "domain": None,
            }

            response = client.post(
                f"{self.ws_url}{endpoint}",
                json=payload,
                headers=self._get_headers()
            )

            result = self._handle_response(response, "upload_invoice")

            if result["success"]:
                data = result["data"]
                return {
                    "success": True,
                    "upload_filename": data.get("uploadFileName"),
                    "error_code": data.get("errorCode"),
                    "error_description": data.get("errorDescription"),
                    "raw_response": data,
                }
            else:
                return {
                    "success": False,
                    "upload_filename": None,
                    "error_code": result.get("error_code"),
                    "error_description": result.get("error_description"),
                    "raw_response": result.get("data"),
                }
        except Exception as e:
            logger.error(f"Upload invoice exception: {e}")
            return {
                "success": False,
                "upload_filename": None,
                "error_code": "EXCEPTION",
                "error_description": str(e),
                "raw_response": None,
            }
        finally:
            client.close()

    # --- Stato fattura ---

    def get_invoice_status(self, filename: str) -> Dict[str, Any]:
        """
        GET /services/invoice/out/getByFilename?filename=<filename>
        """
        client = self._get_session()
        try:
            response = client.get(
                f"{self.ws_url}/services/invoice/out/getByFilename",
                params={"filename": filename},
                headers=self._get_headers()
            )
            result = self._handle_response(response, "get_invoice_status")
            if result["success"]:
                data = result["data"]
                stato_aruba = data.get("invoiceStatus") or data.get("status") or ""
                return {
                    "success": True,
                    "stato": self.STATO_MAP.get(stato_aruba, stato_aruba.lower()),
                    "stato_originale": stato_aruba,
                    "id_sdi": data.get("idSdi"),
                    "filename": data.get("filename") or data.get("invoiceFilename"),
                    "notifications": data.get("notifications", []),
                    "raw_response": data,
                }
            return {
                "success": False,
                "stato": "errore",
                "error": result.get("error_description"),
                "raw_response": result.get("data"),
            }
        except Exception as e:
            logger.error(f"Get invoice status exception: {e}")
            return {"success": False, "stato": "errore", "error": str(e)}
        finally:
            client.close()

    # --- Ricerca fatture inviate ---

    def search_sent_invoices(self, username: str = None,
                             date_from: str = None, date_to: str = None,
                             page: int = 0, size: int = 50) -> Dict[str, Any]:
        """
        GET /services/invoice/out/findByUsername
        Params: username, startDate(YYYY-MM-DD), endDate(YYYY-MM-DD), page, size
        """
        client = self._get_session()
        try:
            params = {"page": page, "size": size}
            if username:
                params["username"] = username
            if date_from:
                params["startDate"] = date_from
            if date_to:
                params["endDate"] = date_to

            response = client.get(
                f"{self.ws_url}/services/invoice/out/findByUsername",
                params=params,
                headers=self._get_headers()
            )
            result = self._handle_response(response, "search_sent_invoices")
            if result["success"]:
                data = result["data"]
                invoices_raw = data.get("content") or data.get("invoices") or []
                invoices = []
                for inv in invoices_raw:
                    invoices.append({
                        "filename": inv.get("filename") or inv.get("invoiceFilename"),
                        "id_sdi": inv.get("idSdi"),
                        "stato": self.STATO_MAP.get(
                            inv.get("invoiceStatus", ""),
                            inv.get("invoiceStatus", "").lower()
                        ),
                        "stato_originale": inv.get("invoiceStatus"),
                        "data_invio": inv.get("invoiceDate") or inv.get("uploadDate"),
                        "destinatario": inv.get("receiver"),
                        "raw": inv,
                    })
                return {
                    "success": True,
                    "invoices": invoices,
                    "total": data.get("totalElements", len(invoices)),
                    "page": data.get("number", page),
                    "raw_response": data,
                }
            return {"success": False, "invoices": [], "error": result.get("error_description")}
        except Exception as e:
            logger.error(f"Search sent invoices exception: {e}")
            return {"success": False, "invoices": [], "error": str(e)}
        finally:
            client.close()

    # --- Ricerca fatture ricevute ---

    def search_received_invoices(self, username: str = None,
                                  date_from: str = None, date_to: str = None,
                                  page: int = 0, size: int = 50) -> Dict[str, Any]:
        """
        GET /services/invoice/in/findByUsername
        """
        client = self._get_session()
        try:
            params = {"page": page, "size": size}
            if username:
                params["username"] = username
            if date_from:
                params["startDate"] = date_from
            if date_to:
                params["endDate"] = date_to

            response = client.get(
                f"{self.ws_url}/services/invoice/in/findByUsername",
                params=params,
                headers=self._get_headers()
            )
            result = self._handle_response(response, "search_received_invoices")
            if result["success"]:
                data = result["data"]
                invoices_raw = data.get("content") or data.get("invoices") or []
                invoices = []
                for inv in invoices_raw:
                    invoices.append({
                        "filename": inv.get("filename") or inv.get("invoiceFilename"),
                        "id_sdi": inv.get("idSdi"),
                        "cedente": inv.get("sender"),
                        "data_ricezione": inv.get("receiveDate"),
                        "raw": inv,
                    })
                return {
                    "success": True,
                    "invoices": invoices,
                    "total": data.get("totalElements", len(invoices)),
                    "page": data.get("number", page),
                    "raw_response": data,
                }
            return {"success": False, "invoices": [], "error": result.get("error_description")}
        except Exception as e:
            logger.error(f"Search received invoices exception: {e}")
            return {"success": False, "invoices": [], "error": str(e)}
        finally:
            client.close()

    # --- Dettaglio fattura ---

    def get_invoice_detail(self, invoice_id: str = None,
                           filename: str = None) -> Dict[str, Any]:
        """
        GET /services/invoice/out/getByFilename?filename=X
        oppure
        GET /services/invoice/out/invoiceId/{id}
        """
        client = self._get_session()
        try:
            if filename:
                response = client.get(
                    f"{self.ws_url}/services/invoice/out/getByFilename",
                    params={"filename": filename},
                    headers=self._get_headers()
                )
            elif invoice_id:
                response = client.get(
                    f"{self.ws_url}/services/invoice/out/invoiceId/{invoice_id}",
                    headers=self._get_headers()
                )
            else:
                return {"success": False, "error": "Specificare filename o invoice_id"}

            result = self._handle_response(response, "get_invoice_detail")
            if result["success"]:
                data = result["data"]
                xml_b64 = data.get("file") or data.get("invoiceFile")
                xml_decoded = None
                if xml_b64:
                    try:
                        xml_decoded = base64.b64decode(xml_b64).decode("utf-8")
                    except Exception:
                        xml_decoded = xml_b64

                return {
                    "success": True,
                    "invoice_data": data,
                    "xml_content": xml_decoded,
                    "notifications": data.get("notifications", []),
                    "raw_response": data,
                }
            return {"success": False, "error": result.get("error_description")}
        except Exception as e:
            logger.error(f"Get invoice detail exception: {e}")
            return {"success": False, "error": str(e)}
        finally:
            client.close()

    # --- Notifiche ---

    def get_notifications(self, invoice_filename: str) -> List[Dict[str, Any]]:
        """
        GET /services/notification/out/getByInvoiceFilename?invoiceFilename=X
        """
        client = self._get_session()
        try:
            response = client.get(
                f"{self.ws_url}/services/notification/out/getByInvoiceFilename",
                params={"invoiceFilename": invoice_filename},
                headers=self._get_headers()
            )
            result = self._handle_response(response, "get_notifications")
            if result["success"]:
                return result["data"] if isinstance(result["data"], list) else [result["data"]]
            return []
        except Exception as e:
            logger.error(f"Get notifications exception: {e}")
            return []
        finally:
            client.close()

    # --- Download ZIP ---

    def download_invoice_zip(self, filename: str) -> Optional[bytes]:
        """
        GET /services/invoice/out/getZipByFilename?filename=X
        Ritorna bytes del file ZIP
        """
        client = self._get_session()
        try:
            headers = self._get_headers()
            headers["Accept"] = "application/octet-stream"
            response = client.get(
                f"{self.ws_url}/services/invoice/out/getZipByFilename",
                params={"filename": filename},
                headers=headers
            )
            if response.status_code == 200:
                return response.content
            return None
        except Exception as e:
            logger.error(f"Download ZIP exception: {e}")
            return None
        finally:
            client.close()

    # --- Simulatore SDI (solo ambiente demo) ---

    def simulate_receive_invoice(self, partita_iva_destinatario: str) -> Dict[str, Any]:
        """
        POST /services/sdisimulator/invoiceIn  (solo DEMO)
        Simula ricezione fattura per test
        """
        if self.ambiente not in ("demo", "test"):
            return {"success": False, "error": "Simulatore disponibile solo in ambiente demo"}

        client = self._get_session()
        try:
            response = client.post(
                f"{self.ws_url}/services/sdisimulator/invoiceIn",
                json={"vatNumber": partita_iva_destinatario},
                headers=self._get_headers()
            )
            return self._handle_response(response, "simulate_receive")
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            client.close()

    def simulate_notification(self, invoice_filename: str,
                              notification_type: str = "RC") -> Dict[str, Any]:
        """
        POST /services/sdisimulator/notificationOut  (solo DEMO)
        notification_type: RC, NS, MC, NE, DT
        """
        if self.ambiente not in ("demo", "test"):
            return {"success": False, "error": "Simulatore disponibile solo in ambiente demo"}

        client = self._get_session()
        try:
            response = client.post(
                f"{self.ws_url}/services/sdisimulator/notificationOut",
                json={
                    "invoiceFileName": invoice_filename,
                    "notificationType": notification_type,
                },
                headers=self._get_headers()
            )
            return self._handle_response(response, "simulate_notification")
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            client.close()


# ==========================================
# PROVIDER: MANUALE (genera solo XML, no invio)
# ==========================================

class ManualSDIProvider(SDIProvider):
    """Provider manuale: genera XML ma non invia. Per uso con PEC o altro gestionale."""

    def authenticate(self) -> bool:
        return True

    def upload_invoice(self, xml_content: str, filename: str,
                       signed: bool = False) -> Dict[str, Any]:
        return {
            "success": True,
            "upload_filename": filename,
            "error_code": None,
            "error_description": "Invio manuale - XML generato, da inviare via PEC o gestionale",
            "raw_response": None,
        }

    def get_invoice_status(self, filename: str) -> Dict[str, Any]:
        return {"success": True, "stato": "generata", "raw_response": None}

    def search_sent_invoices(self, **kwargs) -> Dict[str, Any]:
        return {"success": True, "invoices": [], "total": 0}

    def search_received_invoices(self, **kwargs) -> Dict[str, Any]:
        return {"success": True, "invoices": [], "total": 0}

    def get_invoice_detail(self, **kwargs) -> Dict[str, Any]:
        return {"success": False, "error": "Non disponibile in modalità manuale"}

    def get_notifications(self, invoice_filename: str) -> list:
        return []

    def download_invoice_zip(self, filename: str) -> Optional[bytes]:
        return None


# ==========================================
# FACTORY
# ==========================================

def get_sdi_provider(config: dict) -> SDIProvider:
    """
    Factory per ottenere il provider SDI corretto dalla configurazione.
    
    Args:
        config: dict con dati ConfigurazioneFatturazione (sdi_provider, sdi_username, ecc.)
    
    Returns:
        Istanza del provider corretto
    """
    provider_name = (config.get("sdi_provider") or "manuale").lower()

    if provider_name == "aruba":
        username = config.get("sdi_username", "")
        password = config.get("sdi_password", "")  # già decriptata
        ambiente = config.get("sdi_ambiente", "demo")
        return ArubaSDIProvider(username, password, ambiente)
    elif provider_name == "manuale":
        return ManualSDIProvider()
    else:
        logger.warning(f"Provider SDI sconosciuto: {provider_name}, uso manuale")
        return ManualSDIProvider()
