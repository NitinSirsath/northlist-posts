/** The first-run steps (owner, 22 Nov 2026): the step reached, so leaving halfway resumes there, and done. */
import { ONBOARDING_STEPS, OnboardingPatchSchema } from '../shared/contracts.js';
import { prisma } from './db.js';
import { AppError } from './errors.js';

export async function onboardingOf(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { onboardingStep: true, onboardedAt: true },
  });
  return { onboardingStep: user.onboardingStep, onboarded: user.onboardedAt !== null };
}

export async function saveOnboarding(userId: string, input: unknown, now = new Date()) {
  const { step, done } = OnboardingPatchSchema.parse(input);
  // Finishing needs a space: the goal step makes it.
  if (done && !(await prisma.space.count({ where: { userId } })))
    throw new AppError(409, 'NO_SPACE', 'Pick a goal first: it makes your first space.');
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingStep: Math.min(step, ONBOARDING_STEPS), ...(done ? { onboardedAt: now } : {}) },
  });
  return onboardingOf(userId);
}
