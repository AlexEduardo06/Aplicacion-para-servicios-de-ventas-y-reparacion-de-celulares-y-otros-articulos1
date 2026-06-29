"""Backend API tests for Gestion Movil app: transactions, phones, repairs, summary."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://phone-repair-mgmt-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Health ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Transactions ----------
class TestTransactions:
    created_id = None

    def test_create_ingreso(self, s):
        r = s.post(f"{API}/transactions", json={
            "type": "ingreso", "amount": 1500.50,
            "category": "venta", "description": "TEST_venta"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "ingreso"
        assert d["amount"] == 1500.50
        assert "id" in d and "date" in d
        TestTransactions.created_id = d["id"]

    def test_create_egreso(self, s):
        r = s.post(f"{API}/transactions", json={
            "type": "egreso", "amount": 200,
            "category": "gasto", "description": "TEST_egreso"
        })
        assert r.status_code == 200
        assert r.json()["type"] == "egreso"

    def test_list_contains_created(self, s):
        r = s.get(f"{API}/transactions")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTransactions.created_id in ids

    def test_summary_today(self, s):
        r = s.get(f"{API}/summary/today")
        assert r.status_code == 200
        d = r.json()
        for k in ("ingresos", "egresos", "balance", "count"):
            assert k in d
        assert d["balance"] == round(d["ingresos"] - d["egresos"], 2)

    def test_summary_range(self, s):
        r = s.get(f"{API}/summary/range", params={"days": 7})
        assert r.status_code == 200
        d = r.json()
        assert d["days"] == 7
        assert "balance" in d

    def test_delete_transaction(self, s):
        assert TestTransactions.created_id
        r = s.delete(f"{API}/transactions/{TestTransactions.created_id}")
        assert r.status_code == 200
        # verify gone
        r2 = s.delete(f"{API}/transactions/{TestTransactions.created_id}")
        assert r2.status_code == 404


# ---------- Phones ----------
class TestPhones:
    created_id = None

    def test_create_phone(self, s):
        r = s.post(f"{API}/phones", json={
            "brand": "TEST_Apple", "model": "iPhone 13",
            "imei": "111222333", "color": "Negro",
            "condition": "usado", "buy_price": 15000,
            "sell_price": 22000, "stock": 2, "status": "disponible"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["brand"] == "TEST_Apple"
        assert d["condition"] == "usado"
        assert "id" in d
        TestPhones.created_id = d["id"]

    def test_get_phone(self, s):
        r = s.get(f"{API}/phones/{TestPhones.created_id}")
        assert r.status_code == 200
        assert r.json()["model"] == "iPhone 13"

    def test_list_phones(self, s):
        r = s.get(f"{API}/phones")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_update_phone(self, s):
        r = s.put(f"{API}/phones/{TestPhones.created_id}", json={
            "sell_price": 23500, "status": "vendido"
        })
        assert r.status_code == 200
        d = r.json()
        assert d["sell_price"] == 23500
        assert d["status"] == "vendido"
        # verify persistence
        g = s.get(f"{API}/phones/{TestPhones.created_id}").json()
        assert g["sell_price"] == 23500

    def test_invalid_condition_rejected(self, s):
        r = s.post(f"{API}/phones", json={
            "brand": "X", "model": "Y", "condition": "bad_value"
        })
        assert r.status_code == 422

    def test_delete_phone(self, s):
        r = s.delete(f"{API}/phones/{TestPhones.created_id}")
        assert r.status_code == 200
        r2 = s.get(f"{API}/phones/{TestPhones.created_id}")
        assert r2.status_code == 404


# ---------- Repairs ----------
class TestRepairs:
    created_id = None

    def test_create_repair(self, s):
        r = s.post(f"{API}/repairs", json={
            "client_name": "TEST_Juan", "client_phone": "8091234567",
            "device": "Samsung A52", "fault": "Pantalla rota",
            "cost": 3500, "status": "recibido"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "recibido"
        assert d["delivered_at"] is None
        TestRepairs.created_id = d["id"]

    def test_list_repairs(self, s):
        r = s.get(f"{API}/repairs")
        assert r.status_code == 200
        assert any(rp["id"] == TestRepairs.created_id for rp in r.json())

    def test_status_progress(self, s):
        for st in ("en_progreso", "listo"):
            r = s.put(f"{API}/repairs/{TestRepairs.created_id}", json={"status": st})
            assert r.status_code == 200
            assert r.json()["status"] == st
            assert r.json()["delivered_at"] is None

    def test_status_entregado_sets_delivered_at(self, s):
        r = s.put(f"{API}/repairs/{TestRepairs.created_id}", json={"status": "entregado"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "entregado"
        assert d["delivered_at"] is not None

    def test_invalid_status_rejected(self, s):
        # Note: RepairUpdate.status is plain Optional[str], so validator allows; backend doesn't enforce on update.
        # Only assert that create rejects invalid status (Literal enforced).
        r = s.post(f"{API}/repairs", json={
            "client_name": "X", "device": "Y", "fault": "Z", "status": "wrong"
        })
        assert r.status_code == 422

    def test_delete_repair(self, s):
        r = s.delete(f"{API}/repairs/{TestRepairs.created_id}")
        assert r.status_code == 200
        r2 = s.delete(f"{API}/repairs/{TestRepairs.created_id}")
        assert r2.status_code == 404


# ---------- Edge cases ----------
def test_delete_nonexistent_transaction(s):
    r = s.delete(f"{API}/transactions/nonexistent-id")
    assert r.status_code == 404


def test_update_phone_empty_body(s):
    # create then attempt empty update
    c = s.post(f"{API}/phones", json={"brand": "TEST_E", "model": "M"}).json()
    r = s.put(f"{API}/phones/{c['id']}", json={})
    assert r.status_code == 400
    s.delete(f"{API}/phones/{c['id']}")
