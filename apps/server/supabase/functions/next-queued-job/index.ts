// supabase/functions/next-queued-job/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    // Simple shared-secret auth: only your worker should know this token
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (token !== Deno.env.get("WORKER_TOKEN")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Create a Supabase client with SERVICE_ROLE key (server-side only!)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call the SQL function created in Step 1
    const { data, error } = await supabase.rpc("claim_next_queued_job");

    if (error) {
      console.error(error);
      return new Response(error.message, { status: 500 });
    }

    if (!data || data.length === 0) {
      // no queued jobs
      return new Response(null, { status: 204 });
    }

    // Return the single claimed job
    return new Response(JSON.stringify(data[0]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("Internal Server Error", { status: 500 });
  }
});
