/**
 * The MCP tools the user's AI calls. The user always comes from the verified token, never from input.
 *   get_profile       every space: what to write about and how (read)
 *   get_recent_posts  one space: what went out lately and what is still waiting (read)
 *   save_profile      changes one space when the user asks in chat (write)
 *   submit_drafts     sends one space's post ideas to Today (write)
 * A user with one space may leave out "space"; with more, every space tool needs it.
 * Input is validated in the handler with the shared zod schemas; the SDK gets a plain JSON Schema
 * (no unions, look-aheads or $schema) because some AI apps accept only a subset.
 */
import { AuthInfo, McpServer, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { ZodError } from 'zod';
import {
  IDEAS_PER_CALL,
  INTERESTS_MAX,
  LINKEDIN_MAX,
  STYLE_SAMPLES_MAX,
  STYLE_SAMPLE_LENGTH,
  TITLE_MAX,
  WHY_MAX,
  X_MAX,
} from '../../shared/contracts.js';
import { prisma } from '../db.js';
import { AppError, fieldsOf } from '../errors.js';
import { recentForAi, submitDrafts } from '../ideas.js';
import { findSpace, listSpaces, resolveSpace, spaceForAi, updateSpace } from '../spaces.js';
import { alertUser } from '../push.js';
import { currentCall } from './callLog.js';

const str = (max: number, description?: string) => ({
  type: 'string',
  maxLength: max,
  ...(description ? { description } : {}),
});
const url = (description: string) => ({ type: 'string', format: 'uri', maxLength: 2048, description });
const strList = (maxItems: number, maxLength: number, description: string) => ({
  type: 'array',
  maxItems,
  items: { type: 'string', minLength: 1, maxLength },
  description,
});

const SPACE_ID = {
  type: 'string',
  maxLength: 40,
  description: 'The space id from get_profile. Needed when there is more than one space.',
};

const PROFILE_PROPERTIES = {
  space: SPACE_ID,
  goal: {
    type: 'string',
    enum: ['PROMOTE', 'NETWORK', 'JOB'],
    description: 'PROMOTE my product, grow my NETWORK, or find a JOB',
  },
  productName: str(80),
  productUrl: { type: 'string', maxLength: 2048, description: 'http(s) link to the product, or an empty string' },
  productLine: str(200, 'One line on what the product does'),
  interests: strList(INTERESTS_MAX, 60, 'Topics to find news about'),
  postsPerDay: { type: 'integer', minimum: 0, maximum: 10 },
  tone: { type: 'string', enum: ['PLAIN', 'FRIENDLY', 'BOLD'] },
  useX: { type: 'boolean' },
  useLinkedIn: { type: 'boolean' },
  styleSamples: strList(
    STYLE_SAMPLES_MAX,
    STYLE_SAMPLE_LENGTH,
    'Two or three posts the user wrote, to copy their tone and length',
  ),
};

export const SAVE_PROFILE_INPUT = { type: 'object', properties: PROFILE_PROPERTIES, additionalProperties: false };

export const SUBMIT_DRAFTS_INPUT = {
  type: 'object',
  properties: {
    space: SPACE_ID,
    ideas: {
      type: 'array',
      minItems: 1,
      maxItems: IDEAS_PER_CALL,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['SHIPPED', 'NEWS', 'OWN'] },
          title: { ...str(TITLE_MAX, 'Short headline the user sees'), minLength: 1 },
          why: str(WHY_MAX, 'One line: why this is worth posting today'),
          sourceUrl: url('The article link. Required for NEWS.'),
          sourceName: str(120, 'Name of the site or person the news is from'),
          x: {
            type: 'string',
            minLength: 1,
            description: `X text, at most ${X_MAX} characters (each link counts as 23)`,
          },
          linkedin: {
            type: 'string',
            minLength: 1,
            maxLength: LINKEDIN_MAX,
            description: 'LinkedIn text',
          },
        },
        required: ['kind', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['ideas'],
  additionalProperties: false,
};

const EMPTY_INPUT = { type: 'object', properties: {}, additionalProperties: false };
const SPACE_INPUT = { type: 'object', properties: { space: SPACE_ID }, additionalProperties: false };

const spaceArg = (args: unknown) => {
  const value = (args as { space?: unknown } | undefined)?.space;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const advertised = (schema: Record<string, unknown>): StandardSchemaWithJSON<unknown, unknown> => ({
  '~standard': {
    version: 1,
    vendor: 'northlist-posts',
    validate: (value: unknown) => ({ value }),
    jsonSchema: { input: () => schema, output: () => schema },
  },
});

function toolError(code: 'invalid_input' | 'unavailable', fields?: string[]) {
  const retry = code === 'invalid_input' ? 'Fix the listed fields, then call again.' : 'Retry later.';
  const body = { code, ...(fields?.length ? { fields } : {}), retry };
  return { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: true };
}

export function identityOf(authInfo: AuthInfo | undefined) {
  const extra = authInfo?.extra as { userId?: unknown; tokenId?: unknown } | undefined;
  if (typeof extra?.userId !== 'string' || typeof extra?.tokenId !== 'string') return null;
  return { userId: extra.userId, tokenId: extra.tokenId };
}

async function run(
  tool: string,
  authInfo: AuthInfo | undefined,
  work: (userId: string, aiName: string) => Promise<Record<string, unknown>>,
) {
  const call = currentCall();
  if (call) call.tool = tool;
  const identity = identityOf(authInfo);
  if (!identity) return toolError('unavailable');
  try {
    const token = await prisma.integrationToken.findUnique({ where: { id: identity.tokenId }, select: { name: true } });
    const result = await work(identity.userId, token?.name ?? 'Your AI');
    if (call) call.outcome = 'ok';
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  } catch (err) {
    if (err instanceof ZodError) {
      const fields = fieldsOf(err);
      if (call) Object.assign(call, { outcome: 'invalid_input', invalidFields: fields });
      // The messages say what is wrong (e.g. "X text is over 280 characters"), never the values.
      const body = {
        code: 'invalid_input',
        fields,
        problems: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        retry: 'Fix the listed fields, then call again.',
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: true };
    }
    // A known problem the AI can fix (no such space, which space?): say so in plain words.
    if (err instanceof AppError && err.status < 500) {
      if (call) Object.assign(call, { outcome: 'invalid_input', errorCategory: err.code });
      const body = { code: err.code.toLowerCase(), message: err.message, retry: 'Fix this, then call again.' };
      return { content: [{ type: 'text' as const, text: JSON.stringify(body) }], isError: true };
    }
    if (call)
      Object.assign(call, { outcome: 'unavailable', errorCategory: err instanceof Error ? err.name : 'UnknownError' });
    return toolError('unavailable');
  }
}

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function createMcpServer(authInfo: AuthInfo | undefined) {
  const server = new McpServer({ name: 'northlist-posts', version: '0.1.0' });

  server.registerTool(
    'get_profile',
    {
      title: 'Get profile',
      description:
        "The user's spaces. Each space is one goal with its own product, links to read (websites, GitHub repos; private repos you read with your own GitHub access), interests, posts per day, tone, style samples and connected channels. Write for each space separately. Read it before writing.",
      inputSchema: advertised(EMPTY_INPUT),
      annotations: READ,
    },
    () =>
      run('get_profile', authInfo, async (userId) => {
        const ids = (await listSpaces(userId)).map((s) => s.id);
        const spaces = await Promise.all(ids.map(async (id) => spaceForAi(await findSpace(userId, id))));
        return { spaces, now: new Date().toISOString() };
      }),
  );

  server.registerTool(
    'get_recent_posts',
    {
      title: 'Get recent posts',
      description:
        'For one space: the last 30 posts that went out, ideas still waiting on Today, and how many ideas of each kind were sent in the last 20 hours. Read it so you do not repeat a topic or send more than the daily numbers.',
      inputSchema: advertised(SPACE_INPUT),
      annotations: READ,
    },
    (args: unknown) =>
      run('get_recent_posts', authInfo, async (userId) => {
        const space = await resolveSpace(userId, spaceArg(args));
        return { space: space.name, ...(await recentForAi(userId, space.id)) };
      }),
  );

  server.registerTool(
    'save_profile',
    {
      title: 'Save profile',
      description:
        'Change one space when the user asks you to (setup itself happens in the app). Send only the fields that change. The user sees the change in the app.',
      inputSchema: advertised(SAVE_PROFILE_INPUT),
      annotations: WRITE,
    },
    (args: unknown) =>
      run('save_profile', authInfo, async (userId, aiName) => {
        const { space: _space, ...fields } = (args ?? {}) as Record<string, unknown>;
        const space = await resolveSpace(userId, spaceArg(args));
        const saved = await updateSpace(userId, space.id, fields, aiName);
        return { space: spaceForAi(await findSpace(userId, saved.id)) };
      }),
  );

  server.registerTool(
    'submit_drafts',
    {
      title: 'Submit drafts',
      description: [
        "Send one space's post ideas to the user's Today page (say which space). Nothing is posted: the user reads, edits and posts each one.",
        'Each idea has a kind (SHIPPED, NEWS, OWN), a short title, one line why, and an X text and/or a LinkedIn text.',
        'NEWS needs sourceUrl.',
        `At most ${IDEAS_PER_CALL} ideas per call. The same idea sent again is kept once (already_sent).`,
      ].join(' '),
      inputSchema: advertised(SUBMIT_DRAFTS_INPUT),
      annotations: WRITE,
    },
    (args: unknown) =>
      run('submit_drafts', authInfo, async (userId, aiName) => {
        const result = await submitDrafts(userId, aiName, args);
        if (result.created)
          await alertUser(
            userId,
            `${result.created} new ${result.created === 1 ? 'draft' : 'drafts'}`,
            `From ${aiName}. Open Today to post.`,
            '/',
          ).catch(() => {});
        return { ...result };
      }),
  );

  return server;
}
