-- CreateIndex
CREATE INDEX "BaziRecord_userId_createdAt_idx" ON "BaziRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_recordId_idx" ON "Favorite"("recordId");

-- CreateIndex
CREATE INDEX "IchingRecord_userId_createdAt_idx" ON "IchingRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TarotRecord_userId_createdAt_idx" ON "TarotRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ZiweiRecord_userId_createdAt_idx" ON "ZiweiRecord"("userId", "createdAt");
