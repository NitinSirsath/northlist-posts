import type { Profile } from '@prisma/client';
import { ProfileFieldsSchema, ProfilePatch, ProfilePatchSchema, ProfileView } from '../shared/contracts.js';
import { prisma } from './db.js';

export function toProfileView(row: Profile): ProfileView {
  return {
    goal: row.goal,
    productName: row.productName,
    productUrl: row.productUrl,
    productLine: row.productLine,
    interests: row.interests,
    shippedFrom: row.shippedFrom,
    postsPerDay: row.postsPerDay,
    repliesPerDay: row.repliesPerDay,
    useX: row.useX,
    useLinkedIn: row.useLinkedIn,
    styleSamples: row.styleSamples,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProfile(userId: string) {
  const row = await prisma.profile.upsert({ where: { userId }, update: {}, create: { userId } });
  return toProfileView(row);
}

/**
 * Saves any subset of the fields. `by` is "you" (the app) or the AI token's name (save_profile).
 * The merged result must still be valid as a whole.
 */
export async function saveProfile(userId: string, input: unknown, by: string) {
  const patch: ProfilePatch = ProfilePatchSchema.parse(input);
  const current = await getProfile(userId);
  const { updatedBy: _by, updatedAt: _at, ...fields } = current;
  ProfileFieldsSchema.parse({ ...fields, ...patch });
  const row = await prisma.profile.update({ where: { userId }, data: { ...patch, updatedBy: by } });
  return toProfileView(row);
}
