"""Backend tests for new deliver_repair and updated sell_phone endpoints with automatic debt creation."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def tracker():
    return {"phones": [], "repairs": [], "debts": [], "tx": []}


def _create_phone(s, tracker, stock=1, price=5000):
    r = s.post(f"{API}/phones", json={
        "brand": "TEST_Xiaomi", "model": "Redmi Note 12",
        "imei": "999888777", "condition": "nuevo",
        "buy_price": 3000, "sell_price": price, "stock": stock,
    })
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    tracker["phones"].append(pid)
    return pid


def _create_repair(s, tracker, cost=2000):
    r = s.post(f"{API}/repairs", json={
        "client_name": "TEST_Ana",
        "client_phone": "8095551234",
        "device": "iPhone 12",
        "fault": "Bateria",
        "cost": cost,
        "status": "listo",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    tracker["repairs"].append(rid)
    return rid


# ==================== DELIVER REPAIR ====================
class TestDeliverRepair:
    def test_partial_pay_creates_tx_and_debt(self, s, tracker):
        rid = _create_repair(s, tracker, cost=2000)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": 1500, "method": "efectivo"})
        assert r.status_code == 200, r.text
        d = r.json()
        # Repair now entregado
        assert d["repair"]["status"] == "entregado"
        assert d["repair"]["delivered_at"] is not None
        # Transaction for 1500
        assert d["transaction"] is not None
        assert d["transaction"]["amount"] == 1500
        assert d["transaction"]["type"] == "ingreso"
        assert d["transaction"]["category"] == "reparacion"
        assert d["transaction"]["related_repair_id"] == rid
        tracker["tx"].append(d["transaction"]["id"])
        # Debt for 500
        assert d["debt"] is not None
        assert d["debt"]["original_amount"] == 500
        assert d["debt"]["balance"] == 500
        assert d["debt"]["source"] == "reparacion"
        assert d["debt"]["related_repair_id"] == rid
        assert d["debt"]["client_name"] == "TEST_Ana"
        tracker["debts"].append(d["debt"]["id"])

    def test_full_pay_no_debt(self, s, tracker):
        rid = _create_repair(s, tracker, cost=1200)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": 1200, "method": "transferencia"})
        assert r.status_code == 200
        d = r.json()
        assert d["repair"]["status"] == "entregado"
        assert d["transaction"] is not None
        assert d["transaction"]["amount"] == 1200
        assert d["debt"] is None
        assert d["pending"] == 0
        tracker["tx"].append(d["transaction"]["id"])

    def test_zero_pay_only_debt(self, s, tracker):
        rid = _create_repair(s, tracker, cost=800)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": 0})
        assert r.status_code == 200
        d = r.json()
        assert d["repair"]["status"] == "entregado"
        assert d["transaction"] is None  # No tx for zero paid
        assert d["debt"] is not None
        assert d["debt"]["original_amount"] == 800
        assert d["debt"]["source"] == "reparacion"
        tracker["debts"].append(d["debt"]["id"])

    def test_overpay_capped_to_cost(self, s, tracker):
        rid = _create_repair(s, tracker, cost=500)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": 9999})
        assert r.status_code == 200
        d = r.json()
        assert d["paid"] == 500
        assert d["pending"] == 0
        assert d["debt"] is None
        tracker["tx"].append(d["transaction"]["id"])

    def test_negative_pay_rejected(self, s, tracker):
        rid = _create_repair(s, tracker, cost=500)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": -1})
        assert r.status_code == 400

    def test_deliver_nonexistent(self, s):
        r = s.post(f"{API}/repairs/does-not-exist/deliver", json={"paid": 100})
        assert r.status_code == 404


# ==================== SELL PHONE ====================
class TestSellPhone:
    def test_partial_pay_creates_debt_with_client(self, s, tracker):
        pid = _create_phone(s, tracker, stock=2, price=8000)
        r = s.post(f"{API}/phones/{pid}/sell", json={
            "price": 8000,
            "paid": 5000,
            "method": "efectivo",
            "client_name": "TEST_Pedro",
            "client_phone": "8091112222",
            "description": "TEST venta parcial",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid"] == 5000
        assert d["pending"] == 3000
        assert d["price"] == 8000
        # Transaction
        assert d["transaction"] is not None
        assert d["transaction"]["amount"] == 5000
        assert d["transaction"]["category"] == "venta"
        assert d["transaction"]["related_phone_id"] == pid
        tracker["tx"].append(d["transaction"]["id"])
        # Debt
        assert d["debt"] is not None
        assert d["debt"]["original_amount"] == 3000
        assert d["debt"]["client_name"] == "TEST_Pedro"
        assert d["debt"]["client_phone"] == "8091112222"
        assert d["debt"]["source"] == "venta"
        assert d["debt"]["related_phone_id"] == pid
        tracker["debts"].append(d["debt"]["id"])
        # Stock decreased by 1
        assert d["phone"]["stock"] == 1
        assert d["phone"]["status"] == "disponible"

    def test_full_pay_no_debt(self, s, tracker):
        pid = _create_phone(s, tracker, stock=1, price=6000)
        r = s.post(f"{API}/phones/{pid}/sell", json={
            "price": 6000,
            "paid": 6000,
            "method": "tarjeta",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["debt"] is None
        assert d["pending"] == 0
        assert d["transaction"]["amount"] == 6000
        assert d["phone"]["stock"] == 0
        assert d["phone"]["status"] == "vendido"
        tracker["tx"].append(d["transaction"]["id"])

    def test_partial_without_client_name_uses_default(self, s, tracker):
        pid = _create_phone(s, tracker, stock=1, price=4000)
        r = s.post(f"{API}/phones/{pid}/sell", json={
            "price": 4000, "paid": 1000,
        })
        assert r.status_code == 200
        d = r.json()
        assert d["debt"] is not None
        # No client provided - falls back to default
        assert d["debt"]["client_name"] == "Cliente sin nombre"
        tracker["debts"].append(d["debt"]["id"])
        if d.get("transaction"):
            tracker["tx"].append(d["transaction"]["id"])

    def test_default_paid_equals_price(self, s, tracker):
        pid = _create_phone(s, tracker, stock=1, price=3500)
        r = s.post(f"{API}/phones/{pid}/sell", json={})
        assert r.status_code == 200
        d = r.json()
        assert d["price"] == 3500
        assert d["paid"] == 3500
        assert d["debt"] is None
        tracker["tx"].append(d["transaction"]["id"])

    def test_sell_out_of_stock(self, s, tracker):
        pid = _create_phone(s, tracker, stock=1, price=1000)
        s.post(f"{API}/phones/{pid}/sell", json={"price": 1000, "paid": 1000})
        # sold; now second attempt
        r = s.post(f"{API}/phones/{pid}/sell", json={"price": 1000, "paid": 1000})
        assert r.status_code == 400


# ==================== INTEGRATION: pay debt flows into caja ====================
class TestDebtFlowIntoCaja:
    def test_pay_debt_from_repair_appears_in_caja(self, s, tracker):
        # Create repair, deliver with debt, then pay debt -> confirm caja
        rid = _create_repair(s, tracker, cost=3000)
        r = s.post(f"{API}/repairs/{rid}/deliver", json={"paid": 0})
        did = r.json()["debt"]["id"]
        tracker["debts"].append(did)

        ing_before = s.get(f"{API}/summary/today").json()["ingresos"]
        r = s.post(f"{API}/debts/{did}/pay", json={"amount": 3000, "method": "efectivo"})
        assert r.status_code == 200
        assert r.json()["status"] == "pagado"
        ing_after = s.get(f"{API}/summary/today").json()["ingresos"]
        assert round(ing_after - ing_before, 2) == 3000


def test_zzz_cleanup(s, tracker):
    # Delete all created resources and linked transactions
    for did in tracker["debts"]:
        r = s.get(f"{API}/debts/{did}")
        if r.status_code == 200:
            for p in r.json().get("payments", []):
                if p.get("transaction_id"):
                    s.delete(f"{API}/transactions/{p['transaction_id']}")
        s.delete(f"{API}/debts/{did}")
    for tx in tracker["tx"]:
        s.delete(f"{API}/transactions/{tx}")
    for rid in tracker["repairs"]:
        s.delete(f"{API}/repairs/{rid}")
    for pid in tracker["phones"]:
        s.delete(f"{API}/phones/{pid}")
