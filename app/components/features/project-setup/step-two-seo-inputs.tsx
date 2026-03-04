import { motion } from "framer-motion";
import { Form, Link } from "react-router";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Select } from "~/components/ui/select";
import { COUNTRY_OPTIONS } from "~/lib/onboarding";
import type { LocaleSelection } from "./types";
import { parsePostsPerWeek, POSTS_PER_WEEK_OPTIONS } from "./utils";

type StepTwoSeoInputsProps = {
  projectId: string | null;
  setupRunId: string | null;
  setupTaskId: string | null;
  derivedLocale: LocaleSelection;
  country: string;
  postsPerWeek: number;
  postsPerWeekError: string | null;
  retryLink: string;
  isSubmitting: boolean;
  showStrategyOverlay: boolean;
  onCountryChange: (value: string) => void;
  onPostsPerWeekChange: (value: number) => void;
  onDismissStrategyOverlay: () => void;
};

export function StepTwoSeoInputsStep({
  projectId,
  setupRunId,
  setupTaskId,
  derivedLocale,
  country,
  postsPerWeek,
  postsPerWeekError,
  retryLink,
  isSubmitting,
  showStrategyOverlay,
  onCountryChange,
  onPostsPerWeekChange,
  onDismissStrategyOverlay,
}: StepTwoSeoInputsProps) {
  return (
    <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="updateProjectStrategy" />
        <input type="hidden" name="project_id" value={projectId ?? ""} />
        <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
        <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
        <input type="hidden" name="primary_locale" value={derivedLocale.locale} />
        <input type="hidden" name="primary_language" value={derivedLocale.language} />
        <input type="hidden" name="posts_per_week" value={String(postsPerWeek)} />

        <Card>
          <CardHeader>
            <CardTitle>SEO inputs</CardTitle>
            <CardDescription>Set your target country and publishing cadence.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Target country</span>
              <Select value={country} onChange={(event) => onCountryChange(event.target.value)}>
                {COUNTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Posts per week</span>
              <Select
                value={String(postsPerWeek)}
                onChange={(event) => {
                  const parsed = parsePostsPerWeek(event.target.value);
                  if (parsed !== null) onPostsPerWeekChange(parsed);
                }}
              >
                {POSTS_PER_WEEK_OPTIONS.map((value) => (
                  <option key={value} value={String(value)}>
                    {value} {value === 1 ? "post" : "posts"} per week
                  </option>
                ))}
              </Select>
              {postsPerWeekError ? <span className="text-xs font-semibold text-rose-600">{postsPerWeekError}</span> : null}
            </label>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={retryLink}>
            <Button type="button" variant="outline">
              Back
            </Button>
          </Link>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save + continue"}
          </Button>
        </div>
      </Form>

      {showStrategyOverlay ? (
        <OnboardingOverlay onNext={onDismissStrategyOverlay} nextLabel="Got it!">
          <DonkeyBubble title="Set your SEO inputs">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Choose your <strong className="text-slate-800">target country</strong> and how many posts you want to publish each week.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              You can continue to optional author profiles in the next step.
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}
    </motion.div>
  );
}

