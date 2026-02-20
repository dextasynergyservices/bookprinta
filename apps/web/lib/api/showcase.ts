import type {
  AuthorProfile,
  ShowcaseCategoriesResponse,
  ShowcaseEntry,
  ShowcaseFilters,
  ShowcaseResponse,
} from "@/types/showcase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url);
    if (res.ok) return res;
    return null;
  } catch {
    return null;
  }
}

export async function fetchShowcase(
  filters: ShowcaseFilters,
  cursor?: string
): Promise<ShowcaseResponse> {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.year) params.set("year", filters.year);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "6");

  const res = await tryFetch(`${API_BASE}/api/v1/showcase?${params.toString()}`);
  if (res) return res.json();

  return getMockShowcase(filters, cursor);
}

export async function fetchShowcaseCategories(): Promise<ShowcaseCategoriesResponse> {
  const res = await tryFetch(`${API_BASE}/api/v1/showcase/categories`);
  if (res) return res.json();

  return getMockCategories();
}

export async function fetchAuthorProfile(showcaseId: string): Promise<AuthorProfile> {
  const res = await tryFetch(`${API_BASE}/api/v1/showcase/${showcaseId}/author`);
  if (res) return res.json();

  return getMockAuthorProfile(showcaseId);
}

// ─── Mock data (used when NEXT_PUBLIC_API_URL is not set) ───

const MOCK_CATEGORIES = [
  { id: "cat-1", name: "Fiction", slug: "fiction", description: null, sortOrder: 0 },
  { id: "cat-2", name: "Non-Fiction", slug: "non-fiction", description: null, sortOrder: 1 },
  { id: "cat-3", name: "Poetry", slug: "poetry", description: null, sortOrder: 2 },
  { id: "cat-4", name: "Self-Help", slug: "self-help", description: null, sortOrder: 3 },
];

const MOCK_ENTRIES: ShowcaseEntry[] = [
  {
    id: "sc-1",
    authorName: "Chimamanda Adichie",
    bookTitle: "The Sunset Chronicles",
    bookCoverUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&h=600&fit=crop",
    aboutBook:
      "A sweeping tale of love and identity set across three generations of a Lagos family navigating tradition and modernity.",
    testimonial: "BookPrinta made publishing effortless.",
    categoryId: "cat-1",
    category: MOCK_CATEGORIES[0],
    publishedYear: 2025,
    publishedAt: "2025-06-15T00:00:00Z",
    userId: "user-1",
    isFeatured: true,
    isProfileComplete: true,
  },
  {
    id: "sc-2",
    authorName: "Wole Soyinka",
    bookTitle: "Echoes of Tomorrow",
    bookCoverUrl: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400&h=600&fit=crop",
    aboutBook: "Poetry collection exploring memory, loss, and the resilience of the human spirit.",
    testimonial: null,
    categoryId: "cat-3",
    category: MOCK_CATEGORIES[2],
    publishedYear: 2025,
    publishedAt: "2025-03-20T00:00:00Z",
    userId: "user-2",
    isFeatured: true,
    isProfileComplete: true,
  },
  {
    id: "sc-3",
    authorName: "Ngozi Okonkwo",
    bookTitle: "Building Wealth in Africa",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&h=600&fit=crop",
    aboutBook:
      "A practical guide to financial independence for young professionals across the African continent.",
    testimonial: "The quality exceeded my expectations.",
    categoryId: "cat-4",
    category: MOCK_CATEGORIES[3],
    publishedYear: 2024,
    publishedAt: "2024-11-10T00:00:00Z",
    userId: "user-3",
    isFeatured: false,
    isProfileComplete: true,
  },
  {
    id: "sc-4",
    authorName: "Adaeze Nwankwo",
    bookTitle: "Whispers in the Harmattan",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=400&h=600&fit=crop",
    aboutBook:
      "A captivating novel about a young woman's journey from a quiet village to the bustling streets of Abuja.",
    testimonial: null,
    categoryId: "cat-1",
    category: MOCK_CATEGORIES[0],
    publishedYear: 2024,
    publishedAt: "2024-08-05T00:00:00Z",
    userId: "user-4",
    isFeatured: true,
    isProfileComplete: false,
  },
  {
    id: "sc-5",
    authorName: "Emeka Obi",
    bookTitle: "The Art of Storytelling",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&h=600&fit=crop",
    aboutBook: "Master the craft of narrative with lessons drawn from African oral tradition.",
    testimonial: "A must-read for aspiring writers.",
    categoryId: "cat-2",
    category: MOCK_CATEGORIES[1],
    publishedYear: 2025,
    publishedAt: "2025-01-12T00:00:00Z",
    userId: "user-5",
    isFeatured: false,
    isProfileComplete: true,
  },
  {
    id: "sc-6",
    authorName: "Folake Johnson",
    bookTitle: "Lagos Nights",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1589998059171-988d887df646?w=400&h=600&fit=crop",
    aboutBook: "A gritty crime thriller set in the heart of Lagos, where nothing is as it seems.",
    testimonial: null,
    categoryId: "cat-1",
    category: MOCK_CATEGORIES[0],
    publishedYear: 2024,
    publishedAt: "2024-05-22T00:00:00Z",
    userId: "user-6",
    isFeatured: true,
    isProfileComplete: true,
  },
  {
    id: "sc-7",
    authorName: "Ibrahim Musa",
    bookTitle: "Desert Verses",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=400&h=600&fit=crop",
    aboutBook: "A meditative collection of poems inspired by the Sahel landscapes.",
    testimonial: "BookPrinta's formatting was flawless.",
    categoryId: "cat-3",
    category: MOCK_CATEGORIES[2],
    publishedYear: 2025,
    publishedAt: "2025-09-01T00:00:00Z",
    userId: "user-7",
    isFeatured: false,
    isProfileComplete: true,
  },
  {
    id: "sc-8",
    authorName: "Amina Bello",
    bookTitle: "Rise and Thrive",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400&h=600&fit=crop",
    aboutBook:
      "Strategies for women entrepreneurs in emerging markets to build sustainable businesses.",
    testimonial: null,
    categoryId: "cat-4",
    category: MOCK_CATEGORIES[3],
    publishedYear: 2025,
    publishedAt: "2025-04-18T00:00:00Z",
    userId: "user-8",
    isFeatured: true,
    isProfileComplete: true,
  },
  {
    id: "sc-9",
    authorName: "Tunde Akinola",
    bookTitle: "The Silent Revolution",
    bookCoverUrl:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=600&fit=crop",
    aboutBook:
      "An investigative non-fiction account of Nigeria's tech ecosystem and the founders reshaping it.",
    testimonial: "Professional from start to finish.",
    categoryId: "cat-2",
    category: MOCK_CATEGORIES[1],
    publishedYear: 2024,
    publishedAt: "2024-12-03T00:00:00Z",
    userId: "user-9",
    isFeatured: false,
    isProfileComplete: true,
  },
];

function getMockShowcase(filters: ShowcaseFilters, cursor?: string): ShowcaseResponse {
  let items = [...MOCK_ENTRIES];

  // Search filter
  if (filters.q) {
    const query = filters.q.toLowerCase();
    items = items.filter(
      (e) => e.bookTitle.toLowerCase().includes(query) || e.authorName.toLowerCase().includes(query)
    );
  }

  // Category filter
  if (filters.category) {
    items = items.filter((e) => e.category?.slug === filters.category);
  }

  // Year filter
  if (filters.year) {
    const year = Number(filters.year);
    items = items.filter((e) => e.publishedYear === year);
  }

  // Sort
  switch (filters.sort) {
    case "title_asc":
      items.sort((a, b) => a.bookTitle.localeCompare(b.bookTitle));
      break;
    case "title_desc":
      items.sort((a, b) => b.bookTitle.localeCompare(a.bookTitle));
      break;
    case "date_asc":
      items.sort(
        (a, b) => new Date(a.publishedAt || 0).getTime() - new Date(b.publishedAt || 0).getTime()
      );
      break;
    case "date_desc":
      items.sort(
        (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
      );
      break;
  }

  // Cursor-based pagination
  const limit = 6;
  let startIndex = 0;

  if (cursor) {
    const cursorIndex = items.findIndex((e) => e.id === cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const paginatedItems = items.slice(startIndex, startIndex + limit);
  const lastItem = paginatedItems[paginatedItems.length - 1];
  const hasMore = startIndex + limit < items.length;

  return {
    items: paginatedItems,
    nextCursor: hasMore && lastItem ? lastItem.id : null,
    hasMore,
  };
}

function getMockCategories(): ShowcaseCategoriesResponse {
  return { categories: MOCK_CATEGORIES };
}

function getMockAuthorProfile(_showcaseId: string): AuthorProfile {
  return {
    bio: "Award-winning author with a passion for storytelling that bridges cultures and generations. Published across multiple genres with a focus on the African experience.",
    profileImageUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
    whatsAppNumber: "+2348012345678",
    websiteUrl: "https://example.com",
    purchaseLinks: [
      { label: "Amazon", url: "https://amazon.com" },
      { label: "Okadabooks", url: "https://okadabooks.com" },
    ],
    socialLinks: [
      { platform: "Instagram", url: "https://instagram.com" },
      { platform: "Twitter/X", url: "https://x.com" },
    ],
  };
}
