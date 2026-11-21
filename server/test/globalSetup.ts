import { execSync } from 'node:child_process';

/** Brings the test database up to the latest migration once per run. */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/northlist_posts_test?schema=public';
  if (!/_test\b|test\?/.test(url)) throw new Error('Refusing to migrate a database whose name does not say test');
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
