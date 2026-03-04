import { motion } from "framer-motion";
import { Form } from "react-router";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

type StepOneProjectInfoProps = {
  domain: string;
  name: string;
  description: string;
  postsPerWeek: number;
  domainError: string | null;
  nameError: string | undefined;
  isSubmitting: boolean;
  domainIsValid: boolean;
  onDomainChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  showWelcomeIntro: boolean;
  showWelcomeFocus: boolean;
  onWelcomeIntroNext: () => void;
  onWelcomeFocusNext: () => void;
};

export function StepOneProjectInfoStep({
  domain,
  name,
  description,
  postsPerWeek,
  domainError,
  nameError,
  isSubmitting,
  domainIsValid,
  onDomainChange,
  onNameChange,
  onDescriptionChange,
  showWelcomeIntro,
  showWelcomeFocus,
  onWelcomeIntroNext,
  onWelcomeFocusNext,
}: StepOneProjectInfoProps) {
  return (
    <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="bootstrapProject" />
        <input type="hidden" name="domain" value={domain} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="posts_per_week" value={String(postsPerWeek)} />

        <Card>
          <CardHeader>
            <CardTitle>Basic project info</CardTitle>
            <CardDescription>Create the project and initialize onboarding setup in the background.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm md:col-span-2">
              <span className="font-semibold text-slate-700">Domain</span>
              <div
                className={`flex h-11 items-center rounded-xl border bg-white text-sm ${
                  domainError ? "border-rose-400" : "border-slate-300"
                }`}
              >
                <span className="select-none pl-3 text-slate-400">https://</span>
                <input
                  type="text"
                  value={domain}
                  onChange={(event) => onDomainChange(event.target.value)}
                  placeholder="example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={Boolean(domainError)}
                  className="h-full min-w-0 flex-1 rounded-r-xl border-0 bg-transparent px-1 pr-3 text-sm outline-none"
                />
              </div>
              {domainError ? <span className="text-xs font-semibold text-rose-600">{domainError}</span> : null}
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Project name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Acme Growth Engine"
                className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
              />
              {nameError ? <span className="text-xs font-semibold text-rose-600">{nameError}</span> : null}
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold text-slate-700">Description (optional)</span>
              <input
                type="text"
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Weekly SEO content pipeline"
                className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
              />
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={isSubmitting || !domainIsValid}>
            {isSubmitting ? "Setting up..." : "Next step"}
          </Button>
        </div>
      </Form>

      {showWelcomeIntro ? (
        <OnboardingOverlay onNext={onWelcomeIntroNext} nextLabel="Let's go!">
          <DonkeyBubble title="Welcome to Donkey SEO!">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              I'm your professional<strong className="text-slate-800"> SEO assistant</strong>. I'll help you:
            </p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-slate-600">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>
                  Rank higher on <strong className="text-slate-800">Google search results</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>
                  Get featured in <strong className="text-slate-800">Google's AI Overview</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#2f6f71]">&#x2713;</span>
                <span>
                  All on <strong className="text-slate-800">autopilot</strong>; minimal effort on your end
                </span>
              </li>
            </ul>
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}

      {showWelcomeFocus ? (
        <OnboardingOverlay
          onNext={onWelcomeFocusNext}
          nextLabel="Got it!"
          focusSelector='[data-onboarding-focus="page-content"]'
        >
          <DonkeyBubble title="Let's set up your first project">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Enter your <strong className="text-slate-800">website domain</strong> and I'll analyze your site to build a tailored SEO
              strategy. The <strong className="text-slate-800">project name</strong> is auto-suggested from your domain.
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}
    </motion.div>
  );
}
