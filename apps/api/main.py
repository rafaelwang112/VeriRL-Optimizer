# apps/api/main.py
import os
from pathlib import Path
from typing import Optional, Literal

from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env that sits right next to this file
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ---- Supabase client (v2) ----
try:
    from supabase import create_client, Client
except Exception as e:
    raise RuntimeError("Missing supabase client. Run: pip install supabase") from e

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
WORKER_TOKEN = os.getenv("WORKER_TOKEN", "local-worker-secret")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in apps/api/.env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ---- FastAPI app & CORS ----
app = FastAPI()

ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Health ----------
@app.get("/healthz")
def healthz():
    return {"ok": True}

# ---------- UI: enqueue a job ----------
class StartOptPayload(BaseModel):
    spec: dict

@app.post("/start-optimization", status_code=status.HTTP_201_CREATED)
async def start_optimization(payload: StartOptPayload):
    """
    Inserts a queued job using the RPC (returns uuid).
    Requires SQL:

      create or replace function public.enqueue_job(p_spec jsonb)
      returns uuid language plpgsql security definer as $$
      declare v_id uuid;
      begin
        insert into public.optimization_jobs (spec, state)
        values (p_spec, 'queued')
        returning id into v_id;
        return v_id;
      end; $$;
    """
    try:
        res = supabase.rpc("enqueue_job", {"p_spec": payload.spec}).execute()
        if getattr(res, "error", None):
            raise HTTPException(status_code=500, detail=str(res.error))

        job_id = res.data
        if not job_id:
            raise HTTPException(status_code=500, detail="enqueue_job returned no id")

        return {"job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        print("start-optimization (rpc) error:", repr(e))
        raise HTTPException(status_code=500, detail=str(e))

# ---------- Worker: claim exactly one next queued job ----------
@app.get("/next-queued-job")
async def next_queued_job(request: Request):
    """
    Atomically selects one 'queued' row and flips it to 'running'.
    Requires SQL:

      create or replace function public.claim_next_queued_job()
      returns table (job_id uuid, spec jsonb) language plpgsql security definer as $$
      declare r record; begin
        select id, spec into r
          from public.optimization_jobs
         where state = 'queued'
         order by created_at
         limit 1
         for update skip locked;

        if not found then return; end if;

        update public.optimization_jobs
           set state='running', updated_at=now()
         where id = r.id;

        job_id := r.id; spec := r.spec; return next;
      end; $$;
    """
    token = request.headers.get("authorization", "").replace("Bearer ", "")
    if token != WORKER_TOKEN:
        return Response(content="Unauthorized", status_code=status.HTTP_401_UNAUTHORIZED)

    res = supabase.rpc("claim_next_queued_job").execute()
    if getattr(res, "error", None):
        return Response(content=str(res.error), status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

    data = getattr(res, "data", None) or []
    if len(data) == 0:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    # shape: [{ "job_id": "<uuid>", "spec": {...} }]
    return data[0]

# ---------- Worker: finish a job (completed/failed) ----------
class FinishJobPayload(BaseModel):
    job_id: str
    status: Literal["completed", "failed"]
    result: Optional[dict] = None

@app.post("/finish-job", status_code=status.HTTP_204_NO_CONTENT)
async def finish_job(payload: FinishJobPayload, request: Request):
    """
    Worker calls this to finalize a job with result (optimized Verilog, metrics, or error).
    """
    token = request.headers.get("authorization", "").replace("Bearer ", "")
    if token != WORKER_TOKEN:
        return Response(content="Unauthorized", status_code=status.HTTP_401_UNAUTHORIZED)

    update_doc = {"state": payload.status, "result": payload.result, "updated_at": "now()"}
    # Supabase Python client treats "now()" as string; just rely on trigger if you set one.
    update_doc.pop("updated_at", None)

    res = (
        supabase.table("optimization_jobs")
        .update(update_doc)
        .eq("id", payload.job_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise HTTPException(status_code=500, detail=str(res.error))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# ---------- UI/Worker: get a job by id ----------
@app.get("/job/{job_id}")
async def get_job(job_id: str):
    res = supabase.table("optimization_jobs").select("*").eq("id", job_id).single().execute()
    if getattr(res, "error", None):
        raise HTTPException(status_code=500, detail=str(res.error))
    return res.data
