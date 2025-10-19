// apps/server/src/pages/optimizer.tsx
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play, Download, Settings } from "lucide-react";

// If your alias "@" isn't set, change this to:  ../lib/api
import { startOptimization, ping, getJob } from "@/lib/api";

const Optimizer: React.FC = () => {
  // ---- UI state ----
  const [source, setSource] = useState<string>(
    `// Paste your Verilog code here
module counter (
  input clk,
  input rst,
  output reg [7:0] count
);
  always @(posedge clk or posedge rst) begin
    if (rst)
      count <= 8'b0;
    else
      count <= count + 1;
  end
endmodule`
  );

  const [targetPower, setTargetPower] = useState(true);
  const [targetTiming, setTargetTiming] = useState(true);
  const [targetArea, setTargetArea] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [optimizedSource, setOptimizedSource] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any | null>(null);
  const [jobJson, setJobJson] = useState<any | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  // ---- verify backend on mount ----
  useEffect(() => {
    let cancelled = false;
    ping()
      .then((r) => {
        if (!cancelled) {
          console.log("API /healthz:", r);
          setApiHealthy(true);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error("API not reachable:", e);
          setApiHealthy(false);
          setError(e?.message ?? "Backend not reachable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- handlers ----
  async function onRunClick() {
    try {
      setError(null);
      setIsRunning(true);

      const spec = {
        source,
        options: {
          power: targetPower,
          timing: targetTiming,
          area: targetArea,
        },
      };

      const { job_id } = await startOptimization(spec);
      setLastJobId(job_id);
      console.log("Optimization job queued:", job_id);
      // start polling job
      setOptimizedSource(null);
      setMetrics(null);
      (async function poll(){
        for(let i=0;i<120;i++){
          try{
            const j = await getJob(job_id);
            // expecting { state, result, ... }
            if(j){
              setJobJson(j);
            }
            if(j && j.result){
              const res = j.result;
              if(res.optimized_source || res.optimized_verilog){
                setOptimizedSource(res.optimized_source || res.optimized_verilog || null);
              }
              if(res.metrics){
                setMetrics(res.metrics);
              }
              if(j.state === 'completed' || j.state === 'failed' || res.optimized_source){
                break;
              }
            }
          }catch(e){
            // ignore and retry
          }
          await new Promise((r)=>setTimeout(r, 1000));
        }
      })();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to start optimization");
      alert(`Error: ${e?.message ?? e}`);
    } finally {
      setIsRunning(false);
    }
  }

  function onReset() {
    setSource(
      `// Paste your Verilog code here
module counter (
  input clk,
  input rst,
  output reg [7:0] count
);
  always @(posedge clk or posedge rst) begin
    if (rst)
      count <= 8'b0;
    else
      count <= count + 1;
  end
endmodule`
    );
    setTargetPower(true);
    setTargetTiming(true);
    setTargetArea(false);
    setLastJobId(null);
    setError(null);
  }

  function onExport() {
    const content = optimizedSource ?? source ?? "";
    const filename = optimizedSource ? "optimized.v" : "input.v";
    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed: " + (e as any)?.message);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">VR</span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">VeriRL Optimizer</h1>
        </div>

        <nav className="flex items-center gap-6">
          <a href="/optimizer" className="text-sm text-primary font-medium">
            Optimizer
          </a>
        </nav>
      </header>

      {/* API status banner */}
      {apiHealthy === false && (
        <div className="mx-6 mt-4 p-3 rounded border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          Backend not reachable. Make sure <span className="font-mono">uvicorn</span> is
          running on <span className="font-mono">http://127.0.0.1:8000</span> and your{" "}
          <span className="font-mono">apps/server/.env.development</span> has{" "}
          <span className="font-mono">VITE_API_BASE=http://127.0.0.1:8000</span>.
        </div>
      )}

      {/* Main Content - Two Column Layout */}
      <div className="flex gap-6 p-6 max-h-[calc(100vh-4rem)]">
        {/* Left Panel - Input */}
        <div className="w-[45%] flex flex-col gap-4 sticky top-20 h-fit">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Input Verilog</h2>
              <span className="text-xs text-text-tertiary font-mono">module_counter.v</span>
            </div>
            <Textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="// Paste your Verilog code here"
              className="min-h-[500px] font-mono text-sm bg-background border-border focus:border-primary resize-none"
            />
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Optimization Targets</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={targetPower}
                  onChange={(e) => setTargetPower(e.target.checked)}
                />
                <span className="text-sm text-text-secondary">Power Reduction</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={targetTiming}
                  onChange={(e) => setTargetTiming(e.target.checked)}
                />
                <span className="text-sm text-text-secondary">Timing Optimization</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={targetArea}
                  onChange={(e) => setTargetArea(e.target.checked)}
                />
                <span className="text-sm text-text-secondary">Area Minimization</span>
              </label>

              {lastJobId && (
                <p className="text-xs text-text-tertiary mt-2">
                  Last job queued: <span className="font-mono">{lastJobId}</span>
                </p>
              )}
              {error && (
                <p className="text-xs text-destructive mt-2">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Output (placeholder until you render results) */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Optimized Output</h2>
              <Button size="sm" variant="outline" className="border-border hover:border-primary/50" onClick={onExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
            <div className="bg-background rounded border border-border p-4 min-h-[500px]">
              <pre className="font-mono text-sm text-text-secondary">
                {optimizedSource ?? `// Optimized Verilog will appear here once the worker finishes.\n// For now this is a static placeholder.`}
              </pre>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-text-tertiary mb-1">Power Savings</div>
              <div className="text-2xl font-bold text-success">{metrics ? `${metrics.power_savings_pct}%` : '-32%'}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-text-tertiary mb-1">Timing</div>
              <div className="text-2xl font-bold text-info">{metrics ? `${metrics.timing_delta_pct}%` : '+15%'}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-xs text-text-tertiary mb-1">Gate Count</div>
              <div className="text-2xl font-bold text-foreground">{metrics && metrics.gate_count ? metrics.gate_count : 142}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Debug: raw job JSON */}
      {jobJson && (
        <div className="p-4 mx-6">
          <h3 className="text-sm text-text-tertiary mb-2">Debug: job JSON</h3>
          <pre className="bg-card p-4 rounded border border-border text-xs overflow-auto max-h-48">{JSON.stringify(jobJson, null, 2)}</pre>
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 h-18 bg-card border-t border-border flex items-center justify-center gap-4 px-8 shadow-elevated">
        <Button
          size="lg"
          onClick={onRunClick}
          disabled={isRunning}
          className="h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-glow"
        >
          <Play className="w-4 h-4 mr-2" />
          {isRunning ? "Running…" : "Run Optimization"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={onReset}
          className="h-12 px-6 border-border hover:border-primary/50"
        >
          Reset
        </Button>
      </div>
    </div>
  );
};

export default Optimizer;
