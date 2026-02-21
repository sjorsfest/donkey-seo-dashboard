import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

const integrationSteps = [
  "Install the Donkey SEO client package in your repository (package name and install command: placeholder).",
  "Create a Donkey SEO configuration file with project id, environment, and API credentials.",
  "Initialize the client in your app or CI workflow so it can send pipeline events.",
  "Run an initial sync to verify your repository can publish metadata to Donkey SEO.",
];

const webhookSteps = [
  "Expose a webhook endpoint in your app to receive Donkey SEO events.",
  "Validate webhook signatures before processing payloads.",
  "Handle key events such as run started, run completed, and brief ready.",
  "Implement retries and idempotency to avoid duplicate processing.",
];

export default function DashboardConfigurationRoute() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-[#edf8ff] to-[#f2fbf6] p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f5f8a]">Configuration</p>
            <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Donkey SEO Client Setup</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              This page is a placeholder for the future self-serve integration flow. It outlines how teams will connect
              their repositories and webhook handlers.
            </p>
          </div>
          <Badge variant="info">Placeholder</Badge>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Repository integration</CardTitle>
            <CardDescription>How users will integrate a Donkey SEO client into their own codebase.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {integrationSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook setup</CardTitle>
            <CardDescription>How users will configure incoming webhook events from Donkey SEO.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {webhookSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      <Card className="border-dashed bg-white/80">
        <CardHeader>
          <CardTitle>Implementation status</CardTitle>
          <CardDescription>
            Backend support for client provisioning, credential issuance, webhook secret rotation, and event cataloging
            is not implemented in this repository yet.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
