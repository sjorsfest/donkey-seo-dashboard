import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Form, Link, data, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_dashboard.projects.new";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Select } from "~/components/ui/select";
import { ApiClient } from "~/lib/api.server";
import {
  buildPresetConstraints,
  buildPresetGoals,
  parseMultilineList,
  suggestProjectNameFromDomain,
} from "~/lib/dashboard";
import type { components } from "~/types/api.generated";
import type { SetupPreset } from "~/types/dashboard";

type ProjectCreate = components["schemas"]["ProjectCreate"];
type ProjectResponse = components["schemas"]["ProjectResponse"];
type PipelineRunStrategy = components["schemas"]["PipelineRunStrategy"];
type PipelineStartRequest = components["schemas"]["PipelineStartRequest"];
type PipelineRunResponse = components["schemas"]["PipelineRunResponse"];

type ActionData = {
  error?: string;
  fieldErrors?: {
    domain?: string;
    name?: string;
  };
};

const PRESET_OPTIONS: Array<{ value: SetupPreset; title: string; description: string }> = [
  {
    value: "traffic_growth",
    title: "Traffic Growth",
    description: "Maximize discoverability and topical authority.",
  },
  {
    value: "lead_gen",
    title: "Lead Gen",
    description: "Prioritize keywords that convert to pipeline.",
  },
  {
    value: "revenue_content",
    title: "Revenue Content",
    description: "Focus on money-adjacent and comparison intent.",
  },
];

function parseSetupPreset(value: string): SetupPreset {
  if (value === "lead_gen" || value === "revenue_content") return value;
  return "traffic_growth";
}

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "createProject" && intent !== "createAndStart") {
    return data({ error: "Unsupported action." } satisfies ActionData, { status: 400 });
  }

  const domain = String(formData.get("domain") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const primaryLocale = String(formData.get("primary_locale") ?? "en-US").trim() || "en-US";
  const preset = parseSetupPreset(String(formData.get("preset") ?? "traffic_growth"));
  const expertMode = String(formData.get("expert_mode") ?? "false") === "true";

  if (!domain || !name) {
    return data(
      {
        error: "Project name and domain are required.",
        fieldErrors: {
          domain: !domain ? "Domain is required" : undefined,
          name: !name ? "Project name is required" : undefined,
        },
      } satisfies ActionData,
      { status: 400 }
    );
  }

  const projectPayload: ProjectCreate = {
    name,
    domain,
    description: description || null,
    primary_language: "en",
    primary_locale: primaryLocale,
    goals: buildPresetGoals(preset),
    constraints: buildPresetConstraints(preset),
  };

  const api = new ApiClient(request);
  const createResponse = await api.fetch("/projects/", {
    method: "POST",
    json: projectPayload,
  });

  if (createResponse.status === 401) {
    return redirect("/login", {
      headers: {
        "Set-Cookie": await api.logout(),
      },
    });
  }

  if (!createResponse.ok) {
    return data(
      { error: "Unable to create project." } satisfies ActionData,
      { status: createResponse.status, headers: await api.commit() }
    );
  }

  const createdProject = (await createResponse.json()) as ProjectResponse;

  if (intent === "createProject") {
    return redirect(`/projects/${createdProject.id}/discovery?created=1`, {
      headers: await api.commit(),
    });
  }

  const conversionIntents = parseMultilineList(String(formData.get("strategy_conversion_intents") ?? ""));
  const includeTopics = parseMultilineList(String(formData.get("strategy_include_topics") ?? ""));
  const excludeTopics = parseMultilineList(String(formData.get("strategy_exclude_topics") ?? ""));
  const icpRoles = parseMultilineList(String(formData.get("strategy_icp_roles") ?? ""));
  const icpIndustries = parseMultilineList(String(formData.get("strategy_icp_industries") ?? ""));
  const icpPains = parseMultilineList(String(formData.get("strategy_icp_pains") ?? ""));

  const strategy: PipelineRunStrategy = {
    scope_mode:
      String(formData.get("strategy_scope_mode") ?? "balanced_adjacent") === "strict"
        ? "strict"
        : String(formData.get("strategy_scope_mode") ?? "balanced_adjacent") === "broad_education"
          ? "broad_education"
          : "balanced_adjacent",
    branded_keyword_mode:
      String(formData.get("strategy_branded_keyword_mode") ?? "comparisons_only") === "exclude_all"
        ? "exclude_all"
        : String(formData.get("strategy_branded_keyword_mode") ?? "comparisons_only") === "allow_all"
          ? "allow_all"
          : "comparisons_only",
    fit_threshold_profile:
      String(formData.get("strategy_fit_threshold_profile") ?? "aggressive") === "moderate"
        ? "moderate"
        : String(formData.get("strategy_fit_threshold_profile") ?? "aggressive") === "lenient"
          ? "lenient"
          : "aggressive",
  };

  const minEligibleTarget = parseOptionalInteger(String(formData.get("strategy_min_eligible_target") ?? ""));

  if (expertMode) {
    if (conversionIntents.length > 0) strategy.conversion_intents = conversionIntents;
    if (includeTopics.length > 0) strategy.include_topics = includeTopics;
    if (excludeTopics.length > 0) strategy.exclude_topics = excludeTopics;
    if (icpRoles.length > 0) strategy.icp_roles = icpRoles;
    if (icpIndustries.length > 0) strategy.icp_industries = icpIndustries;
    if (icpPains.length > 0) strategy.icp_pains = icpPains;
    if (minEligibleTarget !== null && minEligibleTarget >= 1 && minEligibleTarget <= 100) {
      strategy.min_eligible_target = minEligibleTarget;
    }
  }

  const startPayload: PipelineStartRequest = {
    mode: "discovery_loop",
    start_step: 0,
    strategy,
    discovery: {
      max_iterations: 3,
      min_eligible_topics: null,
      require_serp_gate: true,
      max_keyword_difficulty: 65,
      min_domain_diversity: 0.5,
      require_intent_match: true,
      auto_start_content: true,
    },
  };

  const startResponse = await api.fetch(`/pipeline/${createdProject.id}/start`, {
    method: "POST",
    json: startPayload,
  });

  if (!startResponse.ok) {
    return redirect(`/projects/${createdProject.id}/discovery?created=1&startError=1`, {
      headers: await api.commit(),
    });
  }

  const run = (await startResponse.json()) as PipelineRunResponse;
  return redirect(`/projects/${createdProject.id}/discovery/runs/${encodeURIComponent(run.id)}?created=1`, {
    headers: await api.commit(),
  });
}

export default function ProjectSetupRoute() {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [nameDirty, setNameDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [locale, setLocale] = useState("en-US");
  const [preset, setPreset] = useState<SetupPreset>("traffic_growth");
  const [expertMode, setExpertMode] = useState(false);

  const [scopeMode, setScopeMode] = useState("balanced_adjacent");
  const [brandedMode, setBrandedMode] = useState("comparisons_only");
  const [fitProfile, setFitProfile] = useState("aggressive");
  const [minEligibleTarget, setMinEligibleTarget] = useState("");
  const [conversionIntents, setConversionIntents] = useState("");
  const [includeTopics, setIncludeTopics] = useState("");
  const [excludeTopics, setExcludeTopics] = useState("");
  const [icpRoles, setIcpRoles] = useState("");
  const [icpIndustries, setIcpIndustries] = useState("");
  const [icpPains, setIcpPains] = useState("");

  const [stepError, setStepError] = useState<string | null>(null);

  const isSubmitting = navigation.state === "submitting";

  const selectedPreset = useMemo(() => PRESET_OPTIONS.find((option) => option.value === preset) ?? PRESET_OPTIONS[0], [preset]);

  const stepLabels = ["Site basics", "Goal preset", "Launch"];

  function handleDomainChange(value: string) {
    setDomain(value);

    if (!nameDirty) {
      setName(suggestProjectNameFromDomain(value));
    }
  }

  function goNext() {
    if (step === 1) {
      if (!domain.trim() || !name.trim()) {
        setStepError("Domain and project name are required.");
        return;
      }
    }

    setStepError(null);
    setStep((current) => Math.min(3, current + 1));
  }

  function goBack() {
    setStepError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2f6f71]">Guided Setup</p>
          <h1 className="font-display text-3xl font-bold text-slate-900">Create a new pipeline project</h1>
        </div>
        <Link to="/projects" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          Back to projects
        </Link>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {stepLabels.map((label, index) => {
              const stepNumber = index + 1;
              const active = stepNumber === step;
              const completed = stepNumber < step;

              return (
                <div
                  key={label}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "border-[#2f6f71] bg-[#2f6f71]/10 text-[#1e5052]"
                      : completed
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  <span className="mr-2 text-xs">{String(stepNumber).padStart(2, "0")}</span>
                  {label}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Form method="post" className="space-y-6">
        <input type="hidden" name="domain" value={domain} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="primary_locale" value={locale} />
        <input type="hidden" name="preset" value={preset} />
        <input type="hidden" name="expert_mode" value={expertMode ? "true" : "false"} />

        <input type="hidden" name="strategy_scope_mode" value={scopeMode} />
        <input type="hidden" name="strategy_branded_keyword_mode" value={brandedMode} />
        <input type="hidden" name="strategy_fit_threshold_profile" value={fitProfile} />
        <input type="hidden" name="strategy_min_eligible_target" value={minEligibleTarget} />
        <input type="hidden" name="strategy_conversion_intents" value={conversionIntents} />
        <input type="hidden" name="strategy_include_topics" value={includeTopics} />
        <input type="hidden" name="strategy_exclude_topics" value={excludeTopics} />
        <input type="hidden" name="strategy_icp_roles" value={icpRoles} />
        <input type="hidden" name="strategy_icp_industries" value={icpIndustries} />
        <input type="hidden" name="strategy_icp_pains" value={icpPains} />

        {actionData?.error ? (
          <Card className="border-rose-300 bg-rose-50">
            <CardContent className="pt-5 text-sm font-semibold text-rose-700">{actionData.error}</CardContent>
          </Card>
        ) : null}

        {stepError ? (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="pt-5 text-sm font-semibold text-amber-900">{stepError}</CardContent>
          </Card>
        ) : null}

        {step === 1 ? (
          <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle>Site basics</CardTitle>
                <CardDescription>Set the essentials. We auto-suggest a project name from your domain.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">Domain</span>
                  <input
                    type="text"
                    value={domain}
                    onChange={(event) => handleDomainChange(event.target.value)}
                    placeholder="example.com"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                  />
                  {actionData?.fieldErrors?.domain ? (
                    <span className="text-xs font-semibold text-rose-600">{actionData.fieldErrors.domain}</span>
                  ) : null}
                </label>

                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-slate-700">Project name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setNameDirty(true);
                      setName(event.target.value);
                    }}
                    placeholder="Acme Growth Engine"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                  />
                  {actionData?.fieldErrors?.name ? (
                    <span className="text-xs font-semibold text-rose-600">{actionData.fieldErrors.name}</span>
                  ) : null}
                </label>

                <label className="grid gap-1.5 text-sm md:col-span-1">
                  <span className="font-semibold text-slate-700">Primary locale</span>
                  <Select value={locale} onChange={(event) => setLocale(event.target.value)}>
                    <option value="en-US">English (United States)</option>
                    <option value="en-GB">English (United Kingdom)</option>
                    <option value="en-CA">English (Canada)</option>
                    <option value="en-AU">English (Australia)</option>
                  </Select>
                </label>

                <label className="grid gap-1.5 text-sm md:col-span-1">
                  <span className="font-semibold text-slate-700">Description (optional)</span>
                  <input
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="High-intent content pipeline"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </label>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Choose a goal preset</CardTitle>
                <CardDescription>Keep setup fast with tuned defaults for goals and constraints.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {PRESET_OPTIONS.map((option) => {
                  const active = option.value === preset;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPreset(option.value)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        active
                          ? "border-[#2f6f71] bg-[#2f6f71]/10"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <p className="font-display text-lg font-bold text-slate-900">{option.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{option.description}</p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Expert mode
                  <Badge variant={expertMode ? "info" : "default"}>{expertMode ? "On" : "Off"}</Badge>
                </CardTitle>
                <CardDescription>
                  Enable only if you want to override strategy defaults. Most users should keep this off.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={expertMode}
                    onChange={(event) => setExpertMode(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Enable expert strategy overrides
                </label>

                {expertMode ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">Scope mode</span>
                      <Select value={scopeMode} onChange={(event) => setScopeMode(event.target.value)}>
                        <option value="strict">strict</option>
                        <option value="balanced_adjacent">balanced_adjacent</option>
                        <option value="broad_education">broad_education</option>
                      </Select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">Branded keyword mode</span>
                      <Select value={brandedMode} onChange={(event) => setBrandedMode(event.target.value)}>
                        <option value="comparisons_only">comparisons_only</option>
                        <option value="exclude_all">exclude_all</option>
                        <option value="allow_all">allow_all</option>
                      </Select>
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">Fit threshold profile</span>
                      <Select value={fitProfile} onChange={(event) => setFitProfile(event.target.value)}>
                        <option value="aggressive">aggressive</option>
                        <option value="moderate">moderate</option>
                        <option value="lenient">lenient</option>
                      </Select>
                    </label>

                    <label className="grid gap-1.5 text-sm md:col-span-3">
                      <span className="font-semibold text-slate-700">Min eligible target (1-100)</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={minEligibleTarget}
                        onChange={(event) => setMinEligibleTarget(event.target.value)}
                        placeholder="Optional"
                        className="h-10 rounded-xl border border-slate-300 px-3 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm md:col-span-2">
                      <span className="font-semibold text-slate-700">Conversion intents</span>
                      <textarea
                        rows={2}
                        value={conversionIntents}
                        onChange={(event) => setConversionIntents(event.target.value)}
                        placeholder="demo, trial"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm md:col-span-2">
                      <span className="font-semibold text-slate-700">Include topics</span>
                      <textarea
                        rows={2}
                        value={includeTopics}
                        onChange={(event) => setIncludeTopics(event.target.value)}
                        placeholder="customer onboarding"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm md:col-span-2">
                      <span className="font-semibold text-slate-700">Exclude topics</span>
                      <textarea
                        rows={2}
                        value={excludeTopics}
                        onChange={(event) => setExcludeTopics(event.target.value)}
                        placeholder="medical advice"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">ICP roles</span>
                      <textarea
                        rows={2}
                        value={icpRoles}
                        onChange={(event) => setIcpRoles(event.target.value)}
                        placeholder="marketing lead"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">ICP industries</span>
                      <textarea
                        rows={2}
                        value={icpIndustries}
                        onChange={(event) => setIcpIndustries(event.target.value)}
                        placeholder="SaaS"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-slate-700">ICP pains</span>
                      <textarea
                        rows={2}
                        value={icpPains}
                        onChange={(event) => setIcpPains(event.target.value)}
                        placeholder="slow onboarding"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {step === 3 ? (
          <motion.div key="step3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <CardTitle>Launch summary</CardTitle>
                <CardDescription>Review and start. You can inspect and tune all steps in the project control room.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Project</p>
                    <p className="font-semibold text-slate-900">{name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Domain</p>
                    <p className="font-semibold text-slate-900">{domain || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Locale</p>
                    <p className="font-semibold text-slate-900">{locale}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Preset</p>
                    <p className="font-semibold text-slate-900">{selectedPreset.title}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">What happens next</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
                    <li>The project is created with your preset goals and constraints.</li>
                    <li>If you choose Create + Start, the discovery loop starts and iterates until enough topics are accepted.</li>
                    <li>You can monitor discovery and creation in their own dedicated project routes.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                Back
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {step < 3 ? (
              <Button type="button" size="lg" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <>
                <Button type="submit" name="intent" value="createProject" variant="outline" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? "Working..." : "Create project"}
                </Button>
                <Button type="submit" name="intent" value="createAndStart" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? "Launching..." : "Create + Start pipeline"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Form>
    </div>
  );
}
