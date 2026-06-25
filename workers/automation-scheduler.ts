import { runScheduledAutomations } from "../src/services/automation-service";

/**
 * Standalone scheduler for time-based automation rules. Runs an evaluation tick
 * every AUTOMATION_TICK_SECONDS (default 60s). For platforms that prefer an
 * external cron, hit POST /api/automations/run-scheduled instead.
 */
const intervalMs = Number(process.env.AUTOMATION_TICK_SECONDS ?? "60") * 1000;

async function tick() {
  try {
    const result = await runScheduledAutomations();
    if (result.fired > 0) {
      console.log(
        `[automation-scheduler] evaluated=${result.evaluated} fired=${result.fired}`,
      );
    }
  } catch (error) {
    console.error("[automation-scheduler] tick failed", error);
  }
}

console.log(
  `[automation-scheduler] starting; tick every ${intervalMs / 1000}s`,
);
void tick();
const timer = setInterval(() => void tick(), intervalMs);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
