"""Backend tests for Debts (accounts receivable) module."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def created_ids():
    return {"debts": []}


def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200


def test_summary_totals_shape(s):
    r = s.get(f"{API}/debts/summary/totals")
    assert r.status_code == 200
    d = r.json()
    for k in ("total_pending", "total_paid", "total_original", "count_pending", "count_paid"):
        assert k in d


def test_list_debts(s):
    r = s.get(f"{API}/debts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_debt_and_get(s, created_ids):
    payload = {
        "client_name": "TEST_Cliente Debts",
        "client_phone": "809-000-1111",
        "concept": "TEST Reparación pantalla",
        "source": "reparacion",
        "original_amount": 5000.0,
        "notes": "test note",
    }
    r = s.post(f"{API}/debts", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["client_name"] == "TEST_Cliente Debts"
    assert d["original_amount"] == 5000.0
    assert d["paid_amount"] == 0
    assert d["balance"] == 5000.0
    assert d["status"] == "pendiente"
    assert d["payments"] == []
    created_ids["debts"].append(d["id"])

    # GET verify persistence
    r2 = s.get(f"{API}/debts/{d['id']}")
    assert r2.status_code == 200
    assert r2.json()["id"] == d["id"]


def test_partial_pay_creates_transaction_and_updates_status(s, created_ids):
    # Snapshot caja
    ing_before = s.get(f"{API}/summary/today").json()["ingresos"]

    # Create fresh debt
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_Partial",
        "concept": "TEST parcial",
        "source": "venta",
        "original_amount": 10000.0,
    })
    assert r.status_code == 200
    debt = r.json()
    debt_id = debt["id"]
    created_ids["debts"].append(debt_id)

    # Partial pay 3000
    r = s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 3000.0, "method": "efectivo"})
    assert r.status_code == 200, r.text
    upd = r.json()
    assert upd["paid_amount"] == 3000.0
    assert upd["balance"] == 7000.0
    assert upd["status"] == "pagado_parcial"
    assert len(upd["payments"]) == 1
    tx_id = upd["payments"][0]["transaction_id"]
    assert tx_id

    # Verify transaction exists in caja
    txs = s.get(f"{API}/transactions").json()
    match = [t for t in txs if t["id"] == tx_id]
    assert len(match) == 1
    tx = match[0]
    assert tx["type"] == "ingreso"
    assert tx["amount"] == 3000.0
    assert tx["category"] == "venta"

    # Verify today's ingresos increased
    ing_after = s.get(f"{API}/summary/today").json()["ingresos"]
    assert round(ing_after - ing_before, 2) == 3000.0


def test_full_pay_marks_pagado(s, created_ids):
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_Full",
        "concept": "TEST full pay",
        "source": "otro",
        "original_amount": 1500.0,
    })
    debt_id = r.json()["id"]
    created_ids["debts"].append(debt_id)

    r = s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 1500.0, "method": "transferencia"})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "pagado"
    assert d["balance"] == 0.0
    assert d["paid_amount"] == 1500.0


def test_overpay_is_capped(s, created_ids):
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_Over",
        "concept": "TEST overpay",
        "source": "otro",
        "original_amount": 500.0,
    })
    debt_id = r.json()["id"]
    created_ids["debts"].append(debt_id)

    # Attempt to pay 999 — must cap at 500
    r = s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 999.0})
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "pagado"
    assert d["paid_amount"] == 500.0
    assert d["payments"][0]["amount"] == 500.0


def test_pay_zero_rejected(s, created_ids):
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_ZeroPay",
        "concept": "TEST zero",
        "source": "otro",
        "original_amount": 100.0,
    })
    debt_id = r.json()["id"]
    created_ids["debts"].append(debt_id)

    r = s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 0})
    assert r.status_code == 400


def test_pay_already_saldado_rejected(s, created_ids):
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_Saldada",
        "concept": "TEST saldada",
        "source": "otro",
        "original_amount": 200.0,
    })
    debt_id = r.json()["id"]
    created_ids["debts"].append(debt_id)

    s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 200.0})
    r2 = s.post(f"{API}/debts/{debt_id}/pay", json={"amount": 50.0})
    assert r2.status_code == 400


def test_update_debt(s, created_ids):
    r = s.post(f"{API}/debts", json={
        "client_name": "TEST_Update",
        "concept": "TEST update",
        "source": "otro",
        "original_amount": 1000.0,
    })
    debt_id = r.json()["id"]
    created_ids["debts"].append(debt_id)

    r = s.put(f"{API}/debts/{debt_id}", json={"notes": "updated notes"})
    assert r.status_code == 200
    assert r.json()["notes"] == "updated notes"


def test_zzz_cleanup(s, created_ids):
    # Cleanup created debts and any linked pay transactions
    for did in created_ids["debts"]:
        # Read to find linked transactions
        r = s.get(f"{API}/debts/{did}")
        if r.status_code == 200:
            for p in r.json().get("payments", []):
                tx_id = p.get("transaction_id")
                if tx_id:
                    s.delete(f"{API}/transactions/{tx_id}")
            s.delete(f"{API}/debts/{did}")
    # Verify delete idempotency
    if created_ids["debts"]:
        r = s.delete(f"{API}/debts/{created_ids['debts'][0]}")
        assert r.status_code == 404
