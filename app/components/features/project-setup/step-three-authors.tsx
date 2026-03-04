import { motion } from "framer-motion";
import { Globe, Linkedin, Twitter, Upload } from "lucide-react";
import { Form, Link } from "react-router";
import { DonkeyBubble } from "~/components/onboarding/donkey-bubble";
import { OnboardingOverlay } from "~/components/onboarding/onboarding-overlay";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import type { AuthorDraft, AuthorField, AuthorImageUploadStatus } from "./types";

type AuthorProfileCardProps = {
  author: AuthorDraft;
  index: number;
  imagePreviewUrl?: string;
  imageFileName?: string;
  imageUploadStatus?: AuthorImageUploadStatus;
  onAuthorChange: (field: AuthorField, value: string) => void;
  onImageInputRef: (node: HTMLInputElement | null) => void;
  onImagePickerClick: () => void;
  onImageFileChange: (files: FileList | null) => void;
};

function AuthorProfileCard({
  author,
  index,
  imagePreviewUrl,
  imageFileName,
  imageUploadStatus,
  onAuthorChange,
  onImageInputRef,
  onImagePickerClick,
  onImageFileChange,
}: AuthorProfileCardProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">Author {index + 1}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm md:col-span-2">
          <span className="font-semibold text-slate-700">Name</span>
          <input
            type="text"
            value={author.name}
            onChange={(event) => onAuthorChange("name", event.target.value)}
            placeholder="Jane Doe"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm"
          />
        </label>

        <label className="grid gap-1.5 text-sm md:col-span-2">
          <span className="font-semibold text-slate-700">Bio</span>
          <textarea
            value={author.bio}
            onChange={(event) => onAuthorChange("bio", event.target.value)}
            placeholder="SEO strategist focused on B2B SaaS growth."
            rows={3}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-1.5 text-sm md:col-span-2">
          <span className="font-semibold text-slate-700">Profiles & socials</span>
          <div className="grid gap-2 md:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Blog or website URL</span>
              <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={author.website_url}
                onChange={(event) => onAuthorChange("website_url", event.target.value)}
                placeholder="Blog / website"
                className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
              />
            </label>

            <label className="relative">
              <span className="sr-only">LinkedIn URL</span>
              <Linkedin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={author.linkedin_url}
                onChange={(event) => onAuthorChange("linkedin_url", event.target.value)}
                placeholder="LinkedIn"
                className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
              />
            </label>

            <label className="relative">
              <span className="sr-only">X or Twitter URL</span>
              <Twitter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={author.twitter_url}
                onChange={(event) => onAuthorChange("twitter_url", event.target.value)}
                placeholder="X / Twitter"
                className="h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-1.5 text-sm md:col-span-2">
          <span className="font-semibold text-slate-700">Profile image</span>
          <div className="flex items-center gap-4">
            <input
              ref={onImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => onImageFileChange(event.target.files)}
            />
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt={`${author.name || "Author"} profile preview`}
                className="h-20 w-20 shrink-0 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                <Upload className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={onImagePickerClick}
                disabled={imageUploadStatus?.state === "preparing" || imageUploadStatus?.state === "uploading"}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload image
              </Button>
              <p className="truncate text-xs text-slate-500">{imageFileName ?? "No file selected"}</p>
            </div>
          </div>
          {imageUploadStatus?.message ? (
            <p className={`text-xs ${imageUploadStatus.state === "error" ? "font-semibold text-rose-700" : "text-slate-600"}`}>
              {imageUploadStatus.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type StepThreeAuthorsProps = {
  projectId: string | null;
  setupRunId: string | null;
  setupTaskId: string | null;
  authors: AuthorDraft[];
  authorsPayloadJson: string;
  authorsFieldError: string | undefined;
  isSubmitting: boolean;
  hasPendingAuthorImageUpload: boolean;
  backLink: string;
  showAuthorsOverlay: boolean;
  onAuthorChange: (authorId: string, field: AuthorField, value: string) => void;
  onAuthorImageInputRef: (authorId: string, node: HTMLInputElement | null) => void;
  onAuthorImagePickerClick: (authorId: string) => void;
  onAuthorImageFileChange: (authorId: string, files: FileList | null) => void;
  authorImagePreviewUrls: Record<string, string>;
  authorImageFileNames: Record<string, string>;
  authorImageUploadStatuses: Record<string, AuthorImageUploadStatus>;
  onDismissAuthorsOverlay: () => void;
};

export function StepThreeAuthorsStep({
  projectId,
  setupRunId,
  setupTaskId,
  authors,
  authorsPayloadJson,
  authorsFieldError,
  isSubmitting,
  hasPendingAuthorImageUpload,
  backLink,
  showAuthorsOverlay,
  onAuthorChange,
  onAuthorImageInputRef,
  onAuthorImagePickerClick,
  onAuthorImageFileChange,
  authorImagePreviewUrls,
  authorImageFileNames,
  authorImageUploadStatuses,
  onDismissAuthorsOverlay,
}: StepThreeAuthorsProps) {
  return (
    <motion.div key="step3-authors" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="saveProjectAuthors" />
        <input type="hidden" name="project_id" value={projectId ?? ""} />
        <input type="hidden" name="setup_run_id" value={setupRunId ?? ""} />
        <input type="hidden" name="setup_task_id" value={setupTaskId ?? ""} />
        <input type="hidden" name="authors_json" value={authorsPayloadJson} />

        <Card>
          <CardHeader>
            <CardTitle>Authors (optional)</CardTitle>
            <CardDescription>
              Adding authors strengthens credibility and E-E-A-T signals. Articles can include consistent bylines, bios, and profile images
              from day one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authors.map((author, index) => (
              <AuthorProfileCard
                key={author.id}
                author={author}
                index={index}
                imagePreviewUrl={authorImagePreviewUrls[author.id]}
                imageFileName={authorImageFileNames[author.id]}
                imageUploadStatus={authorImageUploadStatuses[author.id]}
                onAuthorChange={(field, value) => onAuthorChange(author.id, field, value)}
                onImageInputRef={(node) => onAuthorImageInputRef(author.id, node)}
                onImagePickerClick={() => onAuthorImagePickerClick(author.id)}
                onImageFileChange={(files) => onAuthorImageFileChange(author.id, files)}
              />
            ))}

            {authorsFieldError ? <p className="text-sm font-semibold text-rose-700">{authorsFieldError}</p> : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={backLink}>
            <Button type="button" variant="outline">
              Back
            </Button>
          </Link>
          <Button type="submit" size="lg" disabled={isSubmitting || hasPendingAuthorImageUpload}>
            {isSubmitting ? "Saving..." : "Continue to scraping"}
          </Button>
        </div>
      </Form>

      {showAuthorsOverlay ? (
        <OnboardingOverlay onNext={onDismissAuthorsOverlay} nextLabel="Got it!">
          <DonkeyBubble title="Add optional author profiles">
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Add real author details so generated articles include <strong className="text-slate-800">credible bylines</strong>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This strengthens perceived expertise and trust signals, which is good for SEO. Skip this step if you want and add authors later.
            </p>
          </DonkeyBubble>
        </OnboardingOverlay>
      ) : null}
    </motion.div>
  );
}

