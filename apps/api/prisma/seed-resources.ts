import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

interface ResourceCategorySeed {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

interface ResourcePostSeed {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  categorySlug: string;
  isPublished: boolean;
  publishedAt: Date | null;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const seedAuthor = {
  email: process.env.RESOURCES_SEED_AUTHOR_EMAIL ?? "resources.editor@bookprinta.com",
  firstName: "BookPrinta",
  lastName: "Editorial",
} as const;

const categories: ResourceCategorySeed[] = [
  {
    name: "Publishing Strategy",
    slug: "publishing-strategy",
    description: "Roadmaps, positioning, and launch strategy for new and growing authors.",
    sortOrder: 0,
    isActive: true,
  },
  {
    name: "Manuscript Craft",
    slug: "manuscript-craft",
    description: "Editing and structure guidance for building manuscripts readers finish.",
    sortOrder: 1,
    isActive: true,
  },
  {
    name: "Print Operations",
    slug: "print-operations",
    description: "Production and fulfillment best practices for consistent print quality.",
    sortOrder: 2,
    isActive: true,
  },
  {
    name: "Future Experiments",
    slug: "future-experiments",
    description: "Reserved for upcoming editorial experiments and reports.",
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

function buildArticleContent(title: string, focus: string): string {
  return `
<p>${focus}</p>
<h2>Why this matters</h2>
<p>When authors systematize this part of the workflow, launch quality goes up while revision costs go down.</p>
<h2>Practical checklist</h2>
<ul>
  <li>Define the desired reader outcome before production starts.</li>
  <li>Set one owner for decisions and one timeline for approvals.</li>
  <li>Review each milestone against quality standards before moving ahead.</li>
</ul>
<blockquote>${title} is most effective when your process is documented and repeatable.</blockquote>
<p>Use this framework as a living process document and improve it after every print cycle.</p>
`.trim();
}

const posts: ResourcePostSeed[] = [
  {
    title: "How to Position Your Manuscript for the Right Readers",
    slug: "position-your-manuscript-for-right-readers",
    excerpt:
      "A practical framework for defining audience, promise, and positioning before you print.",
    content: buildArticleContent(
      "How to Position Your Manuscript for the Right Readers",
      "Strong positioning begins long before typesetting. It starts with clarity on who the book is for and what transformation it promises."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "publishing-strategy",
    isPublished: true,
    publishedAt: daysAgo(2),
  },
  {
    title: "Building a 30-Day Book Launch Timeline",
    slug: "build-30-day-book-launch-timeline",
    excerpt: "Map launch milestones from final proof to release day without chaos.",
    content: buildArticleContent(
      "Building a 30-Day Book Launch Timeline",
      "A launch timeline prevents last-minute errors and keeps production, marketing, and fulfillment aligned."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1491841573634-28140fc7ced7?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "publishing-strategy",
    isPublished: true,
    publishedAt: daysAgo(5),
  },
  {
    title: "Pricing Your First Print Run in Nigeria",
    slug: "pricing-first-print-run-in-nigeria",
    excerpt: "Balance affordability, margin, and perceived value with a simple pricing model.",
    content: buildArticleContent(
      "Pricing Your First Print Run in Nigeria",
      "Pricing should reflect cost realities and reader perception, not guesswork."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "publishing-strategy",
    isPublished: true,
    publishedAt: daysAgo(9),
  },
  {
    title: "Editorial QA Before You Approve Print",
    slug: "editorial-qa-before-approving-print",
    excerpt: "The final checks that catch expensive mistakes before production starts.",
    content: buildArticleContent(
      "Editorial QA Before You Approve Print",
      "A final QA pass protects your credibility and reduces costly reprints."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "manuscript-craft",
    isPublished: true,
    publishedAt: daysAgo(12),
  },
  {
    title: "Structural Editing for Non-Fiction Authors",
    slug: "structural-editing-for-non-fiction-authors",
    excerpt: "Rebuild chapter flow so each section earns the reader's attention.",
    content: buildArticleContent(
      "Structural Editing for Non-Fiction Authors",
      "Structure determines whether readers stay with your argument from chapter one to the conclusion."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "manuscript-craft",
    isPublished: true,
    publishedAt: daysAgo(15),
  },
  {
    title: "Using Typography to Improve Long-Form Readability",
    slug: "typography-for-long-form-readability",
    excerpt: "How type scale, leading, and hierarchy shape the reading experience.",
    content: buildArticleContent(
      "Using Typography to Improve Long-Form Readability",
      "Readable type systems reduce fatigue and increase completion rates in long-form books."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "manuscript-craft",
    isPublished: true,
    publishedAt: daysAgo(19),
  },
  {
    title: "Checklist for Final Proof Copy Review",
    slug: "checklist-final-proof-copy-review",
    excerpt: "A repeatable proof-review process for editorial and print fidelity.",
    content: buildArticleContent(
      "Checklist for Final Proof Copy Review",
      "Proof review is your last control point before committing to full production."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1463320726281-696a485928c7?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "manuscript-craft",
    isPublished: true,
    publishedAt: daysAgo(23),
  },
  {
    title: "How to Scope Copy Quantity for First-Time Authors",
    slug: "scope-copy-quantity-first-time-authors",
    excerpt: "Choose print quantity with data-backed assumptions, not emotion.",
    content: buildArticleContent(
      "How to Scope Copy Quantity for First-Time Authors",
      "Right-sized quantity planning protects cash flow and lowers storage pressure."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "print-operations",
    isPublished: true,
    publishedAt: daysAgo(26),
  },
  {
    title: "Print Production Milestones Every Author Should Track",
    slug: "print-production-milestones-authors-should-track",
    excerpt: "Track quality, turnaround, and handoff checkpoints from prepress to dispatch.",
    content: buildArticleContent(
      "Print Production Milestones Every Author Should Track",
      "Milestone visibility helps teams resolve issues early and deliver predictably."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1474932430478-367dbb6832c1?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "print-operations",
    isPublished: true,
    publishedAt: daysAgo(31),
  },
  {
    title: "Reducing Delivery Failures on Last-Mile Orders",
    slug: "reducing-delivery-failures-last-mile-orders",
    excerpt: "Operational guardrails that improve successful delivery rates.",
    content: buildArticleContent(
      "Reducing Delivery Failures on Last-Mile Orders",
      "Reliable delivery performance builds trust and increases repeat orders."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "print-operations",
    isPublished: true,
    publishedAt: daysAgo(35),
  },
  {
    title: "Warehouse Handoff SOP for Small Print Teams",
    slug: "warehouse-handoff-sop-small-print-teams",
    excerpt: "Standardize handoff from print floor to fulfillment for fewer errors.",
    content: buildArticleContent(
      "Warehouse Handoff SOP for Small Print Teams",
      "A simple handoff SOP improves speed and reduces avoidable fulfillment mistakes."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1469085446848-9f5e5c4f6f20?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "print-operations",
    isPublished: true,
    publishedAt: daysAgo(40),
  },
  {
    title: "Post-Launch Reporting for Author Growth",
    slug: "post-launch-reporting-author-growth",
    excerpt: "Measure launch performance and turn insights into your next print strategy.",
    content: buildArticleContent(
      "Post-Launch Reporting for Author Growth",
      "Post-launch analysis transforms one campaign into a compounding growth system."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "publishing-strategy",
    isPublished: true,
    publishedAt: daysAgo(44),
  },
  {
    title: "Internal Draft: 2026 Resources Roadmap",
    slug: "internal-draft-2026-resources-roadmap",
    excerpt: "Planning notes for the upcoming editorial roadmap.",
    content: buildArticleContent(
      "Internal Draft: 2026 Resources Roadmap",
      "This is a draft entry intended for internal workflow validation."
    ),
    coverImage:
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1600&q=80&fm=webp",
    categorySlug: "publishing-strategy",
    isPublished: false,
    publishedAt: null,
  },
];

async function ensureSeedAuthor() {
  const author = await prisma.user.upsert({
    where: { email: seedAuthor.email },
    update: {
      firstName: seedAuthor.firstName,
      lastName: seedAuthor.lastName,
      role: "ADMIN",
      isVerified: true,
    },
    create: {
      email: seedAuthor.email,
      firstName: seedAuthor.firstName,
      lastName: seedAuthor.lastName,
      role: "ADMIN",
      isVerified: true,
      preferredLanguage: "en",
    },
    select: { id: true, email: true },
  });

  console.log(`  - Seed author: ${author.email} (${author.id})`);
  return author.id;
}

async function seedCategories() {
  const bySlug = new Map<string, string>();

  for (const category of categories) {
    const result = await prisma.resourceCategory.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
      select: { id: true, slug: true, name: true },
    });

    bySlug.set(result.slug, result.id);
    console.log(`  - Category: ${result.name}`);
  }

  return bySlug;
}

async function seedPosts(authorId: string, categoryIdsBySlug: Map<string, string>) {
  let createdOrUpdated = 0;

  for (const post of posts) {
    const categoryId = categoryIdsBySlug.get(post.categorySlug);
    if (!categoryId) {
      throw new Error(`Missing category mapping for slug "${post.categorySlug}"`);
    }

    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        coverImage: post.coverImage,
        categoryId,
        authorId,
        isPublished: post.isPublished,
        publishedAt: post.isPublished ? (post.publishedAt ?? new Date()) : null,
      },
      create: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        coverImage: post.coverImage,
        categoryId,
        authorId,
        isPublished: post.isPublished,
        publishedAt: post.isPublished ? (post.publishedAt ?? new Date()) : null,
      },
    });

    createdOrUpdated += 1;
    console.log(`  - Post: ${post.title}`);
  }

  console.log(`\n  - Total posts upserted: ${createdOrUpdated}`);
}

async function summarizeSeedResult() {
  const [totalCategories, publishedPosts, totalPosts] = await Promise.all([
    prisma.resourceCategory.count({ where: { isActive: true } }),
    prisma.blogPost.count({ where: { isPublished: true, publishedAt: { not: null } } }),
    prisma.blogPost.count(),
  ]);

  console.log("\n✅ Resources seed complete.");
  console.log(`  - Active categories: ${totalCategories}`);
  console.log(`  - Published posts: ${publishedPosts}`);
  console.log(`  - Total posts: ${totalPosts}\n`);
}

async function main() {
  console.log("🌱 Seeding resources data...\n");
  const authorId = await ensureSeedAuthor();
  const categoryIdsBySlug = await seedCategories();
  await seedPosts(authorId, categoryIdsBySlug);
  await summarizeSeedResult();
}

main()
  .catch((error: unknown) => {
    console.error("❌ Resources seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
