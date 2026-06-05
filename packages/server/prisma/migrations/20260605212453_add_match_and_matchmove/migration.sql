-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('PVP');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('FINISHED', 'FORFEITED');

-- CreateEnum
CREATE TYPE "MoveResult" AS ENUM ('MISS', 'HIT', 'SUNK');

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "matchKey" TEXT NOT NULL,
    "lobbyCode" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL DEFAULT 'PVP',
    "status" "MatchStatus" NOT NULL,
    "playerAId" TEXT,
    "playerADisplay" TEXT NOT NULL,
    "playerBId" TEXT,
    "playerBDisplay" TEXT NOT NULL,
    "winnerSeat" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchMove" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "byPlayer" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "result" "MoveResult" NOT NULL,

    CONSTRAINT "MatchMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Match_matchKey_key" ON "Match"("matchKey");

-- CreateIndex
CREATE INDEX "Match_playerAId_idx" ON "Match"("playerAId");

-- CreateIndex
CREATE INDEX "Match_playerBId_idx" ON "Match"("playerBId");

-- CreateIndex
CREATE INDEX "MatchMove_matchId_idx" ON "MatchMove"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchMove_matchId_turnIndex_key" ON "MatchMove"("matchId", "turnIndex");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMove" ADD CONSTRAINT "MatchMove_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
