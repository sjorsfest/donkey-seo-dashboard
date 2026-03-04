import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Check, Copy, Key, Loader2, RefreshCw, Webhook } from "lucide-react";
import { Form, Link } from "react-router";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { ProjectApiKeyResponse, ProjectWebhookSecretResponse } from "./types";

type StepFourIntegrationsProps = {
  projectId: string | null;
  setupRunId: string | null;
  setupTaskId: string | null;
  backLink: string;
  generatedKey: ProjectApiKeyResponse | null;
  generatedWebhookSecret: ProjectWebhookSecretResponse | null;
  integrationGuide: string | null;
  isGeneratingApiKey: boolean;
  isGeneratingWebhookSecret: boolean;
  isContinuing: boolean;
  showIntegrationsOverlay: boolean;
  onDismissIntegrationsOverlay: () => void;
};

export function StepFourIntegrationsStep({
  projectId,
  setupRunId,
  setupTaskId,
  backLink,
  generatedKey,
  generatedWebhookSecret,
  integrationGuide,
  isGeneratingApiKey,
  isGeneratingWebhookSecret,
  isContinuing,
  showIntegrationsOverlay,
  onDismissIntegrationsOverlay,
}: StepFourIntegrationsProps) {
  const [latestGeneratedKey, setLatestGeneratedKey] = useState<ProjectApiKeyResponse | null>(generatedKey);
  const [latestGeneratedWebhookSecret, setLatestGeneratedWebhookSecret] = useState<ProjectWebhookSecretResponse | null>(
    generatedWebhookSecret
  );
  const [apiKeyCopyState, setApiKeyCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [webhookCopyState, setWebhookCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [guideCopyState, setGuideCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (generatedKey) setLatestGeneratedKey(generatedKey);
  }, [generatedKey]);

  useEffect(() => {
    if (generatedWebhookSecret) setLatestGeneratedWebhookSecret(generatedWebhookSecret);
  }, [generatedWebhookSecret]);

  useEffect(() => {
    setApiKeyCopyState("idle");
  }, [latestGeneratedKey?.api_key]);

  useEffect(() => {
    setWebhookCopyState("idle");
  }, [latestGeneratedWebhookSecret?.notification_webhook_secret]);

  const handleCopy = async (value: string | null, setState: (state: "idle" | "copied" | "error") => void) => {
    if (!value) {
      setState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("error");
    }
  };

  const apiKeyEnvValue = latestGeneratedKey ? `DONKEYSEO_API_KEY=${latestGeneratedKey.api_key}` : null;
  const webhookSecretEnvValue = latestGeneratedWebhookSecret
    ? `DONKEYSEO_WEBHOOK_SECRET=${latestGeneratedWebhookSecret.notification_webhook_secret}`
    : null;

  return (
    <motion.div key="step4-integrations" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integrations (optional)</CardTitle>
          <CardDescription>
            Generate your API and webhook credentials, and copy the agent integration prompt. You can also skip this and configure it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Key className="h-4 w-4 text-[#2f6f71]" />
                API key
              </p>
              <p className="mt-1 text-xs text-slate-600">Use this key to access integration endpoints for this project.</p>
              <Form method="post" className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="intent" value="generateProjectApiKey" />
                <input type="hidden" name="project_id" value={projectId ?? ""} />
                <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
                <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
                <Button type="submit" variant="outline" disabled={!projectId || isGeneratingApiKey}>
                  {isGeneratingApiKey ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Generate API key
                    </>
                  )}
                </Button>
              </Form>

              {latestGeneratedKey ? (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Shown once. Copy and store securely.</p>
                  <p className="mt-2 break-all rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-xs text-slate-100">
                    {apiKeyEnvValue}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopy(apiKeyEnvValue, setApiKeyCopyState)}
                    >
                      {apiKeyCopyState === "copied" ? (
                        <>
                          <Check className="mr-1.5 h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-4 w-4" />
                          Copy env var
                        </>
                      )}
                    </Button>
                    {apiKeyCopyState === "error" ? <p className="text-xs text-rose-700">Copy failed.</p> : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Webhook className="h-4 w-4 text-[#2f6f71]" />
                Webhook secret
              </p>
              <p className="mt-1 text-xs text-slate-600">Use this secret to verify webhook signatures from Donkey SEO.</p>
              <Form method="post" className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="intent" value="generateProjectWebhookSecret" />
                <input type="hidden" name="project_id" value={projectId ?? ""} />
                <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
                <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
                <Button type="submit" variant="outline" disabled={!projectId || isGeneratingWebhookSecret}>
                  {isGeneratingWebhookSecret ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Generate secret
                    </>
                  )}
                </Button>
              </Form>

              {latestGeneratedWebhookSecret ? (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Shown once. Copy and store securely.</p>
                  <p className="mt-2 break-all rounded border border-slate-800 bg-slate-950 px-2 py-2 font-mono text-xs text-slate-100">
                    {webhookSecretEnvValue}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopy(webhookSecretEnvValue, setWebhookCopyState)}
                    >
                      {webhookCopyState === "copied" ? (
                        <>
                          <Check className="mr-1.5 h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-4 w-4" />
                          Copy env var
                        </>
                      )}
                    </Button>
                    {webhookCopyState === "error" ? <p className="text-xs text-rose-700">Copy failed.</p> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4 text-[#2f6f71]" />
              Agent integration prompt
            </p>
            <p className="mt-1 text-xs text-slate-600">Copy this prompt into your coding agent to bootstrap your Donkey SEO integration.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCopy(integrationGuide, setGuideCopyState)}
                disabled={!integrationGuide}
              >
                {guideCopyState === "copied" ? (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Copied prompt
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-4 w-4" />
                    Copy agent prompt
                  </>
                )}
              </Button>
              {guideCopyState === "error" ? <p className="text-xs text-rose-700">Copy failed.</p> : null}
            </div>
            {integrationGuide ? (
              <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                {integrationGuide}
              </pre>
            ) : (
              <p className="mt-3 text-xs text-slate-500">Integration prompt unavailable right now.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={backLink}>
          <Button type="button" variant="outline">
            Back
          </Button>
        </Link>
        <Form method="post">
          <input type="hidden" name="intent" value="continueAfterIntegrations" />
          <input type="hidden" name="project_id" value={projectId ?? ""} />
          <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
          <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
          <Button type="submit" size="lg" disabled={isContinuing}>
            {isContinuing ? "Continuing..." : "Continue to setup"}
          </Button>
        </Form>
      </div>

      {showIntegrationsOverlay ? (
        <OnboardingOverlay onNext={onDismissIntegrationsOverlay} nextLabel="Got it!">
          <DonkeyBubble title="Optional integrations setup">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Here you can generate your <strong className="text-slate-800">API key</strong>, create a{" "}
              <strong className="text-slate-800">webhook secret</strong>, and copy the agent prompt for your developer tooling.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This step is optional. You can skip now and configure credentials later in Settings.
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}
    </motion.div>
  );
}
