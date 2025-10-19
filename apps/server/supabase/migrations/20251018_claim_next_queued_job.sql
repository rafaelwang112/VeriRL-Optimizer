-- Create an atomic server-side function to claim exactly one queued job.
-- Uses FOR UPDATE SKIP LOCKED to prevent double-claiming under concurrency.

create or replace function public.claim_next_queued_job()
returns table (job_id uuid, spec jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Grab the oldest queued job and lock it so others skip it
  select id, spec
    into r
    from optimization_jobs
   where state = 'queued'
   order by created_at
   limit 1
   for update skip locked;

  -- No job available
  if not found then
    return;
  end if;

  -- Flip state to running
  update optimization_jobs
     set state = 'running',
         updated_at = now()
   where id = r.id;

  -- Return the claimed job
  job_id := r.id;
  spec   := r.spec;
  return next;
end;
$$;

-- Performance index for the WHERE + ORDER BY used above
create index if not exists idx_optimization_jobs_state_created_at
  on public.optimization_jobs (state, created_at);
