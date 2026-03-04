import { Card, CardContent } from "~/components/ui/card";
import type { SetupStep } from "./types";

const SETUP_STEP_LABELS = [
  "Basic project info",
  "SEO inputs",
  "Authors (optional)",
  "Integrations (optional)",
  "Setup progress",
] as const;

export function SetupStepTracker({ step }: { step: SetupStep }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="grid gap-2 sm:gap-3 lg:grid-cols-5">
          {SETUP_STEP_LABELS.map((label, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === step;
            const completed = stepNumber < step;

            return (
              <div
                key={label}
                className={`flex min-w-0 items-center rounded-xl border px-2.5 py-2 text-xs font-semibold xl:px-3 xl:text-sm ${
                  active
                    ? "border-[#2f6f71] bg-[#2f6f71]/10 text-[#1e5052]"
                    : completed
                      ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                <span className="mr-2 text-[11px] xl:text-xs">{String(stepNumber).padStart(2, "0")}</span>
                <span className="min-w-0 truncate">{label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
