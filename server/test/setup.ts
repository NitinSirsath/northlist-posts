import { afterAll, beforeEach } from 'vitest';
import { setConfig } from '../config.js';
import { prisma } from '../db.js';

const TABLES = [
  'Post',
  'ShortLink',
  'Idea',
  'SocialConnection',
  'IntegrationToken',
  'PushSubscription',
  'Session',
  'OAuthState',
  'Profile',
  'User',
];

beforeEach(async () => {
  setConfig(undefined);
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
