import { describe, expect, it } from 'vitest';
import { signedIn } from './test/helpers.js';

describe('AI tokens and spaces from the app', () => {
  it('shows the token once, lists it without the secret, and revokes it', async () => {
    const { agent } = await signedIn();
    const created = (await agent.post('/api/tokens').send({ name: 'Claude Code' }).expect(200)).body;
    expect(created.plaintext).toMatch(/^nlpost_[A-Za-z0-9_-]{43}$/);
    const list = (await agent.get('/api/tokens').expect(200)).body;
    expect(list).toEqual([
      expect.objectContaining({ name: 'Claude Code', status: 'active', displayPrefix: created.plaintext.slice(0, 12) }),
    ]);
    expect(JSON.stringify(list)).not.toContain(created.plaintext);
    const revoked = (await agent.post(`/api/tokens/${list[0].id}/revoke`).send({}).expect(200)).body;
    expect(revoked.status).toBe('revoked');
  });

  it('allows five active tokens', async () => {
    const { agent } = await signedIn();
    for (let i = 0; i < 5; i++)
      await agent
        .post('/api/tokens')
        .send({ name: `AI ${i}` })
        .expect(200);
    const res = await agent.post('/api/tokens').send({ name: 'One more' }).expect(409);
    expect(res.body.error.code).toBe('TOKEN_LIMIT');
  });

  it('saves a space as "you" and checks it', async () => {
    const { agent, space } = await signedIn();
    const saved = (
      await agent
        .patch(`/api/spaces/${space.id}`)
        .send({ goal: 'NETWORK', postsPerDay: 2, styleSamples: ['One post'], tone: 'BOLD', readyAt: '07:30' })
        .expect(200)
    ).body;
    expect(saved).toMatchObject({
      goal: 'NETWORK',
      postsPerDay: 2,
      styleSamples: ['One post'],
      tone: 'BOLD',
      readyAt: '07:30',
      updatedBy: 'you',
    });
    const bad = await agent
      .patch(`/api/spaces/${space.id}`)
      .send({ interests: Array(9).fill('a') })
      .expect(400);
    expect(bad.body.error.fields).toEqual(['interests']);
    await agent.patch(`/api/spaces/${space.id}`).send({ readyAt: '25:00' }).expect(400);
  });
});
