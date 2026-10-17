const DB_URL = "https://saeid-elshwadfy-default-rtdb.firebaseio.com";
const SITE_URL = "https://saeid-elshwadfy.github.io";
const SITE_NAME = "موقع الكاتب الروائي | سعيد الشوادفي";
const WORKER_URL = "https://tight-firefly-b99c.saeidelshwadfy.workers.dev";

// بيانات الدفع المستخدمة في صفحة ظلال لا تنام
const PAYMENT_PHONE = "01096227242";
const INSTAPAY = "saeidelshwadfy@instapay";

// صورة احتياطية في حالة عدم وجود غلاف للكتاب
const DEFAULT_IMAGE =
  "https://res.cloudinary.com/uha8a6rd/image/upload/v1741551520/zilal-la-tanam-cover.jpg";


export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      // الصفحة الرئيسية للـ Worker
      if (url.pathname === "/" || url.pathname === "") {
        return new Response(
          `
          <!DOCTYPE html>
          <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>${escapeHtml(SITE_NAME)}</title>
            <meta name="description" content="موقع الكاتب الروائي سعيد الشوادفي">
          </head>
          <body style="font-family:Arial;text-align:center;padding:60px">
            <h1>${escapeHtml(SITE_NAME)}</h1>
            <p>Worker يعمل بشكل صحيح.</p>
          </body>
          </html>
          `,
          {
            status: 200,
            headers: {
              "content-type": "text/html; charset=UTF-8",
              "cache-control": "public, max-age=300"
            }
          }
        );
      }

      // دعم روابط المشاركة للفيديوهات والدورات/الورش بالـ Firebase ID
      // مثال: /video/-OABC123 أو /course/-OABC123
      const mediaMatch = url.pathname.match(/^\/(video|course)\/([^/]+)\/?$/);

      if (mediaMatch) {
        const mediaType = mediaMatch[1];
        let mediaId = "";

        try {
          mediaId = decodeURIComponent(mediaMatch[2]).trim();
        } catch {
          mediaId = mediaMatch[2].trim();
        }

        if (!mediaId) {
          return htmlError("لم يتم تحديد معرف المحتوى.");
        }

        const dbNode = mediaType === "video" ? "videos" : "courses";
        const mediaResponse = await fetch(
          `${DB_URL}/${dbNode}/${encodeURIComponent(mediaId)}.json`
        );

        if (!mediaResponse.ok) {
          return htmlError("تعذر الوصول إلى بيانات المحتوى حالياً.", 503);
        }

        const item = await mediaResponse.json();

        if (!item || typeof item !== "object") {
          return htmlError("لم يتم العثور على المحتوى المطلوب.", 404);
        }

        const title = cleanText(item.title) || "محتوى من موقع الكاتب الروائي";
        const description =
          cleanText(item.desc) ||
          (mediaType === "video"
            ? `شاهد فيديو «${title}» على ${SITE_NAME}.`
            : `تصفح دورة/ورشة «${title}» على ${SITE_NAME}.`);

        const targetUrl =
          mediaType === "video"
            ? (validUrl(item.videoUrl) ? item.videoUrl : SITE_URL)
            : (validUrl(item.fileUrl)
                ? item.fileUrl
                : (validUrl(item.videoUrl) ? item.videoUrl : SITE_URL));

        const canonicalUrl =
          `${WORKER_URL}/${mediaType}/${encodeURIComponent(mediaId)}`;

        // صورة معاينة الفيديو/الورشة: لو Cloudinary نستخدم أول فريم تلقائيًا.
        const imageUrl = getMediaImage(item);

        return renderMediaPage({
          mediaId,
          mediaType,
          title,
          description,
          targetUrl,
          canonicalUrl,
          imageUrl
        });
      }

      // دعم /book/اسم-الكتاب
      const match = url.pathname.match(/^\/book\/(.+?)\/?$/);

      if (!match) {
        return new Response(
          "Worker is running. Use /book/BOOK-NAME",
          {
            status: 404,
            headers: {
              "content-type": "text/plain; charset=UTF-8"
            }
          }
        );
      }

      // فك ترميز اسم الكتاب
      let requestedBook = "";

      try {
        requestedBook = decodeURIComponent(match[1]).trim();
      } catch {
        requestedBook = match[1].trim();
      }

      if (!requestedBook) {
        return htmlError("لم يتم تحديد اسم الكتاب.");
      }

      // جلب الكتب من Firebase
      const booksResponse = await fetch(`${DB_URL}/books.json`);

      if (!booksResponse.ok) {
        return htmlError("تعذر الوصول إلى بيانات الكتب حالياً.", 503);
      }

      const books = await booksResponse.json();

      if (!books) {
        return htmlError("لا توجد كتب متاحة حالياً.", 404);
      }

      // البحث عن الكتاب
      const result = findBook(books, requestedBook);

      if (!result) {
        return htmlError(
          `لم يتم العثور على الكتاب: ${escapeHtml(requestedBook)}`,
          404
        );
      }

      const { id: bookId, book } = result;

      // جلب بيانات الموقع
      let siteContent = {};

      try {
        const siteResponse = await fetch(`${DB_URL}/siteContent.json`);

        if (siteResponse.ok) {
          siteContent = (await siteResponse.json()) || {};
        }
      } catch {
        siteContent = {};
      }

      // البيانات الأساسية
      const title = cleanText(book.title) || requestedBook;
      const author = cleanText(book.author) || "سعيد الشوادفي";

      // نوع العمل من Firebase
      const bookType = getBookType(book.category);

      const description =
        cleanText(book.desc) ||
        `اقرأ ${bookType} ${title} للكاتب ${author} مباشرة من المنصة الرسمية.`;

      const coverUrl =
        validUrl(book.coverUrl)
          ? book.coverUrl
          : DEFAULT_IMAGE;

      // رابط Canonical خاص بالكتاب
      const canonicalUrl =
        `${WORKER_URL}/book/${encodeURIComponent(title)}`;

      // الشعار
      const logoUrl =
        validUrl(siteContent.logoImg)
          ? siteContent.logoImg
          : "";

      // الأسعار
      const digitalPrice =
        book.price !== undefined &&
        book.price !== null &&
        book.price !== ""
          ? cleanText(String(book.price))
          : "";

      const paperPrice =
        book.paperPrice !== undefined &&
        book.paperPrice !== null &&
        book.paperPrice !== ""
          ? cleanText(String(book.paperPrice))
          : "";

      // الصفحات المجانية
      const freePages = Array.isArray(book.freePages)
        ? book.freePages
        : [];

      return renderBookPage({
        bookId,
        title,
        author,
        bookType,
        description,
        coverUrl,
        canonicalUrl,
        logoUrl,
        digitalPrice,
        paperPrice,
        freePages
      });

    } catch (error) {
      return htmlError(
        "حدث خطأ غير متوقع أثناء تحميل صفحة الكتاب.",
        500
      );
    }
  }
};


/* =========================================================
   البحث عن فيديو أو دورة/ورشة
========================================================= */

function findMediaItem(items, requested) {
  const wanted = normalizeText(requested);

  // 1 — البحث بالـ Firebase ID
  if (items[requested]) {
    return {
      id: requested,
      item: items[requested]
    };
  }

  // 2 — بحث مطابق بالعنوان
  for (const [id, item] of Object.entries(items)) {
    if (!item) continue;

    const title = normalizeText(item.title || "");

    if (title === wanted) {
      return {
        id,
        item
      };
    }
  }

  // 3 — بحث جزئي
  for (const [id, item] of Object.entries(items)) {
    if (!item) continue;

    const title = normalizeText(item.title || "");

    if (title.includes(wanted) || wanted.includes(title)) {
      return {
        id,
        item
      };
    }
  }

  return null;
}


/* =========================================================
   صورة معاينة الفيديو / الدورة
========================================================= */
function getMediaImage(item) {
  const customImage =
    item?.thumbnailUrl ||
    item?.thumbnail ||
    item?.imageUrl ||
    item?.coverUrl ||
    item?.image;

  if (validUrl(customImage)) return customImage;

  const videoUrl = String(item?.videoUrl || "");

  // فيديوهات Cloudinary: نحول أول إطار من الفيديو إلى صورة JPG
  // مناسبة لمعاينة Facebook / WhatsApp.
  const cloudinaryImage = getCloudinaryVideoThumbnail(videoUrl);
  if (cloudinaryImage) return cloudinaryImage;

  // دعم YouTube كخيار احتياطي إذا وُجد فيديو قديم عليه.
  const youtubeId = extractYouTubeId(videoUrl);
  if (youtubeId) {
    return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
  }

  return DEFAULT_IMAGE;
}

function getCloudinaryVideoThumbnail(value) {
  try {
    const url = new URL(String(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (!host.endsWith("cloudinary.com")) return "";

    const marker = "/video/upload/";
    const index = url.pathname.indexOf(marker);
    if (index === -1) return "";

    const prefix = url.pathname.slice(0, index + marker.length);
    const rest = url.pathname.slice(index + marker.length);
    const parts = rest.split("/").filter(Boolean);
    if (!parts.length) return "";

    // Cloudinary عادةً يضع رقم الإصدار v123... قبل public_id.
    // التحويل يجب أن يكون قبل رقم الإصدار.
    const versionIndex = parts.findIndex(part => /^v\d+$/.test(part));
    let version = "";
    let publicParts = parts.slice();

    if (versionIndex >= 0) {
      version = parts[versionIndex];
      publicParts = parts.slice(versionIndex + 1);
    }

    if (!publicParts.length) return "";

    // لو كان هناك تحويلات قديمة قبل الإصدار، نتجاوزها ونبني رابطاً نظيفاً.
    const fileName = publicParts[publicParts.length - 1];
    const publicIdParts = publicParts.slice(0, -1);
    const publicIdFile = fileName.replace(/\.[^.\/]+$/, ".jpg");

    const transformation = "so_0,w_1200,h_630,c_fill,q_auto,f_jpg";
    const finalParts = [transformation];
    if (version) finalParts.push(version);
    finalParts.push(...publicIdParts, publicIdFile);

    return `${url.origin}${prefix}${finalParts.join("/")}`;
  } catch {
    return "";
  }
}

function extractYouTubeId(value) {
  try {
    const url = new URL(String(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || "";
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const watchId = url.searchParams.get("v");
      if (watchId) return watchId;

      const parts = url.pathname.split("/").filter(Boolean);
      const markerIndex = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
      if (markerIndex >= 0 && parts[markerIndex + 1]) {
        return parts[markerIndex + 1];
      }
    }
  } catch {}

  return "";
}

/* =========================================================
   صفحة مشاركة الفيديو أو الدورة/الورشة
========================================================= */

function renderMediaPage(data) {
  const {
    mediaType,
    title,
    description,
    targetUrl,
    canonicalUrl,
    imageUrl
  } = data;

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeTarget = escapeHtml(targetUrl);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeImage = escapeHtml(validUrl(imageUrl) ? imageUrl : DEFAULT_IMAGE);

  const contentLabel =
    mediaType === "video" ? "فيديو" : "دورة / ورشة";

  const metaTitle =
    `${safeTitle} | ${escapeHtml(SITE_NAME)}`;

  return new Response(
    `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${metaTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta name="author" content="سعيد الشوادفي">
  <meta name="robots" content="index, follow, max-image-preview:large">

  <link rel="canonical" href="${safeCanonical}">

  <!-- Open Graph: نفس هوية صفحات الكتب -->
  <meta property="og:locale" content="ar_EG">
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${metaTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:image" content="${safeImage}">
  <meta property="og:image:secure_url" content="${safeImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${safeTitle}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${metaTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  <meta name="twitter:image" content="${safeImage}">

  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1a0307;
      color: #f8fafc;
      font-family: Tahoma, Arial, sans-serif;
      text-align: center;
      padding: 20px;
    }
    .box {
      width: min(700px, 100%);
      padding: 35px 25px;
      border: 1px solid rgba(212,175,55,.35);
      border-radius: 24px;
      background: #2d0a12;
      box-shadow: 0 18px 45px rgba(0,0,0,.45);
    }
    h1 { color: #d4af37; margin: 0 0 12px; }
    p { color: #cbd5e1; line-height: 1.9; }
    .btn {
      display: inline-block;
      margin-top: 18px;
      padding: 13px 24px;
      border-radius: 28px;
      background: #d4af37;
      color: #fff;
      text-decoration: none;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <main class="box">
    <div style="font-size:2rem;margin-bottom:10px;">
      ${mediaType === "video" ? "🎬" : "📚"}
    </div>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <p><strong>${escapeHtml(SITE_NAME)}</strong></p>
    <a class="btn" href="${safeTarget}">
      ${mediaType === "video" ? "▶️ مشاهدة الفيديو" : "📥 فتح ملف الدورة / الورشة"}
    </a>
  </main>
</body>
</html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "public, max-age=300, s-maxage=300",
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin"
      }
    }
  );
}


/* =========================================================
   البحث عن الكتاب
========================================================= */

function findBook(books, requested) {
  const wanted = normalizeText(requested);

  // 1 — البحث بالـ Firebase ID
  if (books[requested]) {
    return {
      id: requested,
      book: books[requested]
    };
  }

  // 2 — بحث مطابق بالعنوان
  for (const [id, book] of Object.entries(books)) {
    if (!book) continue;

    const title = normalizeText(book.title || "");

    if (title === wanted) {
      return {
        id,
        book
      };
    }
  }

  // 3 — بحث جزئي
  for (const [id, book] of Object.entries(books)) {
    if (!book) continue;

    const title = normalizeText(book.title || "");

    if (
      title.includes(wanted) ||
      wanted.includes(title)
    ) {
      return {
        id,
        book
      };
    }
  }

  return null;
}


/* =========================================================
   نوع الكتاب بالعربي
========================================================= */

function getBookType(category) {
  const value = normalizeText(category);

  const types = {
    novel: "رواية",
    story: "قصص",

    // الشعر والخواطر قسم واحد
    poetry: "شعر وخواطر",
    thoughts: "شعر وخواطر",

    // الرسائل
    messages: "رسائل",
    letters: "رسائل",

    other: "أخرى",
    free: "كتب مجانية"
  };

  return types[value] || cleanText(category) || "كتاب";
}


/* =========================================================
   توحيد النص العربي للبحث
========================================================= */

function normalizeText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    // إزالة التشكيل
    .replace(/[\u064B-\u065F\u0670]/g, "")
    // توحيد بعض الحروف العربية
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    // إزالة الإيموجي والرموز من عناوين الفيديوهات والدورات
    // حتى ينجح البحث حتى لو كان العنوان في Firebase يبدأ بـ 🎬 أو 📚 أو غيرهما.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================================================
   تنظيف النص
========================================================= */

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================================================
   التحقق من الرابط
========================================================= */

function validUrl(value) {
  try {
    const url = new URL(String(value));

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}


/* =========================================================
   حماية HTML
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   حماية JavaScript
========================================================= */

function escapeJs(value) {
  return JSON.stringify(String(value ?? ""))
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}


/* =========================================================
   صفحة الخطأ
========================================================= */

function htmlError(message, status = 404) {
  return new Response(
    `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">

      <title>${message} | ${escapeHtml(SITE_NAME)}</title>

      <meta name="robots" content="noindex">

      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #120205;
          color: #f5f5f5;
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 20px;
        }

        .box {
          max-width: 650px;
          padding: 40px;
          border: 1px solid rgba(212,175,55,.35);
          border-radius: 24px;
          background: #2d0a12;
        }

        h1 {
          color: #d4af37;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 12px 25px;
          border-radius: 25px;
          background: #d4af37;
          color: white;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h1>📚 ${message}</h1>
        <a href="${SITE_URL}">🏠 العودة إلى الرئيسية</a>
      </div>
    </body>
    </html>
    `,
    {
      status,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store"
      }
    }
  );
}


/* =========================================================
   إنشاء صفحة الكتاب
========================================================= */

function renderBookPage(data) {
  const {
    title,
    author,
    bookType,
    description,
    coverUrl,
    canonicalUrl,
    logoUrl,
    digitalPrice,
    paperPrice,
    freePages
  } = data;

  const safeTitle = escapeHtml(title);
  const safeAuthor = escapeHtml(author);
  const safeBookType = escapeHtml(bookType);
  const safeDescription = escapeHtml(description);
  const safeCover = escapeHtml(coverUrl);
  const safeCanonical = escapeHtml(canonicalUrl);

  // العنوان أصبح ديناميكياً حسب نوع العمل
  const titleMeta =
    `${bookType} ${title} | ${SITE_NAME}`;

  const metaDescription =
    `اقرأ ${bookType} ${title} للكاتب ${author} مباشرة. ${description}`;

  const safeTitleMeta = escapeHtml(titleMeta);

  const safeMetaDescription = escapeHtml(
    metaDescription.slice(0, 300)
  );

  const pagesJson = JSON.stringify(freePages)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E");

  const bookSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Book",
    "name": title,
    "author": {
      "@type": "Person",
      "name": author
    },
    "description": description,
    "image": coverUrl,
    "url": canonicalUrl,
    "inLanguage": "ar"
  }).replace(/</g, "\\u003C");

  return new Response(
`<!DOCTYPE html>
<html lang="ar" dir="rtl" data-theme="dark">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <!-- =========================
       SEO
  ========================== -->

  <title>${safeTitleMeta}</title>

  <meta
    name="description"
    content="${safeMetaDescription}"
  >

  <meta
    name="author"
    content="${safeAuthor}"
  >

  <meta
    name="robots"
    content="index, follow, max-image-preview:large"
  >

  <meta
    name="googlebot"
    content="index, follow, max-image-preview:large"
  >

  <link
    rel="canonical"
    href="${safeCanonical}"
  >

  <meta
    name="language"
    content="Arabic"
  >

  <meta
    name="content-language"
    content="ar-EG"
  >

  <!-- =========================
       Open Graph
  ========================== -->

  <meta
    property="og:locale"
    content="ar_EG"
  >

  <meta
    property="og:site_name"
    content="${escapeHtml(SITE_NAME)}"
  >

  <meta
    property="og:type"
    content="book"
  >

  <meta
    property="og:title"
    content="${safeTitleMeta}"
  >

  <meta
    property="og:description"
    content="${safeMetaDescription}"
  >

  <meta
    property="og:url"
    content="${safeCanonical}"
  >

  <meta
    property="og:image"
    content="${safeCover}"
  >

  <meta
    property="og:image:secure_url"
    content="${safeCover}"
  >

  <meta
    property="og:image:alt"
    content="غلاف ${safeTitle}"
  >

  <meta
    property="og:image:type"
    content="image/jpeg"
  >

  <meta
    property="og:image:width"
    content="1200"
  >

  <meta
    property="og:image:height"
    content="630"
  >

  <!-- =========================
       Twitter / X
  ========================== -->

  <meta
    name="twitter:card"
    content="summary_large_image"
  >

  <meta
    name="twitter:title"
    content="${safeTitleMeta}"
  >

  <meta
    name="twitter:description"
    content="${safeMetaDescription}"
  >

  <meta
    name="twitter:image"
    content="${safeCover}"
  >

  <meta
    name="twitter:image:alt"
    content="غلاف ${safeTitle}"
  >

  <!-- =========================
       Schema.org Book
  ========================== -->

  <script type="application/ld+json">
  ${bookSchema}
  </script>

  <style>

    :root {
      --bg-color: #1a0307;
      --bg-pattern:
        radial-gradient(
          rgba(212,175,55,.15) .8px,
          transparent .8px
        );

      --card-bg: rgba(45,10,18,.88);
      --accent-color: #d4af37;
      --accent-glow: rgba(212,175,55,.35);

      --text-color: #f1f5f9;
      --text-muted: #cbd5e1;

      --border-color:
        rgba(212,175,55,.28);

      --input-bg: #120205;
      --reader-bg: #22050b;
      --reader-text: #f8fafc;

      --shadow-color:
        rgba(0,0,0,.7);
    }

    * {
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      background-color: var(--bg-color);
      background-image: var(--bg-pattern);
      background-size: 28px 28px;
      color: var(--text-color);
      font-family: Tahoma, Arial, sans-serif;
      line-height: 1.8;
      padding: 18px 14px;
      min-height: 100vh;
    }

    a {
      color: inherit;
    }

    .container {
      max-width: 1000px;
      margin: auto;
    }

    /* ================= HEADER ================= */

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;

      padding: 14px 18px;

      background: var(--card-bg);

      border:
        1px solid var(--border-color);

      border-radius: 20px;

      margin-bottom: 25px;

      box-shadow:
        0 12px 35px rgba(0,0,0,.35);

      backdrop-filter: blur(12px);

      position: sticky;
      top: 10px;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      min-width: 0;
    }

    .brand img {
      width: 48px;
      height: 48px;
      object-fit: contain;
      border-radius: 12px;
      border: 1px solid var(--border-color);
      background: #120205;
    }

    .brand-icon {
      width: 48px;
      height: 48px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 12px;

      background: #120205;

      border:
        1px solid var(--border-color);

      font-size: 25px;
    }

    .brand-name {
      color: var(--accent-color);
      font-weight: 800;
      font-size: 1.05rem;
    }

    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;

      padding: 10px 17px;

      border-radius: 25px;

      text-decoration: none;

      background: var(--input-bg);

      border:
        1px solid var(--border-color);

      font-weight: bold;
      white-space: nowrap;
    }

    .nav-btn:hover {
      transform: translateY(-2px);
      border-color: var(--accent-color);
    }

    /* ================= HERO ================= */

    .book-hero {
      background: var(--card-bg);

      border:
        1px solid var(--border-color);

      border-radius: 28px;

      padding: 32px;

      display: grid;

      grid-template-columns:
        280px 1fr;

      gap: 35px;

      box-shadow:
        0 18px 45px var(--shadow-color);

      backdrop-filter: blur(12px);
    }

    .book-cover {
      width: 100%;

      aspect-ratio: 14 / 20;

      overflow: hidden;

      border-radius: 20px;

      border:
        1px solid var(--border-color);

      box-shadow:
        0 15px 35px rgba(0,0,0,.55);

      background: #120205;
    }

    .book-cover img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .book-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .eyebrow {
      display: inline-block;

      color: var(--accent-color);

      font-size: .9rem;

      margin-bottom: 7px;

      font-weight: bold;
    }

    h1 {
      font-family: Georgia, "Times New Roman", serif;

      color: var(--accent-color);

      font-size:
        clamp(2rem, 5vw, 3.3rem);

      line-height: 1.25;

      margin: 0 0 7px;
    }

    .author {
      color: var(--accent-color);

      font-size: 1.15rem;

      font-weight: bold;

      margin-bottom: 17px;
    }

    .description {
      color: var(--text-muted);

      font-size: 1.08rem;

      text-align: justify;

      margin-bottom: 22px;
    }

    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn {
      border: 0;

      padding: 13px 22px;

      border-radius: 28px;

      font-family: inherit;

      font-weight: bold;

      text-decoration: none;

      cursor: pointer;

      display: inline-flex;

      align-items: center;

      justify-content: center;

      gap: 8px;

      font-size: .98rem;
    }

    .btn-primary {
      background:
        linear-gradient(
          135deg,
          #d4af37,
          #b8860b
        );

      color: white;

      box-shadow:
        0 8px 20px
        rgba(212,175,55,.22);
    }

    .btn-payment {
      background:
        linear-gradient(
          135deg,
          #d4af37,
          #25d366
        );

      color: white;
    }

    .btn-secondary {
      background: var(--input-bg);

      border:
        1px solid var(--border-color);

      color: var(--text-color);
    }

    .btn:hover {
      transform: translateY(-2px);
    }

    /* ================= PRICE ================= */

    .prices {
      display: grid;

      grid-template-columns:
        repeat(auto-fit,minmax(180px,1fr));

      gap: 12px;

      margin: 18px 0;
    }

    .price-card {
      background: var(--input-bg);

      border:
        1px solid var(--border-color);

      border-radius: 16px;

      padding: 14px;

      text-align: center;
    }

    .price-title {
      color: var(--text-muted);
      font-size: .9rem;
    }

    .price-value {
      color: var(--accent-color);

      font-size: 1.2rem;

      font-weight: 800;

      margin-top: 3px;
    }

    /* ================= SECTIONS ================= */

    .section {
      margin-top: 30px;

      background: var(--card-bg);

      border:
        1px solid var(--border-color);

      border-radius: 25px;

      padding: 28px;

      box-shadow:
        0 15px 35px var(--shadow-color);
    }

    .section h2 {
      text-align: center;

      color: var(--accent-color);

      font-family: Georgia, serif;

      font-size: 2rem;

      margin-top: 0;
    }

    .section-subtitle {
      text-align: center;

      color: var(--text-muted);

      margin-top: -8px;

      margin-bottom: 20px;
    }

    /* ================= PAYMENT ================= */

    .payment-grid {
      display: grid;

      grid-template-columns:
        repeat(auto-fit,minmax(220px,1fr));

      gap: 18px;
    }

    .payment-card {
      background: var(--input-bg);

      border:
        1px solid var(--border-color);

      border-radius: 18px;

      padding: 20px;

      text-align: center;
    }

    .payment-card h3 {
      color: var(--accent-color);

      font-family: Georgia, serif;

      margin-top: 0;
    }

    .payment-card p {
      color: var(--text-muted);
    }

    .payment-number {
      color: var(--accent-color) !important;

      font-size: 1.08rem;

      font-weight: 800;

      direction: ltr;
    }

    /* ================= READER ================= */

    .reader-box {
      background: var(--reader-bg);

      border:
        1px solid var(--border-color);

      border-radius: 20px;

      padding: 30px;

      min-height: 350px;

      font-family: Georgia, "Times New Roman", serif;

      font-size: 1.35rem;

      line-height: 2.2;

      color: var(--reader-text);

      white-space: pre-wrap;

      text-align: justify;
    }

    .reader-controls {
      display: flex;

      justify-content: space-between;

      align-items: center;

      gap: 15px;

      margin-top: 18px;
    }

    #pageIndicator {
      color: var(--text-muted);

      font-weight: bold;

      text-align: center;
    }

    /* ================= SHARE NOTE ================= */

    .share-note {
      margin-top: 18px;

      padding: 14px 18px;

      border-radius: 16px;

      background:
        rgba(212,175,55,.08);

      border:
        1px solid
        rgba(212,175,55,.18);

      color: var(--text-muted);

      text-align: center;
    }

    /* ================= FOOTER ================= */

    footer {
      text-align: center;

      color: var(--text-muted);

      padding: 35px 10px 20px;

      margin-top: 30px;

      border-top:
        1px solid var(--border-color);
    }

    /* ================= MOBILE ================= */

    @media (max-width: 720px) {

      body {
        padding: 10px;
      }

      header {
        position: relative;
        top: auto;
      }

      .brand-name {
        font-size: .9rem;
      }

      .book-hero {
        grid-template-columns: 1fr;

        padding: 22px;

        text-align: center;
      }

      .book-cover {
        width: min(250px,100%);

        margin: auto;
      }

      .description {
        text-align: right;
      }

      .buttons {
        justify-content: center;
      }

      .section {
        padding: 20px 15px;
      }

      .reader-controls {
        flex-direction: column;
      }

      .reader-controls .btn {
        width: 100%;
      }

      .nav-btn {
        padding: 9px 12px;
        font-size: .85rem;
      }
    }

  </style>

</head>

<body>

<div class="container">

  <!-- ================= HEADER ================= -->

  <header>

    <a
      class="brand"
      href="${SITE_URL}"
    >

      ${
        logoUrl
          ? `
            <img
              src="${escapeHtml(logoUrl)}"
              alt="${escapeHtml(SITE_NAME)}"
            >
          `
          : `
            <div class="brand-icon">📚</div>
          `
      }

      <span class="brand-name">
        ${escapeHtml(SITE_NAME)}
      </span>

    </a>

    <a
      class="nav-btn"
      href="${SITE_URL}"
    >
      🏠 الرئيسية
    </a>

  </header>


  <!-- ================= BOOK ================= -->

  <main>

    <section class="book-hero">

      <div class="book-cover">

        <img
          src="${safeCover}"
          alt="غلاف ${safeTitle}"
          loading="eager"
          fetchpriority="high"
        >

      </div>


      <div class="book-info">

        <div class="eyebrow">
          📚 ${safeBookType} من المنصة الرسمية
        </div>

        <h1>
          ${safeTitle}
        </h1>

        <div class="author">
          بقلم: ${safeAuthor}
        </div>

        <p class="description">
          ${safeDescription}
        </p>

        ${
          digitalPrice || paperPrice
            ? `
              <div class="prices">

                ${
                  digitalPrice
                    ? `
                      <div class="price-card">
                        <div class="price-title">
                          النسخة الرقمية
                        </div>

                        <div class="price-value">
                          ${escapeHtml(digitalPrice)}
                        </div>
                      </div>
                    `
                    : ""
                }

                ${
                  paperPrice
                    ? `
                      <div class="price-card">
                        <div class="price-title">
                          النسخة الورقية
                        </div>

                        <div class="price-value">
                          ${escapeHtml(paperPrice)}
                        </div>
                      </div>
                    `
                    : ""
                }

              </div>
            `
            : ""
        }


        <div class="buttons">

          <button
            class="btn btn-primary"
            onclick="scrollToReader()"
          >
            📖 قراءة
          </button>

          <button
            class="btn btn-payment"
            onclick="scrollToPayment()"
          >
            💳 وسائل الدفع
          </button>

        </div>

      </div>

    </section>


    <!-- ================= PAYMENT ================= -->

    <section
      class="section"
      id="paymentSection"
    >

      <h2>
        💳 وسائل الدفع
      </h2>

      <p class="section-subtitle">
        اختر طريقة الدفع المناسبة لإتمام طلب النسخة الرقمية أو الورقية.
      </p>


      <div class="payment-grid">

        <div class="payment-card">

          <h3>
            📱 المحافظ الإلكترونية
          </h3>

          <p>
            فودافون كاش / أورنج كاش / اتصالات
          </p>

          <p class="payment-number">
            ${escapeHtml(PAYMENT_PHONE)}
          </p>

        </div>


        <div class="payment-card">

          <h3>
            🏛️ InstaPay
          </h3>

          <p>
            التحويل عبر تطبيق إنستا باي
          </p>

          <p
            class="payment-number"
            style="direction:rtl"
          >
            ${escapeHtml(INSTAPAY)}
          </p>

          <p class="payment-number">
            ${escapeHtml(PAYMENT_PHONE)}
          </p>

        </div>


        <div class="payment-card">

          <h3>
            💳 الدفع أونلاين
          </h3>

          <p>
            فيزا / ماستركارد
          </p>

          <p>
            الدفع المباشر عبر البوابة قريباً
          </p>

        </div>

      </div>

    </section>


    <!-- ================= READER ================= -->

    <section
      class="section"
      id="readerSection"
    >

      <h2>
        📖 القراءة المباشرة
      </h2>

      <p class="section-subtitle">
        اقرأ الصفحات المتاحة مباشرة من هنا.
      </p>


      <div
        id="readerText"
        class="reader-box"
      >
        جاري تحميل صفحات القراءة... ⏳
      </div>


      <div class="reader-controls">

        <button
          class="btn btn-secondary"
          id="prevBtn"
          onclick="changePage(-1)"
          disabled
        >
          ⬅ السابقة
        </button>


        <span id="pageIndicator">
          صفحة 1 من 1
        </span>


        <button
          class="btn btn-secondary"
          id="nextBtn"
          onclick="changePage(1)"
          disabled
        >
          التالية ➡
        </button>

      </div>

    </section>


    <div class="share-note">

      🔗 يمكنك مشاركة رابط هذه الصفحة مباشرة،
      وسيظهر عنوان الكتاب وغلافه في معاينة المشاركة.

    </div>

  </main>


  <footer>

    <p>
      © جميع الحقوق محفوظة للكاتب سعيد الشوادفي
    </p>

    <p>
      ${safeTitle} — ${safeAuthor}
    </p>

  </footer>

</div>


<script>

  // صفحات القراءة القادمة من Firebase
  const realPages = ${pagesJson};

  let currentPage = 0;


  function updateContent() {

    const reader =
      document.getElementById("readerText");

    const indicator =
      document.getElementById("pageIndicator");

    const prev =
      document.getElementById("prevBtn");

    const next =
      document.getElementById("nextBtn");


    if (!realPages || realPages.length === 0) {

      reader.innerText =
        "عذراً، لا توجد صفحات متوفرة للقراءة المباشرة حالياً لهذا العمل.";

      indicator.innerText =
        "لا توجد صفحات متاحة";

      prev.disabled = true;
      next.disabled = true;

      return;
    }


    reader.innerText =
      realPages[currentPage];


    indicator.innerText =
      \`صفحة \${currentPage + 1} من \${realPages.length}\`;


    prev.disabled =
      currentPage === 0;


    next.disabled =
      currentPage === realPages.length - 1;

  }


  function changePage(direction) {

    if (!realPages || realPages.length === 0) {
      return;
    }


    const nextPage =
      currentPage + direction;


    if (
      nextPage >= 0 &&
      nextPage < realPages.length
    ) {

      currentPage = nextPage;

      updateContent();

      document
        .getElementById("readerSection")
        .scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

    }

  }


  function scrollToReader() {

    document
      .getElementById("readerSection")
      .scrollIntoView({
        behavior: "smooth"
      });

  }


  function scrollToPayment() {

    document
      .getElementById("paymentSection")
      .scrollIntoView({
        behavior: "smooth"
      });

  }


  // متاح للـ onclick
  window.changePage = changePage;
  window.scrollToReader = scrollToReader;
  window.scrollToPayment = scrollToPayment;


  updateContent();

</script>


</body>
</html>`,
    {
      status: 200,

      headers: {
        "content-type":
          "text/html; charset=UTF-8",

        "cache-control":
          "public, max-age=300, s-maxage=300",

        "x-content-type-options":
          "nosniff",

        "referrer-policy":
          "strict-origin-when-cross-origin"
      }
    }
  );
}
