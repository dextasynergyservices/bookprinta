-- Fix the "launch" typo in two package-category slugs ("author-lunch" →
-- "author-launch", "dexta-lunch" → "dexta-launch"). The slug is visible in
-- checkout URLs (?category=…). Old links keep working: checkout falls back to
-- matching the package slug alone when the category slug does not match.
-- Data-only and idempotent; skipped if the corrected slug is already taken.

UPDATE "PackageCategory" AS category
SET "slug" = 'author-launch', "updatedAt" = CURRENT_TIMESTAMP
WHERE category."slug" = 'author-lunch'
  AND NOT EXISTS (SELECT 1 FROM "PackageCategory" WHERE "slug" = 'author-launch');

UPDATE "PackageCategory" AS category
SET "slug" = 'dexta-launch', "updatedAt" = CURRENT_TIMESTAMP
WHERE category."slug" = 'dexta-lunch'
  AND NOT EXISTS (SELECT 1 FROM "PackageCategory" WHERE "slug" = 'dexta-launch');
