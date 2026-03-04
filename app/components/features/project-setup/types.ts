import type { components } from "~/types/api.generated";

export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type TaskStatusResponse = components["schemas"]["TaskStatusResponse"];
export type BrandVisualContextResponse = components["schemas"]["BrandVisualContextResponse"];
export type AuthorCreate = components["schemas"]["AuthorCreate"];
export type ProjectApiKeyResponse = components["schemas"]["ProjectApiKeyResponse"];
export type ProjectWebhookSecretResponse = components["schemas"]["ProjectWebhookSecretResponse"];

export type AuthorDraft = {
  id: string;
  persisted_author_id: string;
  name: string;
  bio: string;
  website_url: string;
  linkedin_url: string;
  twitter_url: string;
  profile_image_source_url: string;
  profile_image_object_key: string;
  profile_image_mime_type: string;
};

export type AuthorField = keyof Omit<AuthorDraft, "id">;

export type SubmittedOnboardingAuthor = {
  persisted_author_id: string | null;
  name: string;
  bio: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  profile_image_source_url: string | null;
  profile_image_object_key: string | null;
  profile_image_mime_type: string | null;
};

export type ExpandedAsset = {
  url: string;
  role: string;
};

export type LocaleSelection = {
  locale: string;
  language: string;
};

export type AuthorImageUploadStatus = {
  state: "idle" | "preparing" | "uploading" | "uploaded" | "error";
  message?: string;
};
