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
class RepairCreate(BaseModel):
    client_name: str
    client_phone: Optional[str] = ""
    device: str
    fault: str
    cost: float = 0
    status: Literal["recibido", "en_progreso", "listo", "entregado"] = "recibido"
    notes: Optional[str] = ""


class Repair(RepairCreate):
    id: str
    created_at: str
    delivered_at: Optional[str] = None


class RepairUpdate(BaseModel):
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    device: Optional[str] = None
    fault: Optional[str] = None
    cost: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


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
async def summary_range(days: int = 7):
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=days)
    cursor = db.transactions.find(
        {"date": {"$gte": start_dt.isoformat()}}, {"_id": 0}
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
        "ingresos": round(ingresos, 2),
        "egresos": round(egresos, 2),
        "balance": round(ingresos - egresos, 2),
    }


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


# ---- Repairs ----
@api_router.post("/repairs", response_model=Repair)
async def create_repair(input: RepairCreate):
    data = input.model_dump()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = now_iso()
    data["delivered_at"] = None
    await db.repairs.insert_one(data)
    data.pop("_id", None)
    return Repair(**data)


@api_router.get("/repairs", response_model=List[Repair])
async def list_repairs():
    cursor = db.repairs.find({}, {"_id": 0}).sort("created_at", -1)
    return [Repair(**doc) async for doc in cursor]


@api_router.put("/repairs/{repair_id}", response_model=Repair)
async def update_repair(repair_id: str, input: RepairUpdate):
    update = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Nothing to update")
    if update.get("status") == "entregado":
        update["delivered_at"] = now_iso()
    res = await db.repairs.find_one_and_update(
        {"id": repair_id}, {"$set": update}, return_document=True, projection={"_id": 0}
    )
    if not res:
        raise HTTPException(404, "Repair not found")
    return Repair(**res)


@api_router.delete("/repairs/{repair_id}")
async def delete_repair(repair_id: str):
    res = await db.repairs.delete_one({"id": repair_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Repair not found")
    return {"ok": True}


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
