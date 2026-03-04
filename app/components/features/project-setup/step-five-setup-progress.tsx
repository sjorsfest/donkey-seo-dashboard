import { motion } from "framer-motion";
import { Form, Link } from "react-router";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import { formatStatusLabel, getStatusBadgeClass } from "~/lib/dashboard";
import type { BrandVisualContextResponse, ExpandedAsset, TaskStatusResponse } from "./types";

function ShimmerPlaceholder({ className }: { className: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-200/90 ${className}`}>
      <motion.div
        className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/90 to-transparent"
        animate={{ x: ["-140%", "360%"] }}
        transition={{ duration: 1.35, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

type StepFiveSetupProgressProps = {
  projectId: string | null;
  task: TaskStatusResponse | null;
  taskCurrentStepName: string | null;
  taskTotalSteps: number | null;
  taskDisplayStep: number | null;
  taskProgress: number;
  taskError: string | null;
  isTaskCompleted: boolean;
  isTaskFailureLike: boolean;
  brand: BrandVisualContextResponse | null;
  companyName: string | null;
  productType: string | null;
  differentiators: string[];
  icpNicheNames: string[];
  retryLink: string;
  assetImageErrors: Record<string, boolean>;
  onAssetImageError: (assetId: string) => void;
  onExpandedAssetChange: (asset: ExpandedAsset | null) => void;
  showSetupOverlay: boolean;
  onDismissSetupOverlay: () => void;
};

export function StepFiveSetupProgressStep({
  projectId,
  task,
  taskCurrentStepName,
  taskTotalSteps,
  taskDisplayStep,
  taskProgress,
  taskError,
  isTaskCompleted,
  isTaskFailureLike,
  brand,
  companyName,
  productType,
  differentiators,
  icpNicheNames,
  retryLink,
  assetImageErrors,
  onAssetImageError,
  onExpandedAssetChange,
  showSetupOverlay,
  onDismissSetupOverlay,
}: StepFiveSetupProgressProps) {
  return (
    <motion.div key="step5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Brand profile extraction</CardTitle>
          <CardDescription>
            We are fetching company name, ICP, product type, and scraped brand assets from your site.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">Extraction status</p>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(task?.status)}`}>
                {formatStatusLabel(task?.status ?? "queued")}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {taskCurrentStepName
                ? `Current step: ${taskCurrentStepName}`
                : isTaskCompleted
                  ? "Setup complete. Loading brand profile data."
                  : "Analyzing your domain and extracting brand profile context."}
            </p>
            {taskTotalSteps ? (
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {task?.stage ? `${formatStatusLabel(task.stage)} · ` : ""}Step {taskDisplayStep ?? 1} of {taskTotalSteps}
              </p>
            ) : null}
            <div className="mt-4">
              <Progress value={Math.max(0, Math.min(100, Math.round(taskProgress ?? 0)))} />
            </div>
            <p className="mt-2 text-right text-xs font-semibold text-[#1e5052]">
              {typeof taskProgress !== "number" || Number.isNaN(taskProgress) ? "Working..." : `${Math.round(taskProgress)}%`}
            </p>
            {taskError ? <p className="mt-3 text-sm font-semibold text-rose-700">{taskError}</p> : null}
            {task?.error_message ? <p className="mt-3 text-sm font-semibold text-rose-700">{task.error_message}</p> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Company name</p>
              {!brand || (!companyName && !isTaskCompleted) ? (
                <div className="mt-2 space-y-2">
                  <ShimmerPlaceholder className="h-5 w-48" />
                  <p className="text-xs text-slate-500">Extracting company identity from homepage and metadata.</p>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-900">{companyName ?? "Not detected yet"}</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Product type</p>
              {!brand || (!productType && !isTaskCompleted) ? (
                <div className="mt-2 space-y-2">
                  <ShimmerPlaceholder className="h-5 w-40" />
                  <p className="text-xs text-slate-500">Classifying offer model and category.</p>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-900">{productType ?? "Not detected yet"}</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Differentiators</p>
              {!brand || (differentiators.length === 0 && !isTaskCompleted) ? (
                <div className="mt-3 space-y-2">
                  <ShimmerPlaceholder className="h-4 w-full" />
                  <ShimmerPlaceholder className="h-4 w-11/12" />
                  <ShimmerPlaceholder className="h-4 w-4/5" />
                </div>
              ) : differentiators.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {differentiators.slice(0, 6).map((item) => (
                    <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No differentiators returned yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Suggested ICP niches</p>
              {!brand || (icpNicheNames.length === 0 && !isTaskCompleted) ? (
                <div className="mt-3 space-y-2">
                  <ShimmerPlaceholder className="h-4 w-full" />
                  <ShimmerPlaceholder className="h-4 w-5/6" />
                </div>
              ) : icpNicheNames.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {icpNicheNames.slice(0, 8).map((niche) => (
                    <span
                      key={niche}
                      className="inline-flex items-center rounded-full border border-[#2f6f71]/30 bg-[#2f6f71]/10 px-2.5 py-1 text-xs font-semibold text-[#1e5052]"
                    >
                      {niche}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No ICP niches returned yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Scraped assets</p>
            {!brand || ((!brand.brand_assets || brand.brand_assets.length === 0) && !isTaskCompleted) ? (
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((placeholder) => (
                  <div key={placeholder} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <ShimmerPlaceholder className="h-8 w-8 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <ShimmerPlaceholder className="h-3 w-24" />
                        <ShimmerPlaceholder className="h-3 w-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : brand.brand_assets && brand.brand_assets.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {brand.brand_assets.slice(0, 6).map((asset) => (
                  <button
                    key={asset.asset_id}
                    type="button"
                    className="group rounded-lg border border-slate-200 bg-slate-50 p-2 text-left transition-colors hover:border-[#2f6f71]/50 hover:bg-white"
                    onClick={() => onExpandedAssetChange({ url: asset.source_url, role: asset.role })}
                  >
                    {assetImageErrors[asset.asset_id] ? (
                      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-100 px-2 text-center text-xs text-slate-600">
                        Preview unavailable
                      </div>
                    ) : (
                      <img
                        src={asset.source_url}
                        alt={asset.role}
                        loading="lazy"
                        className="h-24 w-full rounded-md border border-slate-200 object-cover bg-white"
                        onError={() => onAssetImageError(asset.asset_id)}
                      />
                    )}
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{asset.role}</p>
                    <p className="truncate text-xs text-slate-600">{asset.source_url}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No scraped assets found yet.</p>
            )}
          </div>

          {isTaskFailureLike ? (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="space-y-3 pt-5">
                <p className="text-sm font-semibold text-amber-900">
                  Setup paused or failed. Retry onboarding to resume brand profile extraction.
                </p>
                <Link to={retryLink}>
                  <Button type="button" variant="outline">
                    Retry bootstrap/setup
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={retryLink}>
          <Button type="button" variant="outline">
            Restart onboarding
          </Button>
        </Link>

        {projectId && isTaskCompleted ? (
          <Form method="post" action={`/projects/${projectId}/discovery`}>
            <input type="hidden" name="intent" value="startDiscoveryFromSetup" />
            <Button type="submit" size="lg">
              Open discovery
            </Button>
          </Form>
        ) : (
          <Button type="button" size="lg" disabled>
            Waiting for setup completion
          </Button>
        )}
      </div>

      {showSetupOverlay ? (
        <OnboardingOverlay onNext={onDismissSetupOverlay} nextLabel="Got it!">
          <DonkeyBubble title={isTaskCompleted ? "Your brand profile is ready!" : "Analyzing your site..."}>
            {isTaskCompleted ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">I've extracted everything I need from your website:</p>
                <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                    <span>
                      <strong className="text-slate-800">Company details</strong> and brand identity
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                    <span>
                      <strong className="text-slate-800">Differentiators</strong> and unique selling points
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">&#x2713;</span>
                    <span>
                      <strong className="text-slate-800">Target audience</strong> and ICP niches
                    </span>
                  </li>
                </ul>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Discovery runs are triggered automatically once setup is complete.
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  I'm crawling your website to build a <strong className="text-slate-800">brand profile</strong>. This powers everything:
                  from keyword research to content generation.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  This usually takes about a minute. Feel free to watch the progress below!
                </p>
              </>
            )}
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}
    </motion.div>
  );
}
