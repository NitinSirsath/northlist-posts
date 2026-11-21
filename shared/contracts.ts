/**
 * Shapes shared by the server, the web app and the MCP tools. One file, so the three never drift.
 */
import { z } from 'zod';

export const X_MAX = 280;
/** X counts every link as 23 characters, whatever its length. */
export const X_LINK_LENGTH = 23;
export const LINKEDIN_MAX = 3000;
export const TAKE_MAX = 280;
export const TITLE_MAX = 160;
export const WHY_MAX = 300;
export const IDEAS_PER_CALL = 15;
export const INTERESTS_MAX = 8;
export const SHIPPED_FROM_MAX = 8;
export const STYLE_SAMPLES_MAX = 3;
export const STYLE_SAMPLE_LENGTH = 3000;
export const UNDO_SECONDS = 10;
/** LinkedIn sign-ins last about 60 days; the app warns this many days ahead. */
export const RECONNECT_WARNING_DAYS = 14;

const URL_PATTERN = /https?:\/\/[^\s]+/g;

/** Length as X counts it. */
export function xLength(text: string): number {
  return [...text.replace(URL_PATTERN, 'x'.repeat(X_LINK_LENGTH))].length;
}

/** The text that is really posted: your take first, then the draft. */
export function finalText(take: string, draft: string): string {
  const t = take.trim();
  return t ? `${t}\n\n${draft}` : draft;
}

export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Must be an http or https link');

const shortText = (max: number) => z.string().trim().max(max);

export const GoalSchema = z.enum(['PROMOTE', 'NETWORK', 'JOB']);
export type Goal = z.infer<typeof GoalSchema>;

export const ProfileFieldsSchema = z.object({
  goal: GoalSchema,
  productName: shortText(80),
  productUrl: z.union([z.literal(''), httpUrl]),
  productLine: shortText(200),
  interests: z.array(shortText(60).min(1)).max(INTERESTS_MAX),
  shippedFrom: z.array(shortText(80).min(1)).max(SHIPPED_FROM_MAX),
  postsPerDay: z.number().int().min(0).max(10),
  repliesPerDay: z.number().int().min(0).max(10),
  useX: z.boolean(),
  useLinkedIn: z.boolean(),
  styleSamples: z.array(shortText(STYLE_SAMPLE_LENGTH).min(1)).max(STYLE_SAMPLES_MAX),
});
export type ProfileFields = z.infer<typeof ProfileFieldsSchema>;

/** Any subset of the fields; unknown keys are refused. */
export const ProfilePatchSchema = ProfileFieldsSchema.partial().strict();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export interface ProfileView extends ProfileFields {
  /** "you", or the name of the AI that saved it last. */
  updatedBy: string;
  updatedAt: string;
}

export const IdeaKindSchema = z.enum(['SHIPPED', 'NEWS', 'OWN', 'REPLY']);
export type IdeaKind = z.infer<typeof IdeaKindSchema>;
export type Channel = 'X' | 'LINKEDIN';

/** One idea as the AI sends it with submit_drafts. */
export const SubmitIdeaSchema = z
  .object({
    kind: IdeaKindSchema,
    title: shortText(TITLE_MAX).min(1),
    why: shortText(WHY_MAX).optional(),
    sourceUrl: httpUrl.optional(),
    sourceName: shortText(120).optional(),
    replyTo: z
      .object({
        url: httpUrl,
        author: shortText(120).min(1),
        text: shortText(1000).min(1),
      })
      .strict()
      .optional(),
    x: z.string().trim().min(1).optional(),
    linkedin: z.string().trim().min(1).max(LINKEDIN_MAX).optional(),
  })
  .strict()
  .superRefine((idea, ctx) => {
    if (idea.x !== undefined && xLength(idea.x) > X_MAX)
      ctx.addIssue({ code: 'custom', path: ['x'], message: `X text is over ${X_MAX} characters` });
    if (!idea.x && !idea.linkedin)
      ctx.addIssue({ code: 'custom', path: ['x'], message: 'Send an X text, a LinkedIn text, or both' });
    if (idea.kind === 'REPLY') {
      if (!idea.replyTo) ctx.addIssue({ code: 'custom', path: ['replyTo'], message: 'A reply needs replyTo' });
      if (idea.linkedin) ctx.addIssue({ code: 'custom', path: ['linkedin'], message: 'Reply drafts are for X only' });
    } else if (idea.replyTo) {
      ctx.addIssue({ code: 'custom', path: ['replyTo'], message: 'Only reply drafts have replyTo' });
    }
    if (idea.kind === 'NEWS' && !idea.sourceUrl)
      ctx.addIssue({ code: 'custom', path: ['sourceUrl'], message: 'A news post needs its source link' });
  });
export type SubmitIdea = z.infer<typeof SubmitIdeaSchema>;

export const SubmitDraftsSchema = z.object({ ideas: z.array(SubmitIdeaSchema).min(1).max(IDEAS_PER_CALL) }).strict();

export type PostStatus = 'WAITING' | 'SENDING' | 'POSTED' | 'FAILED' | 'CANCELLED';

export interface PostView {
  id: string;
  ideaId: string;
  channel: Channel;
  text: string;
  status: PostStatus;
  sendAt: string;
  postedAt: string | null;
  url: string | null;
  error: string | null;
  /** Clicks on the product links in this post; null when it has none. */
  clicks: number | null;
}

export interface IdeaView {
  id: string;
  kind: IdeaKind;
  title: string;
  why: string;
  sourceUrl: string | null;
  sourceName: string | null;
  mentionsProduct: boolean;
  replyTo: { url: string; author: string; text: string } | null;
  xText: string | null;
  linkedinText: string | null;
  take: string;
  skipped: boolean;
  copied: boolean;
  fromAi: string;
  createdAt: string;
  posts: PostView[];
}

export const IdeaEditSchema = z
  .object({
    xText: z.string().trim().min(1).optional(),
    linkedinText: z.string().trim().min(1).max(LINKEDIN_MAX).optional(),
    take: shortText(TAKE_MAX).optional(),
  })
  .strict();

export const PostRequestSchema = z.object({ channel: z.enum(['X', 'LINKEDIN']) }).strict();

export interface ConnectionView {
  channel: Channel;
  accountName: string;
  /** Days until the sign-in runs out, when known. */
  expiresInDays: number | null;
}

export interface IntegrationTokenView {
  id: string;
  name: string;
  displayPrefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
}

export const CreateTokenSchema = z.object({ name: shortText(40).min(1) }).strict();

export interface MeView {
  email: string;
  name: string;
  /** Address of the MCP endpoint, for the setup prompt. */
  mcpUrl: string;
  /** Link to the kit on GitHub. */
  kitUrl: string;
  /** Public key for web push, or null when alerts are not set up on the server. */
  vapidPublicKey: string | null;
  /** Local testing only: fake X and LinkedIn. */
  fakeSocial: boolean;
}

export interface PostedSummary {
  postsThisWeek: number;
  postsByChannel: { X: number; LINKEDIN: number };
  clicksThisWeek: number;
  clicksByChannel: { X: number; LINKEDIN: number };
  repliesCopiedThisWeek: number;
  posts: PostView[];
  ideaTitles: Record<string, string>;
}
