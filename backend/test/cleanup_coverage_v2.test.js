import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../services/session.service.js';

describe('User Cleanup Coverage', () => {
    let prisma;
    let deleteUserCascade;
    let cleanupUserInMemory;
    let testUser;

    before(async () => {
        // Ensure DB URL is set correctly using project logic
        const { ensureDatabaseUrl } = await import('../config/database.js');
        ensureDatabaseUrl();

        const prismaMod = await import('../config/prisma.js');
        prisma = prismaMod.prisma;
        await prisma.$connect();

        const cleanupMod = await import('../userCleanup.js');
        deleteUserCascade = cleanupMod.deleteUserCascade;
        cleanupUserInMemory = cleanupMod.cleanupUserInMemory;

        try {
            testUser = await prisma.user.create({
                data: { email: `cleanup_${Date.now()}@test.com`, password: 'hashed' }
            });
        } catch (e) {
            testUser = await prisma.user.create({
                data: { email: `cleanup_retry_${Date.now()}@test.com`, password: 'hashed' }
            });
        }

        await prisma.baziRecord.create({
            data: { userId: testUser.id, pillars: '{}', fiveElements: '{}', tenGods: '{}', luckCycles: '[]', birthYear: 1990, birthMonth: 1, birthDay: 1, birthHour: 0, gender: 'male' }
        });
        await prisma.userSettings.create({
            data: { userId: testUser.id, preferences: '{"theme":"dark"}' }
        });
    });

    after(async () => {
        if (prisma) {
            // Use catch in case already deleted
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => { });
            await prisma.$disconnect();
        }
    });

    it('deleteUserCascade deletes user and all data', async () => {
        const u = await prisma.user.findUnique({ where: { id: testUser.id } });
        assert.ok(u);
        const b = await prisma.baziRecord.findFirst({ where: { userId: testUser.id } });
        assert.ok(b);

        await deleteUserCascade({ prisma, userId: testUser.id });

        const u2 = await prisma.user.findUnique({ where: { id: testUser.id } });
        assert.equal(u2, null);
        const b2 = await prisma.baziRecord.findFirst({ where: { userId: testUser.id } });
        assert.equal(b2, null);
    });

    it('cleanupUserInMemory handles stores', () => {
        const sessionStore = createSessionStore();
        const resetTokenStore = new Map();
        const resetTokenByUser = new Map();

        const userId = 999;
        cleanupUserInMemory(userId, {
            sessionStore, resetTokenStore, resetTokenByUser,
            sessionTokenSecret: null
        });
    });
});
