# VeriRL Optimizer

This repository contains a small full‑stack toolchain for Verilog optimization testing:

- apps/server — React + Vite frontend (UI for pasting Verilog, submitting optimization jobs, and viewing results)
- apps/client  — worker and helper code (Python FastAPI endpoints and the HF/mock optimizer worker)

This README explains the layout, how to run the pieces locally, and useful environment variables (including the demo-mode `MOCK_HF`).

## Quick layout

- `apps/server` — frontend (TypeScript, Vite, React, Tailwind). Run with `npm run dev` in that folder.
- `apps/api` — FastAPI backend used by the worker (endpoints such as `/start-optimization`, `/next-queued-job`, `/finish-job`, `/job/{id}`)
- `apps/client/worker/hf_worker.py` — worker that polls for jobs and either calls HF inference or runs the local demo optimizer (`MOCK_HF=1`).

There are other support folders (orchestrator, tools, etc.) used for CI or deployment; the three items above are the primary development flow.

## Quick start (development)

Steps to get a working local dev loop that demonstrates optimization without external HF credentials:

1) Install frontend deps

```bash
cd apps/server
npm install
npm run dev
# open the URL that Vite reports (usually http://localhost:5173)
```

2) Start the API (FastAPI)

From the repo root or `apps/api` run the API that the worker will talk to. Example (from `apps/api`):

```bash
cd apps/api
# create a virtualenv and install requirements if you need
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

3) Start a local worker in demo mode (no HF token required)

```bash
cd apps/client/worker
# Demo mode uses built-in deterministic optimizer (safe and deterministic)
MOCK_HF=1 python hf_worker.py
```

4) Use the frontend

- Open the Optimizer page in your browser.
- Paste or edit Verilog in the left panel and click `Run Optimization`.
- The frontend polls the job status and will display `optimized_source` and `metrics` when the worker completes.
- Click `Export` to download the optimized Verilog as `optimized.v` (or `input.v` if the worker hasn't produced output yet).

## Environment variables (dev)

- `API_BASE` — base URL of the API (default: `http://127.0.0.1:8000`). The worker uses `NEXT_JOB_URL`/`FINISH_JOB_URL` derived from this.
- `NEXT_JOB_URL` — explicit URL for claiming the next queued job (overrides `API_BASE`).
- `FINISH_JOB_URL` — explicit URL for reporting job completion (overrides `API_BASE`).
- `WORKER_TOKEN` — shared secret for worker <-> API communication.
- HF integration (optional):
	- `HF_API_TOKEN` — Hugging Face API token.
	- `HF_MODEL_DEEPSEEK`, `HF_MODEL_MISTRAL` — model slugs to try when `MOCK_HF=0`.
- `MOCK_HF` — set to `1` to enable the local deterministic demo optimizer instead of calling HF inference (recommended for local dev).

Example worker `.env` (in `apps/client/worker/.env`):

```
API_BASE=http://127.0.0.1:8000
WORKER_TOKEN=local-worker-secret
MOCK_HF=1
# HF settings left blank for demo
HF_API_TOKEN=
HF_MODEL_DEEPSEEK=
HF_MODEL_MISTRAL=
```

## Notes about the demo optimizer

- The demo optimizer is deliberately conservative and deterministic. It uses regex-based transforms plus a small AST-based RHS simplifier to perform safe rewrites (remove +0, shift-by-zero, mask & 8'hFF, xor/or with 1'b0, alias propagation for simple wiring).
- Module interface (ports) is preserved by default: the optimizer will not rename or remove module output ports. If an output is redeclared internally, the worker will emit an `assign` to preserve the original module interface.
- For production-grade Verilog rewriting, replace the demo pipeline with a parser/AST-based engine (tree-sitter/pyverilog) — I can help wire that up if desired.

## Export behavior

- The Optimizer page now includes an `Export` button that triggers a browser download of the optimized output. If no optimized output exists yet, it downloads the current input as `input.v`.

## Docker

- A `docker-compose.yml` is present at the repo root. You can adapt the `Dockerfile` entries in `apps/server` and `apps/client` to containerize the frontend and the worker. The current README focuses on local development.

## Troubleshooting

- If the frontend shows `Backend not reachable`, confirm the FastAPI server is running on the `VITE_API_BASE` URL (default `http://127.0.0.1:8000`) and that you started the worker with the same `WORKER_TOKEN` as the API expects.
- If you want HF-backed optimization, set `MOCK_HF=0` and provide a valid `HF_API_TOKEN` and model slug(s). The worker will attempt a primary model and fall back to `HF_MODEL_MISTRAL` when a 404 is returned.

## Next steps

- Replace regex-based rewrites with a full Verilog parser.
- Add CI tests that exercise the demo optimizer on a small Verilog corpus and assert expected simplifications.
