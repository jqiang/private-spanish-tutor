-- CreateTable
CREATE TABLE "LearnerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "coveredUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
