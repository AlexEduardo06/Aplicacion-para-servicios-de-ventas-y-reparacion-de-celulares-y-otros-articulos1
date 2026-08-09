"""Backend tests for due_date support in Repairs and Debts."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://phone-repair-mgmt-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _future(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(hour=23, minute=59, second=59, microsecond=0).isoformat()


class TestRepairDueDate:
    created_ids: list[str] = []

    def test_create_repair_with_due_date(self, client):
        payload = {
            "client_name": "TEST_DueDate Cliente",
            "client_phone": "809-000-0000",
            "device": "iPhone 12",
            "fault": "Pantalla",
            "cost": 3500,
            "status": "recibido",
            "due_date": _future(5),
        }
        r = client.post(f"{API}/repairs", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["due_date"] == payload["due_date"]
        assert body["id"]
        TestRepairDueDate.created_ids.append(body["id"])

    def test_list_repairs_includes_due_date(self, client):
        r = client.get(f"{API}/repairs")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        target = next((x for x in items if x["id"] in TestRepairDueDate.created_ids), None)
        assert target is not None
        assert "due_date" in target
        assert target["due_date"] is not None

    def test_create_repair_without_due_date_backward_compat(self, client):
        payload = {
            "client_name": "TEST_NoDue Cliente",
            "device": "Samsung",
            "fault": "Batería",
            "cost": 1500,
            "status": "recibido",
        }
        r = client.post(f"{API}/repairs", json=payload)
        assert r.status_code == 200
        body = r.json()
        assert body["due_date"] is None
        TestRepairDueDate.created_ids.append(body["id"])

    def test_update_repair_due_date(self, client):
        if not TestRepairDueDate.created_ids:
            pytest.skip("no repair")
        rid = TestRepairDueDate.created_ids[0]
        new_date = _future(10)
        r = client.put(f"{API}/repairs/{rid}", json={"due_date": new_date})
        assert r.status_code == 200
        assert r.json()["due_date"] == new_date

    def test_cleanup_repairs(self, client):
        for rid in TestRepairDueDate.created_ids:
            client.delete(f"{API}/repairs/{rid}")


class TestDebtDueDate:
    created_ids: list[str] = []

    def test_create_debt_with_due_date(self, client):
        payload = {
            "client_name": "TEST_Debt Due",
            "client_phone": "",
            "concept": "Venta accesorio",
            "source": "venta",
            "original_amount": 2000,
            "due_date": _future(3),
        }
        r = client.post(f"{API}/debts", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["due_date"] == payload["due_date"]
        assert body["balance"] == 2000
        assert body["status"] == "pendiente"
        TestDebtDueDate.created_ids.append(body["id"])

    def test_create_debt_without_due_date(self, client):
        payload = {
            "client_name": "TEST_Debt NoDue",
            "concept": "Otro",
            "source": "otro",
            "original_amount": 500,
        }
        r = client.post(f"{API}/debts", json=payload)
        assert r.status_code == 200
        body = r.json()
        assert body.get("due_date") is None
        TestDebtDueDate.created_ids.append(body["id"])

    def test_list_debts_includes_due_date(self, client):
        r = client.get(f"{API}/debts")
        assert r.status_code == 200
        items = r.json()
        target = next((x for x in items if x["id"] in TestDebtDueDate.created_ids and x["client_name"].startswith("TEST_Debt Due")), None)
        assert target is not None
        assert target["due_date"] is not None

    def test_update_debt_due_date(self, client):
        if not TestDebtDueDate.created_ids:
            pytest.skip("no debt")
        did = TestDebtDueDate.created_ids[0]
        new_date = _future(15)
        r = client.put(f"{API}/debts/{did}", json={"due_date": new_date})
        assert r.status_code == 200
        assert r.json()["due_date"] == new_date

    def test_cleanup_debts(self, client):
        for did in TestDebtDueDate.created_ids:
            client.delete(f"{API}/debts/{did}")
