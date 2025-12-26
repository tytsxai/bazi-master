import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../server.js';
import { prisma } from '../config/prisma.js';

describe('Auth Controller Logic V2', () => {
    before(async () => await prisma.$connect());
    after(async () => await prisma.$disconnect());

    // Assuming mounted at /api/auth based on standard practice, verified in next step
    const PREFIX = '/api/auth';

    it('Register fails with invalid email', async () => {
        await request(app).post(`${PREFIX}/register`).send({ email: 'bad' }).expect(400);
    });

    it('Register fails with short password', async () => {
        await request(app).post(`${PREFIX}/register`).send({ email: 'valid@test.com', password: '1' }).expect(400);
    });

    it('Login fails without password', async () => {
        await request(app).post(`${PREFIX}/login`).send({ email: 'valid@test.com' }).expect(400);
    });

    it('Password Reset Request validates email', async () => {
        await request(app).post(`${PREFIX}/password/request`).send({ email: 'none@test.com' }).expect(200);
    });

    it('Password Reset Confirm validates token', async () => {
        await request(app).post(`${PREFIX}/password/reset`).send({ token: '', password: 'new' }).expect(400);
        await request(app).post(`${PREFIX}/password/reset`).send({ token: 'bad', password: 'new' }).expect(400);
    });

    it('Password Reset Confirm validates password length', async () => {
        await request(app).post(`${PREFIX}/password/reset`).send({ token: 'tok', password: '1' }).expect(400);
    });
});
