jest.mock("next-intl/server", () => ({
  getTranslations: jest.fn(),
  setRequestLocale: jest.fn(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: () => null,
}));

jest.mock("@/lib/i18n/routing", () => ({
  routing: {
    defaultLocale: "en",
  },
}));

const { getTranslations } = require("next-intl/server") as {
  getTranslations: jest.Mock;
};

const { generateMetadata: generateTermsMetadata } =
  require("./terms/page") as typeof import("./terms/page");
const { generateMetadata: generatePrivacyMetadata } =
  require("./privacy/page") as typeof import("./privacy/page");

const MESSAGES = {
  en: {
    "legal.terms": {
      meta_title: "Terms & Conditions - BookPrinta",
      meta_description:
        "Review the terms that govern your use of BookPrinta's publishing, printing, payment, and order services.",
    },
    "legal.privacy": {
      meta_title: "Privacy Policy - BookPrinta",
      meta_description:
        "Learn what personal data BookPrinta collects, how it is used, and the choices you have regarding your information.",
    },
  },
  fr: {
    "legal.terms": {
      meta_title: "Conditions générales - BookPrinta",
      meta_description:
        "Consultez les conditions qui encadrent l'utilisation des services de publication, d'impression, de paiement et de commande de BookPrinta.",
    },
    "legal.privacy": {
      meta_title: "Politique de confidentialité - BookPrinta",
      meta_description:
        "Découvrez quelles données personnelles BookPrinta collecte, comment elles sont utilisées et quels choix vous avez concernant vos informations.",
    },
  },
  es: {
    "legal.terms": {
      meta_title: "Términos y condiciones - BookPrinta",
      meta_description:
        "Consulta los términos que regulan el uso de los servicios de publicación, impresión, pagos y pedidos de BookPrinta.",
    },
    "legal.privacy": {
      meta_title: "Política de privacidad - BookPrinta",
      meta_description:
        "Conoce qué datos personales recopila BookPrinta, cómo los utiliza y qué opciones tienes respecto a tu información.",
    },
  },
} as const;

beforeEach(() => {
  getTranslations.mockImplementation(
    async ({
      locale,
      namespace,
    }: {
      locale: keyof typeof MESSAGES;
      namespace: keyof (typeof MESSAGES)["en"];
    }) =>
      (key: keyof (typeof MESSAGES)["en"]["legal.terms"]) =>
        MESSAGES[locale][namespace][key]
  );
});

describe("Legal page metadata", () => {
  it.each([
    {
      locale: "en",
      path: "/terms",
      title: "Terms & Conditions - BookPrinta",
      description:
        "Review the terms that govern your use of BookPrinta's publishing, printing, payment, and order services.",
    },
    {
      locale: "fr",
      path: "/fr/terms",
      title: "Conditions générales - BookPrinta",
      description:
        "Consultez les conditions qui encadrent l'utilisation des services de publication, d'impression, de paiement et de commande de BookPrinta.",
    },
    {
      locale: "es",
      path: "/es/terms",
      title: "Términos y condiciones - BookPrinta",
      description:
        "Consulta los términos que regulan el uso de los servicios de publicación, impresión, pagos y pedidos de BookPrinta.",
    },
  ])("keeps terms metadata localized for $locale", async ({ locale, path, title, description }) => {
    const metadata = await generateTermsMetadata({
      params: Promise.resolve({ locale }),
    });

    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.alternates?.languages).toEqual({
      en: "/terms",
      fr: "/fr/terms",
      es: "/es/terms",
    });
    expect(metadata.openGraph).toMatchObject({
      title,
      description,
      url: path,
      type: "article",
    });
    expect(metadata.robots).toBeUndefined();
  });

  it.each([
    {
      locale: "en",
      path: "/privacy",
      title: "Privacy Policy - BookPrinta",
      description:
        "Learn what personal data BookPrinta collects, how it is used, and the choices you have regarding your information.",
    },
    {
      locale: "fr",
      path: "/fr/privacy",
      title: "Politique de confidentialité - BookPrinta",
      description:
        "Découvrez quelles données personnelles BookPrinta collecte, comment elles sont utilisées et quels choix vous avez concernant vos informations.",
    },
    {
      locale: "es",
      path: "/es/privacy",
      title: "Política de privacidad - BookPrinta",
      description:
        "Conoce qué datos personales recopila BookPrinta, cómo los utiliza y qué opciones tienes respecto a tu información.",
    },
  ])("keeps privacy metadata localized for $locale", async ({
    locale,
    path,
    title,
    description,
  }) => {
    const metadata = await generatePrivacyMetadata({
      params: Promise.resolve({ locale }),
    });

    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(description);
    expect(metadata.alternates?.canonical).toBe(path);
    expect(metadata.alternates?.languages).toEqual({
      en: "/privacy",
      fr: "/fr/privacy",
      es: "/es/privacy",
    });
    expect(metadata.openGraph).toMatchObject({
      title,
      description,
      url: path,
      type: "article",
    });
    expect(metadata.robots).toBeUndefined();
  });
});
