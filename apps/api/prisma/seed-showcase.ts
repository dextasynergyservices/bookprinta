import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client.js";

interface ShowcaseCategorySeed {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

interface ShowcaseAuthorSeed {
  email: string;
  firstName: string;
  lastName: string;
  bio: string;
  profileImageUrl: string;
  whatsAppNumber: string;
  websiteUrl: string;
  purchaseLinks: Prisma.InputJsonValue;
  socialLinks: Prisma.InputJsonValue;
}

interface ShowcaseEntrySeed {
  authorEmail: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string;
  testimonial: string;
  categorySlug: string;
  publishedYear: number;
  publishedAt: Date;
  isFeatured: boolean;
  sortOrder: number;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const categories: ShowcaseCategorySeed[] = [
  {
    name: "Fiction",
    slug: "fiction",
    description: "Immersive stories, literary fiction, and narrative-driven books.",
    sortOrder: 0,
    isActive: true,
  },
  {
    name: "Business",
    slug: "business",
    description: "Practical business books, leadership insights, and founder playbooks.",
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "Memoir",
    slug: "memoir",
    description: "Personal stories, lived experiences, and reflective life writing.",
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "Poetry",
    slug: "poetry",
    description: "Collections of poems, spoken-word books, and lyrical storytelling.",
    sortOrder: 3,
    isActive: true,
  },
];

function daysAgo(days: number): Date {
  const now = new Date();
  const copy = new Date(now);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

const authors: ShowcaseAuthorSeed[] = [
  {
    email: "amaka.okoye+showcase@bookprinta.com",
    firstName: "Amaka",
    lastName: "Okoye",
    bio: "Amaka Okoye writes character-led fiction about ambition, family, and modern city life. Her books focus on emotional clarity and strong chapter pacing.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80&fm=webp",
    whatsAppNumber: "+2348010001001",
    websiteUrl: "https://authors.bookprinta.com/amaka-okoye",
    purchaseLinks: [
      {
        label: "BookPrinta Store",
        url: "https://bookprinta.com/showcase/lagos-after-rain",
      },
      {
        label: "Amazon",
        url: "https://example.com/lagos-after-rain",
      },
    ],
    socialLinks: [
      {
        platform: "instagram",
        url: "https://instagram.com/amakaokoyewrites",
      },
      {
        platform: "x",
        url: "https://x.com/amakaokoyewrites",
      },
    ],
  },
  {
    email: "tunde.alade+showcase@bookprinta.com",
    firstName: "Tunde",
    lastName: "Alade",
    bio: "Tunde Alade helps founders build disciplined operating systems. His writing turns business lessons into direct, practical frameworks.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1200&q=80&fm=webp",
    whatsAppNumber: "+2348010001002",
    websiteUrl: "https://authors.bookprinta.com/tunde-alade",
    purchaseLinks: [
      {
        label: "BookPrinta Store",
        url: "https://bookprinta.com/showcase/building-with-discipline",
      },
    ],
    socialLinks: [
      {
        platform: "linkedin",
        url: "https://linkedin.com/in/tundealade",
      },
      {
        platform: "website",
        url: "https://tundealade.com",
      },
    ],
  },
  {
    email: "zainab.salisu+showcase@bookprinta.com",
    firstName: "Zainab",
    lastName: "Salisu",
    bio: "Zainab Salisu writes reflective memoir and essays that trace memory, migration, and identity with a quiet, deliberate voice.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1200&q=80&fm=webp",
    whatsAppNumber: "+2348010001003",
    websiteUrl: "https://authors.bookprinta.com/zainab-salisu",
    purchaseLinks: [
      {
        label: "BookPrinta Store",
        url: "https://bookprinta.com/showcase/letters-from-kaduna-road",
      },
    ],
    socialLinks: [
      {
        platform: "instagram",
        url: "https://instagram.com/zainabwrites",
      },
    ],
  },
  {
    email: "ifeanyi.nwosu+showcase@bookprinta.com",
    firstName: "Ifeanyi",
    lastName: "Nwosu",
    bio: "Ifeanyi Nwosu performs and publishes contemporary poetry that blends place, memory, and spoken-word rhythm.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1200&q=80&fm=webp",
    whatsAppNumber: "+2348010001004",
    websiteUrl: "https://authors.bookprinta.com/ifeanyi-nwosu",
    purchaseLinks: [
      {
        label: "BookPrinta Store",
        url: "https://bookprinta.com/showcase/riverlight-poems",
      },
    ],
    socialLinks: [
      {
        platform: "youtube",
        url: "https://youtube.com/@ifeanyinwosu",
      },
    ],
  },
  {
    email: "kemi.adekoya+showcase@bookprinta.com",
    firstName: "Kemi",
    lastName: "Adekoya",
    bio: "Kemi Adekoya writes warm, accessible non-fiction for professionals building sustainable careers and businesses.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=1200&q=80&fm=webp",
    whatsAppNumber: "+2348010001005",
    websiteUrl: "https://authors.bookprinta.com/kemi-adekoya",
    purchaseLinks: [
      {
        label: "BookPrinta Store",
        url: "https://bookprinta.com/showcase/the-steady-founder",
      },
    ],
    socialLinks: [
      {
        platform: "linkedin",
        url: "https://linkedin.com/in/kemiadekoya",
      },
    ],
  },
];

const entries: ShowcaseEntrySeed[] = [
  {
    authorEmail: "amaka.okoye+showcase@bookprinta.com",
    authorName: "Amaka Okoye",
    bookTitle: "Lagos After Rain",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80&fm=webp",
    aboutBook:
      "A contemporary novel about friendship, class, and reinvention in Lagos, told through four intersecting lives.",
    testimonial:
      "BookPrinta made the process feel editorial, not transactional. The final result looked like a serious bookstore-ready book.",
    categorySlug: "fiction",
    publishedYear: 2025,
    publishedAt: daysAgo(18),
    isFeatured: true,
    sortOrder: 0,
  },
  {
    authorEmail: "tunde.alade+showcase@bookprinta.com",
    authorName: "Tunde Alade",
    bookTitle: "Building With Discipline",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80&fm=webp",
    aboutBook:
      "A concise business guide for founders who need better execution habits, team rhythms, and operating discipline.",
    testimonial:
      "The trim size guidance and print quality gave the book a premium feel. It now represents my brand properly.",
    categorySlug: "business",
    publishedYear: 2025,
    publishedAt: daysAgo(26),
    isFeatured: true,
    sortOrder: 1,
  },
  {
    authorEmail: "zainab.salisu+showcase@bookprinta.com",
    authorName: "Zainab Salisu",
    bookTitle: "Letters From Kaduna Road",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1200&q=80&fm=webp",
    aboutBook:
      "A memoir about memory, movement, and belonging, written as intimate letters across different periods of life.",
    testimonial:
      "What stood out was the patience and clarity. I always knew what stage the book was at and what came next.",
    categorySlug: "memoir",
    publishedYear: 2024,
    publishedAt: daysAgo(34),
    isFeatured: true,
    sortOrder: 2,
  },
  {
    authorEmail: "ifeanyi.nwosu+showcase@bookprinta.com",
    authorName: "Ifeanyi Nwosu",
    bookTitle: "Riverlight Poems",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1455885666463-8d5f2c4c3fd3?auto=format&fit=crop&w=1200&q=80&fm=webp",
    aboutBook:
      "A poetry collection moving between city evenings, remembered voices, and quiet spiritual reflection.",
    testimonial:
      "The finished book preserved the pacing of the poems and gave the work the breathing room it needed on the page.",
    categorySlug: "poetry",
    publishedYear: 2025,
    publishedAt: daysAgo(42),
    isFeatured: true,
    sortOrder: 3,
  },
  {
    authorEmail: "kemi.adekoya+showcase@bookprinta.com",
    authorName: "Kemi Adekoya",
    bookTitle: "The Steady Founder",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1200&q=80&fm=webp",
    aboutBook:
      "A practical leadership book about building a durable company without scaling chaos or founder burnout.",
    testimonial:
      "From proofing to the finished copy, the process was structured and reliable. That mattered more than marketing language.",
    categorySlug: "business",
    publishedYear: 2026,
    publishedAt: daysAgo(9),
    isFeatured: false,
    sortOrder: 10,
  },
];

async function seedCategories() {
  const categoryIdsBySlug = new Map<string, string>();

  for (const category of categories) {
    const result = await prisma.showcaseCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
      create: category,
      select: { id: true, slug: true, name: true },
    });

    categoryIdsBySlug.set(result.slug, result.id);
    console.log(`  - Category: ${result.name}`);
  }

  return categoryIdsBySlug;
}

async function seedAuthors() {
  const authorIdsByEmail = new Map<string, string>();

  for (const author of authors) {
    const result = await prisma.user.upsert({
      where: { email: author.email },
      update: {
        firstName: author.firstName,
        lastName: author.lastName,
        role: "USER",
        isVerified: true,
        preferredLanguage: "en",
        bio: author.bio,
        profileImageUrl: author.profileImageUrl,
        whatsAppNumber: author.whatsAppNumber,
        websiteUrl: author.websiteUrl,
        purchaseLinks: author.purchaseLinks,
        socialLinks: author.socialLinks,
        isProfileComplete: true,
      },
      create: {
        email: author.email,
        firstName: author.firstName,
        lastName: author.lastName,
        role: "USER",
        isVerified: true,
        preferredLanguage: "en",
        bio: author.bio,
        profileImageUrl: author.profileImageUrl,
        whatsAppNumber: author.whatsAppNumber,
        websiteUrl: author.websiteUrl,
        purchaseLinks: author.purchaseLinks,
        socialLinks: author.socialLinks,
        isProfileComplete: true,
      },
      select: { id: true, email: true },
    });

    authorIdsByEmail.set(result.email, result.id);
    console.log(`  - Author profile: ${result.email}`);
  }

  return authorIdsByEmail;
}

async function seedEntries(
  authorIdsByEmail: Map<string, string>,
  categoryIdsBySlug: Map<string, string>
) {
  let totalSeeded = 0;

  for (const entry of entries) {
    const userId = authorIdsByEmail.get(entry.authorEmail);
    if (!userId) {
      throw new Error(`Missing author mapping for email "${entry.authorEmail}"`);
    }

    const categoryId = categoryIdsBySlug.get(entry.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category mapping for slug "${entry.categorySlug}"`);
    }

    const existing = await prisma.authorShowcase.findFirst({
      where: {
        userId,
        bookTitle: entry.bookTitle,
      },
      select: { id: true },
    });

    const data = {
      authorName: entry.authorName,
      bookTitle: entry.bookTitle,
      bookCoverUrl: entry.bookCoverUrl,
      aboutBook: entry.aboutBook,
      testimonial: entry.testimonial,
      categoryId,
      publishedYear: entry.publishedYear,
      publishedAt: entry.publishedAt,
      userId,
      isFeatured: entry.isFeatured,
      sortOrder: entry.sortOrder,
    };

    if (existing) {
      await prisma.authorShowcase.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await prisma.authorShowcase.create({ data });
    }

    totalSeeded += 1;
    console.log(`  - Showcase entry: ${entry.bookTitle}`);
  }

  console.log(`\n  - Total showcase entries upserted: ${totalSeeded}`);
}

async function summarizeSeedResult() {
  const activeCategories = await prisma.showcaseCategory.count({ where: { isActive: true } });
  const featuredEntries = await prisma.authorShowcase.count({ where: { isFeatured: true } });
  const totalEntries = await prisma.authorShowcase.count();

  console.log("\n✅ Showcase seed complete.");
  console.log(`  - Active categories: ${activeCategories}`);
  console.log(`  - Featured entries: ${featuredEntries}`);
  console.log(`  - Total entries: ${totalEntries}\n`);
}

async function main() {
  console.log("🌱 Seeding showcase data...\n");

  const categoryIdsBySlug = await seedCategories();
  const authorIdsByEmail = await seedAuthors();
  await seedEntries(authorIdsByEmail, categoryIdsBySlug);
  await summarizeSeedResult();
}

main()
  .catch((error: unknown) => {
    console.error("❌ Showcase seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
