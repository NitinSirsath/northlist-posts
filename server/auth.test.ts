import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig, setConfig } from './config.js';
import { OWNER, app, signedIn } from './test/helpers.js';

describe('sign-in', () => {
  it('lets only the owner email in', async () => {
    await request(app()).post('/api/auth/dev-login').send({ email: 'someone@example.com' }).expect(403);
    const { agent } = await signedIn();
    const me = await agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ email: OWNER, mcpUrl: 'https://posts.example.com/mcp', fakeSocial: true });
  });

  it('refuses every API call when signed out', async () => {
    await request(app()).get('/api/me').expect(401);
    await request(app()).get('/api/ideas/today').expect(401);
  });

  it('signs out', async () => {
    const { agent } = await signedIn();
    await agent.post('/api/auth/sign-out').send({}).expect(200);
    await agent.get('/api/me').expect(401);
  });

  it('drops access when the email leaves OWNER_EMAIL', async () => {
    const { agent } = await signedIn();
    setConfig({ ...loadConfig(), ownerEmails: ['other@example.com'] });
    await agent.get('/api/me').expect(401);
  });

  it('has no dev sign-in unless DEV_LOGIN is on', async () => {
    setConfig({ ...loadConfig(), devLogin: false });
    await request(app()).post('/api/auth/dev-login').send({ email: OWNER }).expect(404);
  });

  it('refuses changes sent as a form, not JSON', async () => {
    const { agent } = await signedIn();
    await agent.post('/api/tokens').type('form').send('name=x').expect(415);
  });

  it('refuses fake X/LinkedIn and dev sign-in in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', FAKE_SOCIAL: '1', ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }),
    ).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/ENCRYPTION_KEY/);
  });
});
