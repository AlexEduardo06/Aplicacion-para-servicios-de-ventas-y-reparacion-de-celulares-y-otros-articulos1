from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------- MODELS -------------------

# Transactions
class TransactionCreate(BaseModel):
    type: Literal["ingreso", "egreso"]
    amount: float
    category: str  # venta, reparacion, compra, gasto, otro
    description: Optional[str] = ""
    related_phone_id: Optional[str] = None
    related_repair_id: Optional[str] = None
    date: Optional[str] = None


class Transaction(BaseModel):
    id: str
    type: str
    amount: float
    category: str
    description: str = ""
    related_phone_id: Optional[str] = None
    related_repair_id: Optional[str] = None
    date: str


# Phones (Inventory)
class PhoneCreate(BaseModel):
    brand: str
    model: str
    imei: Optional[str] = ""
    color: Optional[str] = ""
    condition: Literal["nuevo", "usado", "reacondicionado"] = "nuevo"
    buy_price: float = 0
    sell_price: float = 0
    stock: int = 1
    photo: Optional[str] = ""  # base64
    status: Literal["disponible", "vendido"] = "disponible"
    notes: Optional[str] = ""


class Phone(PhoneCreate):
    id: str
    created_at: str


class PhoneUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    imei: Optional[str] = None
    color: Optional[str] = None
    condition: Optional[str] = None
    buy_price: Optional[float] = None
    sell_price: Optional[float] = None
    stock: Optional[int] = None
    photo: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


# Repairs
class RepairPhoto(BaseModel):
    type: Literal["antes", "despues"] = "antes"
    data: str  # base64 data URI


class RepairCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = ""
    device: str
    fault: str
    cost: float = 0
    status: Literal["recibido", "en_progreso", "listo", "entregado"] = "recibido"
    notes: Optional[str] = ""
    photos: Optional[List[RepairPhoto]] = None


class Repair(RepairCreate):
    id: str
    created_at: str
    listo_at: Optional[str] = None
    delivered_at: Optional[str] = None
    photos: List[RepairPhoto] = []


class RepairUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    device: Optional[str] = None
    fault: Optional[str] = None
    cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    photos: Optional[List[RepairPhoto]] = None


# Debts (accounts receivable)
class Payment(BaseModel):
    amount: float
    date: str
    method: str = "efectivo"
    transaction_id: Optional[str] = None


class DebtCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = ""
    concept: str
    source: Literal["venta", "reparacion", "otro"] = "otro"
    original_amount: float
    due_date: Optional[str] = None
    notes: Optional[str] = ""
    related_phone_id: Optional[str] = None
    related_repair_id: Optional[str] = None


class Debt(DebtCreate):
    id: str
    paid_amount: float = 0
    balance: float
    status: Literal["pendiente", "pagado_parcial", "pagado"] = "pendiente"
    payments: List[Payment] = []
    created_at: str


class DebtUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    concept: Optional[str] = None
    source: Optional[str] = None
    original_amount: Optional[float] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None


class PayDebtInput(BaseModel):
    amount: float
    method: str = "efectivo"
    date: Optional[str] = None


# ------------------- ROUTES -------------------

@api_router.get("/")
async def root():
    return {"message": "Gestion Movil API"}


# ---- Transactions ----
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(input: TransactionCreate):
    data = input.model_dump()
    data["id"] = str(uuid.uuid4())
    data["date"] = data.get("date") or now_iso()
    data["description"] = data.get("description") or ""
    await db.transactions.insert_one(data)
    data.pop("_id", None)
    return Transaction(**data)


@api_router.get("/transactions", response_model=List[Transaction])
async def list_transactions(limit: int = 200):
    cursor = db.transactions.find({}, {"_id": 0}).sort("date", -1).limit(limit)
    return [Transaction(**doc) async for doc in cursor]


@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str):
    res = await db.transactions.delete_one({"id": tx_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Transaction not found")
    return {"ok": True}


@api_router.get("/summary/today")
async def summary_today():
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).isoformat()
    end = (datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)).isoformat()
    cursor = db.transactions.find(
        {"date": {"$gte": start, "$lt": end}}, {"_id": 0}
    )
    ingresos = 0.0
    egresos = 0.0
    count = 0
    async for tx in cursor:
        if tx["type"] == "ingreso":
            ingresos += tx["amount"]
        else:
            egresos += tx["amount"]
        count += 1
    return {
        "ingresos": round(ingresos, 2),
        "egresos": round(egresos, 2),
        "balance": round(ingresos - egresos, 2),
        "count": count,
    }


@api_router.get("/summary/range")
async def summary_range(days: int = 7, start: Optional[str] = None, end: Optional[str] = None):
    if start and end:
        start_iso, end_iso = start, end
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()
    cursor = db.transactions.find(
        {"date": {"$gte": start_iso, "$lte": end_iso}}, {"_id": 0}
    )
    ingresos = 0.0
    egresos = 0.0
    async for tx in cursor:
        if tx["type"] == "ingreso":
            ingresos += tx["amount"]
        else:
            egresos += tx["amount"]
    return {
        "days": days,
        "start": start_iso,
        "end": end_iso,
        "ingresos": round(ingresos, 2),
        "egresos": round(egresos, 2),
        "balance": round(ingresos - egresos, 2),
    }


@api_router.get("/summary/by-category")
async def summary_by_category(days: int = 30, start: Optional[str] = None, end: Optional[str] = None):
    if start and end:
        start_iso, end_iso = start, end
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()
    cursor = db.transactions.find(
        {"date": {"$gte": start_iso, "$lte": end_iso}}, {"_id": 0}
    )
    ingresos: dict[str, float] = {}
    egresos: dict[str, float] = {}
    total_in = 0.0
    total_out = 0.0
    async for tx in cursor:
        bucket = ingresos if tx["type"] == "ingreso" else egresos
        bucket[tx["category"]] = bucket.get(tx["category"], 0.0) + tx["amount"]
        if tx["type"] == "ingreso":
            total_in += tx["amount"]
        else:
            total_out += tx["amount"]

    def to_list(d: dict[str, float], total: float):
        items = [
            {
                "category": k,
                "amount": round(v, 2),
                "percent": round((v / total * 100) if total > 0 else 0, 1),
            }
            for k, v in d.items()
        ]
        items.sort(key=lambda x: x["amount"], reverse=True)
        return items

    return {
        "days": days,
        "start": start_iso,
        "end": end_iso,
        "ingresos": to_list(ingresos, total_in),
        "egresos": to_list(egresos, total_out),
        "total_ingresos": round(total_in, 2),
        "total_egresos": round(total_out, 2),
    }


@api_router.get("/stats/top-clients")
async def top_clients(days: int = 30, start: Optional[str] = None, end: Optional[str] = None, limit: int = 5):
    if start and end:
        start_iso, end_iso = start, end
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()
    cursor = db.repairs.find(
        {"created_at": {"$gte": start_iso, "$lte": end_iso}}, {"_id": 0}
    )
    agg: dict[str, dict] = {}
    async for r in cursor:
        name = r["client_name"]
        bucket = agg.setdefault(name, {"client_name": name, "count": 0, "total": 0.0})
        bucket["count"] += 1
        bucket["total"] += float(r.get("cost", 0) or 0)
    items = list(agg.values())
    for it in items:
        it["total"] = round(it["total"], 2)
    items.sort(key=lambda x: x["total"], reverse=True)
    return items[:limit]


@api_router.get("/stats/top-phones")
async def top_phones(days: int = 30, start: Optional[str] = None, end: Optional[str] = None, limit: int = 5):
    if start and end:
        start_iso, end_iso = start, end
    else:
        end_dt = datetime.now(timezone.utc)
        start_dt = end_dt - timedelta(days=days)
        start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()
    cursor = db.transactions.find(
        {
            "date": {"$gte": start_iso, "$lte": end_iso},
            "type": "ingreso",
            "category": "venta",
            "related_phone_id": {"$ne": None},
        },
        {"_id": 0},
    )
    agg: dict[str, dict] = {}
    async for tx in cursor:
        pid = tx["related_phone_id"]
        phone = await db.phones.find_one({"id": pid}, {"_id": 0})
        if not phone:
            continue
        key = f"{phone['brand']} {phone['model']}"
        bucket = agg.setdefault(
            key,
            {"label": key, "brand": phone["brand"], "model": phone["model"], "count": 0, "total": 0.0},
        )
        bucket["count"] += 1
        bucket["total"] += float(tx["amount"])
    items = list(agg.values())
    for it in items:
        it["total"] = round(it["total"], 2)
    items.sort(key=lambda x: x["total"], reverse=True)
    return items[:limit]


# ---- Phones ----
@api_router.post("/phones", response_model=Phone)
async def create_phone(input: PhoneCreate):
    data = input.model_dump()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = now_iso()
    await db.phones.insert_one(data)
    data.pop("_id", None)
    return Phone(**data)


@api_router.get("/phones", response_model=List[Phone])
async def list_phones():
    cursor = db.phones.find({}, {"_id": 0}).sort("created_at", -1)
    return [Phone(**doc) async for doc in cursor]


@api_router.get("/phones/{phone_id}", response_model=Phone)
async def get_phone(phone_id: str):
    doc = await db.phones.find_one({"id": phone_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Phone not found")
    return Phone(**doc)


@api_router.put("/phones/{phone_id}", response_model=Phone)
async def update_phone(phone_id: str, input: PhoneUpdate):
    update = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    res = await db.phones.find_one_and_update(
        {"id": phone_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(404, "Phone not found")
    return Phone(**res)


@api_router.delete("/phones/{phone_id}")
async def delete_phone(phone_id: str):
    res = await db.phones.delete_one({"id": phone_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Phone not found")
    return {"ok": True}


class SellPhoneInput(BaseModel):
    price: Optional[float] = None
    paid: Optional[float] = None  # if less than price, remainder becomes a debt
    method: Optional[str] = "efectivo"
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    description: Optional[str] = ""


@api_router.post("/phones/{phone_id}/sell")
async def sell_phone(phone_id: str, input: SellPhoneInput):
    phone = await db.phones.find_one({"id": phone_id}, {"_id": 0})
    if not phone:
        raise HTTPException(404, "Phone not found")
    if phone.get("stock", 0) <= 0 or phone.get("status") == "vendido":
        raise HTTPException(400, "Equipo no disponible")

    sale_price = input.price if input.price and input.price > 0 else phone.get("sell_price", 0)
    sale_price = float(sale_price)
    paid = float(input.paid) if input.paid is not None else sale_price
    if paid < 0:
        raise HTTPException(400, "El monto pagado no puede ser negativo")
    if paid > sale_price:
        paid = sale_price
    pending = round(sale_price - paid, 2)

    new_stock = phone.get("stock", 1) - 1
    new_status = "vendido" if new_stock <= 0 else "disponible"
    await db.phones.update_one(
        {"id": phone_id},
        {"$set": {"stock": new_stock, "status": new_status}},
    )

    desc = input.description or f"Venta {phone['brand']} {phone['model']}"
    tx = None
    if paid > 0:
        tx = {
            "id": str(uuid.uuid4()),
            "type": "ingreso",
            "amount": paid,
            "category": "venta",
            "description": desc,
            "related_phone_id": phone_id,
            "related_repair_id": None,
            "date": now_iso(),
        }
        await db.transactions.insert_one(tx)
        tx.pop("_id", None)

    debt = None
    if pending > 0:
        debt_data = {
            "id": str(uuid.uuid4()),
            "client_name": (input.client_name or "").strip() or "Cliente sin nombre",
            "client_phone": (input.client_phone or "").strip(),
            "concept": f"Venta {phone['brand']} {phone['model']}",
            "source": "venta",
            "original_amount": pending,
            "paid_amount": 0.0,
            "status": "pendiente",
            "payments": [],
            "notes": desc,
            "related_phone_id": phone_id,
            "related_repair_id": None,
            "due_date": None,
            "created_at": now_iso(),
        }
        await db.debts.insert_one(debt_data)
        debt_data.pop("_id", None)
        debt = _debt_hydrate(dict(debt_data))

    updated_phone = await db.phones.find_one({"id": phone_id}, {"_id": 0})
    return {
        "phone": updated_phone,
        "transaction": tx,
        "debt": debt.model_dump() if debt else None,
        "pending": pending,
        "paid": paid,
        "price": sale_price,
    }


class DeliverRepairInput(BaseModel):
    paid: Optional[float] = None
    method: Optional[str] = "efectivo"


@api_router.post("/repairs/{repair_id}/deliver")
async def deliver_repair(repair_id: str, input: DeliverRepairInput):
    repair = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
    if not repair:
        raise HTTPException(404, "Repair not found")

    cost = float(repair.get("cost", 0) or 0)
    paid = float(input.paid) if input.paid is not None else cost
    if paid < 0:
        raise HTTPException(400, "El monto pagado no puede ser negativo")
    if paid > cost:
        paid = cost
    pending = round(cost - paid, 2)
    when = now_iso()

    await db.repairs.update_one(
        {"id": repair_id},
        {"$set": {"status": "entregado", "delivered_at": when}},
    )

    tx = None
    if paid > 0:
        tx = {
            "id": str(uuid.uuid4()),
            "type": "ingreso",
            "amount": paid,
            "category": "reparacion",
            "description": f"Reparación: {repair['client_name']} — {repair['device']}",
            "related_phone_id": None,
            "related_repair_id": repair_id,
            "date": when,
        }
        await db.transactions.insert_one(tx)
        tx.pop("_id", None)

    debt = None
    if pending > 0:
        debt_data = {
            "id": str(uuid.uuid4()),
            "client_name": repair["client_name"],
            "client_phone": repair.get("client_phone", "") or "",
            "concept": f"Reparación {repair['device']}",
            "source": "reparacion",
            "original_amount": pending,
            "paid_amount": 0.0,
            "status": "pendiente",
            "payments": [],
            "notes": repair.get("fault", "") or "",
            "related_phone_id": None,
            "related_repair_id": repair_id,
            "due_date": None,
            "created_at": when,
        }
        await db.debts.insert_one(debt_data)
        debt_data.pop("_id", None)
        debt = _debt_hydrate(dict(debt_data))

    updated_repair = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
    updated_repair.setdefault("photos", [])
    updated_repair.setdefault("listo_at", None)
    return {
        "repair": Repair(**updated_repair).model_dump(),
        "transaction": tx,
        "debt": debt.model_dump() if debt else None,
        "pending": pending,
        "paid": paid,
        "cost": cost,
    }


# ---- Repairs ----
@api_router.post("/repairs", response_model=Repair)
async def create_repair(input: RepairCreate):
    data = input.model_dump()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = now_iso()
    data["delivered_at"] = None
    data["listo_at"] = None
    data["photos"] = data.get("photos") or []
    if data.get("status") == "listo":
        data["listo_at"] = data["created_at"]
    await db.repairs.insert_one(data)
    data.pop("_id", None)
    return Repair(**data)


@api_router.get("/repairs", response_model=List[Repair])
async def list_repairs():
    cursor = db.repairs.find({}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for doc in cursor:
        doc.setdefault("photos", [])
        doc.setdefault("listo_at", None)
        out.append(Repair(**doc))
    return out


@api_router.put("/repairs/{repair_id}", response_model=Repair)
async def update_repair(repair_id: str, input: RepairUpdate):
    update = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    if update.get("status") == "entregado":
        update["delivered_at"] = now_iso()
    if update.get("status") == "listo":
        existing = await db.repairs.find_one({"id": repair_id}, {"_id": 0})
        if existing and not existing.get("listo_at"):
            update["listo_at"] = now_iso()
    res = await db.repairs.find_one_and_update(
        {"id": repair_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(404, "Repair not found")
    res.setdefault("photos", [])
    res.setdefault("listo_at", None)
    return Repair(**res)


@api_router.delete("/repairs/{repair_id}")
async def delete_repair(repair_id: str):
    res = await db.repairs.delete_one({"id": repair_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Repair not found")
    return {"ok": True}


@api_router.get("/backup")
async def backup_all():
    transactions = []
    async for d in db.transactions.find({}, {"_id": 0}):
        transactions.append(d)
    phones = []
    async for d in db.phones.find({}, {"_id": 0}):
        phones.append(d)
    repairs = []
    async for d in db.repairs.find({}, {"_id": 0}):
        d.setdefault("photos", [])
        d.setdefault("listo_at", None)
        repairs.append(d)
    debts = []
    async for d in db.debts.find({}, {"_id": 0}):
        d.setdefault("payments", [])
        debts.append(d)
    return {
        "exported_at": now_iso(),
        "app": "The Family Solutions",
        "version": 2,
        "counts": {
            "transactions": len(transactions),
            "phones": len(phones),
            "repairs": len(repairs),
            "debts": len(debts),
        },
        "transactions": transactions,
        "phones": phones,
        "repairs": repairs,
        "debts": debts,
    }


def _debt_hydrate(doc: dict) -> Debt:
    doc.setdefault("paid_amount", 0.0)
    doc.setdefault("payments", [])
    doc.setdefault("status", "pendiente")
    doc["balance"] = round(float(doc["original_amount"]) - float(doc["paid_amount"]), 2)
    return Debt(**doc)


@api_router.post("/debts", response_model=Debt)
async def create_debt(input: DebtCreate):
    data = input.model_dump()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = now_iso()
    data["paid_amount"] = 0.0
    data["payments"] = []
    data["status"] = "pendiente"
    to_insert = {**data}
    to_insert.pop("balance", None)
    await db.debts.insert_one(to_insert)
    to_insert.pop("_id", None)
    return _debt_hydrate(to_insert)


@api_router.get("/debts", response_model=List[Debt])
async def list_debts():
    cursor = db.debts.find({}, {"_id": 0}).sort("created_at", -1)
    out = []
    async for doc in cursor:
        out.append(_debt_hydrate(doc))
    return out


@api_router.get("/debts/{debt_id}", response_model=Debt)
async def get_debt(debt_id: str):
    doc = await db.debts.find_one({"id": debt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Debt not found")
    return _debt_hydrate(doc)


@api_router.put("/debts/{debt_id}", response_model=Debt)
async def update_debt(debt_id: str, input: DebtUpdate):
    update = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    res = await db.debts.find_one_and_update(
        {"id": debt_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(404, "Debt not found")
    return _debt_hydrate(res)


@api_router.delete("/debts/{debt_id}")
async def delete_debt(debt_id: str):
    res = await db.debts.delete_one({"id": debt_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Debt not found")
    return {"ok": True}


@api_router.post("/debts/{debt_id}/pay", response_model=Debt)
async def pay_debt(debt_id: str, input: PayDebtInput):
    debt = await db.debts.find_one({"id": debt_id}, {"_id": 0})
    if not debt:
        raise HTTPException(404, "Debt not found")
    if input.amount <= 0:
        raise HTTPException(400, "El monto del pago debe ser mayor que 0")

    already_paid = float(debt.get("paid_amount", 0))
    original = float(debt["original_amount"])
    remaining = original - already_paid
    if remaining <= 0:
        raise HTTPException(400, "Esta deuda ya está saldada")

    pay_amount = min(input.amount, remaining)
    when = input.date or now_iso()

    # Create linked transaction in caja
    category = "venta" if debt.get("source") == "venta" else (
        "reparacion" if debt.get("source") == "reparacion" else "otro"
    )
    desc = f"Pago deuda: {debt['client_name']} — {debt['concept']}"
    tx = {
        "id": str(uuid.uuid4()),
        "type": "ingreso",
        "amount": float(pay_amount),
        "category": category,
        "description": desc,
        "related_phone_id": debt.get("related_phone_id"),
        "related_repair_id": debt.get("related_repair_id"),
        "date": when,
    }
    await db.transactions.insert_one(tx)
    tx.pop("_id", None)

    payment = {
        "amount": float(pay_amount),
        "date": when,
        "method": input.method,
        "transaction_id": tx["id"],
    }
    new_paid = round(already_paid + pay_amount, 2)
    new_status = "pagado" if new_paid >= original else "pagado_parcial"

    await db.debts.update_one(
        {"id": debt_id},
        {
            "$set": {"paid_amount": new_paid, "status": new_status},
            "$push": {"payments": payment},
        },
    )
    updated = await db.debts.find_one({"id": debt_id}, {"_id": 0})
    return _debt_hydrate(updated)


@api_router.get("/debts/summary/totals")
async def debts_summary():
    total_pending = 0.0
    total_original = 0.0
    total_paid = 0.0
    count_pending = 0
    count_paid = 0
    async for d in db.debts.find({}, {"_id": 0}):
        original = float(d.get("original_amount", 0))
        paid = float(d.get("paid_amount", 0))
        total_original += original
        total_paid += paid
        if paid >= original:
            count_paid += 1
        else:
            count_pending += 1
            total_pending += original - paid
    return {
        "total_pending": round(total_pending, 2),
        "total_paid": round(total_paid, 2),
        "total_original": round(total_original, 2),
        "count_pending": count_pending,
        "count_paid": count_paid,
    }


class RestoreInput(BaseModel):
    transactions: List[dict] = []
    phones: List[dict] = []
    repairs: List[dict] = []
    debts: List[dict] = []
    mode: Literal["replace", "merge"] = "replace"


@api_router.post("/restore")
async def restore_backup(payload: RestoreInput):
    if payload.mode == "replace":
        await db.transactions.delete_many({})
        await db.phones.delete_many({})
        await db.repairs.delete_many({})
        await db.debts.delete_many({})

    inserted = {"transactions": 0, "phones": 0, "repairs": 0, "debts": 0}
    if payload.transactions:
        for t in payload.transactions:
            t.pop("_id", None)
        if payload.mode == "merge":
            ids = [t["id"] for t in payload.transactions if "id" in t]
            if ids:
                await db.transactions.delete_many({"id": {"$in": ids}})
        await db.transactions.insert_many(payload.transactions)
        inserted["transactions"] = len(payload.transactions)
    if payload.phones:
        for p in payload.phones:
            p.pop("_id", None)
        if payload.mode == "merge":
            ids = [p["id"] for p in payload.phones if "id" in p]
            if ids:
                await db.phones.delete_many({"id": {"$in": ids}})
        await db.phones.insert_many(payload.phones)
        inserted["phones"] = len(payload.phones)
    if payload.repairs:
        for r in payload.repairs:
            r.pop("_id", None)
            r.setdefault("photos", [])
            r.setdefault("listo_at", None)
        if payload.mode == "merge":
            ids = [r["id"] for r in payload.repairs if "id" in r]
            if ids:
                await db.repairs.delete_many({"id": {"$in": ids}})
        await db.repairs.insert_many(payload.repairs)
        inserted["repairs"] = len(payload.repairs)
    if payload.debts:
        for d in payload.debts:
            d.pop("_id", None)
            d.setdefault("payments", [])
            d.setdefault("paid_amount", 0.0)
            d.setdefault("status", "pendiente")
            d.pop("balance", None)  # computed field
        if payload.mode == "merge":
            ids = [d["id"] for d in payload.debts if "id" in d]
            if ids:
                await db.debts.delete_many({"id": {"$in": ids}})
        await db.debts.insert_many(payload.debts)
        inserted["debts"] = len(payload.debts)

    return {"ok": True, "mode": payload.mode, "inserted": inserted}


@api_router.get("/search")
async def search_all(q: str, limit: int = 20):
    qn = q.strip()
    if not qn:
        return {"transactions": [], "phones": [], "repairs": []}
    rx = {"$regex": qn, "$options": "i"}

    transactions = []
    async for d in db.transactions.find(
        {"$or": [{"description": rx}, {"category": rx}, {"type": rx}]},
        {"_id": 0},
    ).sort("date", -1).limit(limit):
        transactions.append(d)

    phones = []
    async for d in db.phones.find(
        {"$or": [{"brand": rx}, {"model": rx}, {"imei": rx}, {"color": rx}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit):
        phones.append(d)

    repairs = []
    async for d in db.repairs.find(
        {"$or": [{"client_name": rx}, {"client_phone": rx}, {"device": rx}, {"fault": rx}, {"notes": rx}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit):
        d.setdefault("photos", [])
        d.setdefault("listo_at", None)
        repairs.append(d)

    return {"transactions": transactions, "phones": phones, "repairs": repairs}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
