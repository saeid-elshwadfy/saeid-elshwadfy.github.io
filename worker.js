
const DB_URL = "https://saeid-elshwadfy-default-rtdb.firebaseio.com";
const SITE_URL = "https://saeid-elshwadfy.github.io";
const SITE_NAME = "موقع الكاتب الروائي | سعيد الشوادفي";
const WORKER_URL = "https://tight-firefly-b99c.saeidelshwadfy.workers.dev";

const PAYMENT_PHONE = "01096227242";
const INSTAPAY = "saeidelshwadfy@instapay";
const DEFAULT_IMAGE = "https://res.cloudinary.com/uha8a6rd/image/upload/v1741551520/zilal-la-tanam-cover.jpg";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") {
        return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(SITE_NAME)}</title>
<meta name="description" content="موقع الكاتب الروائي سعيد الشوادفي: روايات وقصص ورسائل وشعر وخواطر ومواد أدبية.">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${WORKER_URL}/">
</head>
<body style="font-family:Tahoma,Arial;text-align:center;padding:50px;background:#1a0307;color:#fff">
<h1>${escapeHtml(SITE_NAME)}</h1>
<p>مرحباً بك في صفحات المشاركة الخاصة بالموقع.</p>
<a href="${SITE_URL}" style="color:#d4af37">زيارة الموقع الرئيسي</a>
</body></html>`, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff"
          }
        });
      }

      // صفحات مشاركة الفيديوهات والدورات والورش
      const mediaMatch = url.pathname.match(/^\/(video|course)\/([^/]+)\/?$/);

      if (mediaMatch) {
        const mediaType = mediaMatch[1];
        let mediaId;

        try {
          mediaId = decodeURIComponent(mediaMatch[2]).trim();
        } catch {
          return htmlError("رابط المحتوى غير صالح.", 400);
        }

        if (!mediaId) return htmlError("لم يتم تحديد المحتوى.", 400);

        const node = mediaType === "video" ? "videos" : "courses";
        const response = await fetch(
          `${DB_URL}/${node}/${encodeURIComponent(mediaId)}.json`
        );

        if (!response.ok) return htmlError("تعذر الوصول إلى المحتوى حالياً.", 503);

        const item = await response.json();
        if (!item || typeof item !== "object") {
          return htmlError("لم يتم العثور على المحتوى المطلوب.", 404);
        }

        const title = cleanText(item.title) || "محتوى أدبي";
        const description = cleanText(item.desc) ||
          (mediaType === "video"
            ? `شاهد ${title} على ${SITE_NAME}.`
            : `تعرّف على ${title} ضمن الدورات والورش في ${SITE_NAME}.`);

        const targetUrl = mediaType === "video"
          ? (validUrl(item.videoUrl) ? item.videoUrl : SITE_URL)
          : (validUrl(item.fileUrl) ? item.fileUrl
            : validUrl(item.videoUrl) ? item.videoUrl : SITE_URL);

        return renderMediaPage({
          mediaType,
          title,
          description,
          targetUrl,
          canonicalUrl: `${WORKER_URL}/${mediaType}/${encodeURIComponent(mediaId)}`,
          imageUrl: getMediaImage(item)
        });
      }

      // صفحة الكتاب: تقبل معرّف Firebase أو عنوان الكتاب
      const bookMatch = url.pathname.match(/^\/book\/(.+?)\/?$/);
      if (!bookMatch) {
        return htmlError("الرابط غير موجود.", 404);
      }

      let requestedBook;
      try {
        requestedBook = decodeURIComponent(bookMatch[1]).trim();
      } catch {
        return htmlError("رابط الكتاب غير صالح.", 400);
      }

      if (!requestedBook) return htmlError("لم يتم تحديد الكتاب.", 400);

      const booksResponse = await fetch(`${DB_URL}/books.json`);
      if (!booksResponse.ok) return htmlError("تعذر الوصول إلى بيانات الكتب حالياً.", 503);

      const books = await booksResponse.json();
      if (!books || typeof books !== "object") {
        return htmlError("لا توجد كتب متاحة حالياً.", 404);
      }

      const found = findBook(books, requestedBook);
      if (!found) return htmlError("لم يتم العثور على الكتاب المطلوب.", 404);

      const { id: bookId, book } = found;

      let siteContent = {};
      try {
        const siteResponse = await fetch(`${DB_URL}/siteContent.json`);
        if (siteResponse.ok) siteContent = (await siteResponse.json()) || {};
      } catch {
        siteContent = {};
      }

      const title = cleanText(book.title) || requestedBook;
      const author = cleanText(book.author) || "سعيد الشوادفي";
      const bookType = getBookType(book.category);
      const description = cleanText(book.desc) ||
        `اقرأ ${bookType} ${title} للكاتب ${author} على ${SITE_NAME}.`;

      const coverUrl = validUrl(book.coverUrl) ? book.coverUrl : DEFAULT_IMAGE;
      const logoUrl = validUrl(siteContent.logoImg) ? siteContent.logoImg : "";

      const digitalPrice = book.price !== undefined &&
        book.price !== null && book.price !== ""
          ? cleanText(String(book.price)) : "";

      const paperPrice = book.paperPrice !== undefined &&
        book.paperPrice !== null && book.paperPrice !== ""
          ? cleanText(String(book.paperPrice)) : "";

      const freePages = Array.isArray(book.freePages)
        ? book.freePages : [];

      // عنوان ثابت للكتاب: معرّف Firebase بدلاً من العنوان المتغير
      const canonicalUrl = `${WORKER_URL}/book/${encodeURIComponent(bookId)}`;

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
      return htmlError("حدث خطأ أثناء تحميل الصفحة. يرجى المحاولة لاحقاً.", 500);
    }
  }
};


/* ==================== البحث عن كتاب ==================== */

function findBook(books, requested) {
  if (!books || typeof books !== "object") return null;

  if (books[requested] && typeof books[requested] === "object") {
    return { id: requested, book: books[requested] };
  }

  const wanted = normalizeText(requested);
  if (!wanted) return null;

  for (const [id, book] of Object.entries(books)) {
    if (!book || typeof book !== "object") continue;
    if (normalizeText(book.title) === wanted) return { id, book };
  }

  for (const [id, book] of Object.entries(books)) {
    if (!book || typeof book !== "object") continue;
    const title = normalizeText(book.title);
    if (title && (title.includes(wanted) || wanted.includes(title))) {
      return { id, book };
    }
  }

  return null;
}


/* ==================== تصنيفات الكتب ==================== */

function getBookType(category) {
  const value = normalizeText(category);

  const types = {
    novel: "روايات",
    novels: "روايات",
    روايه: "روايات",
    روايات: "روايات",

    story: "قصص",
    stories: "قصص",
    قصه: "قصص",
    قصص: "قصص",

    poetry: "شعر وخواطر",
    thoughts: "شعر وخواطر",
    شعر: "شعر وخواطر",
    خواطر: "شعر وخواطر",
    "شعر خواطر": "شعر وخواطر",
    "شعر وخواطر": "شعر وخواطر",

    messages: "رسائل",
    letters: "رسائل",
    رسائل: "رسائل",

    other: "أخرى",
    اخرى: "أخرى",
    free: "كتب مجانية",
    "كتب مجانيه": "كتب مجانية"
  };

  return types[value] || cleanText(category) || "كتب";
}


/* ==================== صور الفيديوهات والدورات ==================== */

function getMediaImage(item) {
  const customImage = item?.thumbnailUrl || item?.thumbnail ||
    item?.imageUrl || item?.coverUrl || item?.image;

  if (validUrl(customImage)) return customImage;

  const videoUrl = String(item?.videoUrl || "");
  const cloudinaryImage = getCloudinaryVideoThumbnail(videoUrl);
  if (cloudinaryImage) return cloudinaryImage;

  const youtubeId = extractYouTubeId(videoUrl);
  if (youtubeId) return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

  return DEFAULT_IMAGE;
}

function getCloudinaryVideoThumbnail(value) {
  try {
    const url = new URL(String(value));
    if (!url.hostname.toLowerCase().endsWith("cloudinary.com")) return "";

    const marker = "/video/upload/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return "";

    const prefix = url.pathname.slice(0, index + marker.length);
    const parts = url.pathname.slice(index + marker.length).split("/").filter(Boolean);
    if (!parts.length) return "";

    const versionIndex = parts.findIndex(part => /^v\d+$/.test(part));
    let version = "";
    let publicParts = parts;

    if (versionIndex >= 0) {
      version = parts[versionIndex];
      publicParts = parts.slice(versionIndex + 1);
    }

    if (!publicParts.length) return "";

    const fileName = publicParts[publicParts.length - 1];
    const publicIdParts = publicParts.slice(0, -1);
    const imageName = fileName.replace(/\.[^.]+$/, "") + ".jpg";

    const output = ["so_0,w_1200,h_630,c_fill,q_auto,f_jpg"];
    if (version) output.push(version);
    output.push(...publicIdParts, imageName);

    return `${url.origin}${prefix}${output.join("/")}`;
  } catch {
    return "";
  }
}

function extractYouTubeId(value) {
  try {
    const url = new URL(String(value));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      const watchId = url.searchParams.get("v");
      if (watchId) return watchId;

      const parts = url.pathname.split("/").filter(Boolean);
      const index = parts.findIndex(part => ["embed", "shorts", "live"].includes(part));
      if (index >= 0) return parts[index + 1] || "";
    }
  } catch {}

  return "";
}


/* ==================== صفحة مشاركة الفيديو أو الدورة ==================== */

function renderMediaPage(data) {
  const { mediaType, title, description, targetUrl, canonicalUrl, imageUrl } = data;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeTarget = escapeHtml(targetUrl);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeImage = escapeHtml(validUrl(imageUrl) ? imageUrl : DEFAULT_IMAGE);
  const metaTitle = `${safeTitle} | ${escapeHtml(SITE_NAME)}`;
  const label = mediaType === "video" ? "مشاهدة الفيديو" : "فتح الدورة / الورشة";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${metaTitle}</title>
<meta name="description" content="${safeDescription}">
<meta name="author" content="سعيد الشوادفي">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${safeCanonical}">
<meta property="og:locale" content="ar_EG">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${metaTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:secure_url" content="${safeImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${safeTitle}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${metaTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a0307;color:#f8fafc;font-family:Tahoma,Arial,sans-serif;text-align:center;padding:20px}.box{width:min(700px,100%);padding:35px 25px;border:1px solid rgba(212,175,55,.4);border-radius:24px;background:#2d0a12;box-shadow:0 18px 45px #0008}h1{color:#d4af37;line-height:1.5}p{color:#cbd5e1;line-height:1.9}.btn{display:inline-block;margin-top:18px;padding:13px 24px;border-radius:28px;background:#d4af37;color:#fff;text-decoration:none;font-weight:bold}
</style>
</head>
<body><main class="box">
<div style="font-size:2rem">${mediaType === "video" ? "🎬" : "📚"}</div>
<h1>${safeTitle}</h1><p>${safeDescription}</p>
<p><strong>${escapeHtml(SITE_NAME)}</strong></p>
<a class="btn" href="${safeTarget}">${label}</a>
<p><a href="${SITE_URL}" style="color:#d4af37">العودة إلى الموقع الرئيسي</a></p>
</main></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}


/* ==================== صفحة الكتاب ==================== */

function renderBookPage(data) {
  const {
    bookId, title, author, bookType, description, coverUrl,
    canonicalUrl, logoUrl, digitalPrice, paperPrice, freePages
  } = data;

  const safeTitle = escapeHtml(title);
  const safeAuthor = escapeHtml(author);
  const safeType = escapeHtml(bookType);
  const safeDescription = escapeHtml(description);
  const safeCover = escapeHtml(coverUrl);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeLogo = escapeHtml(logoUrl);
  const metaTitle = `${bookType} ${title} | ${SITE_NAME}`;
  const metaDescription = `اقرأ ${bookType} ${title} للكاتب ${author} مباشرة على ${SITE_NAME}. ${description}`.slice(0, 300);

  // حماية بيانات الصفحات قبل إدخالها داخل JavaScript.
  const pagesJson = JSON.stringify(Array.isArray(freePages) ? freePages : [])
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  const bookSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Book",
    name: title,
    author: { "@type": "Person", name: author },
    description,
    image: coverUrl,
    url: canonicalUrl,
    inLanguage: "ar"
  }).replace(/</g, "\\u003C");

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(metaTitle)}</title>
<meta name="description" content="${escapeHtml(metaDescription)}">
<meta name="author" content="${safeAuthor}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="googlebot" content="index,follow,max-image-preview:large">
<meta name="content-language" content="ar-EG">
<link rel="canonical" href="${safeCanonical}">

<meta property="og:locale" content="ar_EG">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:type" content="book">
<meta property="og:title" content="${escapeHtml(metaTitle)}">
<meta property="og:description" content="${escapeHtml(metaDescription)}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeCover}">
<meta property="og:image:secure_url" content="${safeCover}">
<meta property="og:image:alt" content="غلاف ${safeTitle}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(metaTitle)}">
<meta name="twitter:description" content="${escapeHtml(metaDescription)}">
<meta name="twitter:image" content="${safeCover}">
<meta name="twitter:image:alt" content="غلاف ${safeTitle}">

<script type="application/ld+json">${bookSchema}</script>

<style>
:root{--bg:#1a0307;--card:#2d0a12;--accent:#d4af37;--muted:#cbd5e1;--border:rgba(212,175,55,.3);--input:#120205}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:radial-gradient(rgba(212,175,55,.12) .8px,transparent .8px);background-color:var(--bg);background-size:28px 28px;color:#f1f5f9;font-family:Tahoma,Arial,sans-serif;line-height:1.8;padding:18px 14px;min-height:100vh}
.container{max-width:1000px;margin:auto}
header{display:flex;justify-content:space-between;align-items:center;gap:15px;padding:14px 18px;background:rgba(45,10,18,.94);border:1px solid var(--border);border-radius:20px;margin-bottom:25px;box-shadow:0 12px 35px #0005}
.brand{display:flex;align-items:center;gap:12px;text-decoration:none;min-width:0}
.brand img,.brand-icon{width:48px;height:48px;object-fit:contain;border-radius:12px;border:1px solid var(--border);background:var(--input)}
.brand-icon{display:flex;align-items:center;justify-content:center;font-size:25px}
.brand-name{color:var(--accent);font-weight:800;font-size:1rem}
.nav-btn{padding:10px 17px;border-radius:25px;text-decoration:none;background:var(--input);border:1px solid var(--border);font-weight:bold;white-space:nowrap}
.book-hero{background:rgba(45,10,18,.94);border:1px solid var(--border);border-radius:28px;padding:32px;display:grid;grid-template-columns:280px 1fr;gap:35px;box-shadow:0 18px 45px #0008}
.book-cover{width:100%;aspect-ratio:14/20;overflow:hidden;border-radius:20px;border:1px solid var(--border);box-shadow:0 15px 35px #0008;background:var(--input)}
.book-cover img{width:100%;height:100%;display:block;object-fit:cover}
.book-info{display:flex;flex-direction:column;justify-content:center}
.eyebrow{color:var(--accent);font-size:.9rem;margin-bottom:7px;font-weight:bold}
h1{font-family:Georgia,"Times New Roman",serif;color:var(--accent);font-size:clamp(2rem,5vw,3.3rem);line-height:1.35;margin:0 0 7px}
.author{color:var(--accent);font-size:1.15rem;font-weight:bold;margin-bottom:17px}
.description{color:var(--muted);font-size:1.05rem;text-align:justify;margin-bottom:22px}
.buttons{display:flex;flex-wrap:wrap;gap:12px}
.btn{border:0;padding:13px 22px;border-radius:28px;font-family:inherit;font-weight:bold;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:.98rem}
.btn-primary{background:linear-gradient(135deg,#d4af37,#b8860b);color:#fff}
.btn-payment{background:linear-gradient(135deg,#d4af37,#25a85a);color:#fff}
.btn-secondary{background:var(--input);border:1px solid var(--border);color:#f1f5f9}
.prices{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
.price-card,.payment-card{background:var(--input);border:1px solid var(--border);border-radius:16px;padding:16px;text-align:center}
.price-title{color:var(--muted);font-size:.9rem}
.price-value{color:var(--accent);font-size:1.2rem;font-weight:800;margin-top:3px}
.section{margin-top:30px;background:rgba(45,10,18,.94);border:1px solid var(--border);border-radius:25px;padding:28px;box-shadow:0 15px 35px #0008}
.section h2{text-align:center;color:var(--accent);font-family:Georgia,serif;font-size:2rem;margin-top:0}
.section-subtitle{text-align:center;color:var(--muted);margin-top:-8px;margin-bottom:20px}
.payment-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
.payment-card h3{color:var(--accent);font-family:Georgia,serif;margin-top:0}
.payment-card p{color:var(--muted)}
.payment-number{color:var(--accent)!important;font-size:1.08rem;font-weight:800;direction:ltr;overflow-wrap:anywhere}
.reader-box{background:#22050b;border:1px solid var(--border);border-radius:20px;padding:30px;min-height:250px;font-family:Georgia,"Times New Roman",serif;font-size:1.3rem;line-height:2.2;color:#f8fafc;white-space:pre-wrap;text-align:justify;overflow-wrap:anywhere}
.reader-controls{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-top:18px}
#pageIndicator{color:var(--muted);font-weight:bold;text-align:center}
.share-note{margin-top:18px;padding:14px 18px;border-radius:16px;background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);color:var(--muted);text-align:center}
footer{text-align:center;color:var(--muted);padding:30px 10px 20px;margin-top:30px;border-top:1px solid var(--border)}
@media(max-width:720px){body{padding:10px}.book-hero{grid-template-columns:1fr;padding:22px;text-align:center}.book-cover{width:min(250px,100%);margin:auto}.description{text-align:right}.buttons{justify-content:center}.section{padding:20px 15px}.reader-controls{flex-direction:column}.reader-controls .btn{width:100%}.nav-btn{padding:9px 12px;font-size:.85rem}.brand-name{font-size:.9rem}}
</style>
</head>
<body>
<div class="container">
<header>
<a class="brand" href="${SITE_URL}">
${logoUrl ? `<img src="${safeLogo}" alt="${escapeHtml(SITE_NAME)}">` : `<div class="brand-icon">📚</div>`}
<span class="brand-name">${escapeHtml(SITE_NAME)}</span>
</a>
<a class="nav-btn" href="${SITE_URL}">🏠 الرئيسية</a>
</header>

<main>
<section class="book-hero">
<div class="book-cover"><img src="${safeCover}" alt="غلاف ${safeTitle}" loading="eager" fetchpriority="high"></div>
<div class="book-info">
<div class="eyebrow">📚 ${safeType} من المنصة الرسمية</div>
<h1>${safeTitle}</h1>
<div class="author">بقلم: ${safeAuthor}</div>
<p class="description">${safeDescription}</p>

${digitalPrice || paperPrice ? `<div class="prices">
${digitalPrice ? `<div class="price-card"><div class="price-title">النسخة الرقمية</div><div class="price-value">${escapeHtml(digitalPrice)}</div></div>` : ""}
${paperPrice ? `<div class="price-card"><div class="price-title">النسخة الورقية</div><div class="price-value">${escapeHtml(paperPrice)}</div></div>` : ""}
</div>` : ""}

<div class="buttons">
<button class="btn btn-primary" onclick="scrollToReader()">📖 قراءة</button>
<button class="btn btn-payment" onclick="scrollToPayment()">💳 وسائل الدفع</button>
</div>
</div>
</section>

<!-- وسائل الدفع تظهر في كل صفحة كتاب، حتى إذا لم يوجد سعر مسجل -->
<section class="section" id="paymentSection">
<h2>💳 وسائل الدفع</h2>
<p class="section-subtitle">اختر طريقة الدفع المناسبة لإتمام طلب النسخة الرقمية أو الورقية.</p>
<div class="payment-grid">
<div class="payment-card">
<h3>📱 المحافظ الإلكترونية</h3>
<p>فودافون كاش / أورنج كاش / اتصالات</p>
<p class="payment-number">${escapeHtml(PAYMENT_PHONE)}</p>
</div>
<div class="payment-card">
<h3>🏛️ InstaPay</h3>
<p>التحويل عبر تطبيق إنستا باي</p>
<p class="payment-number" style="direction:rtl">${escapeHtml(INSTAPAY)}</p>
<p class="payment-number">${escapeHtml(PAYMENT_PHONE)}</p>
</div>
<div class="payment-card">
<h3>💳 الدفع أونلاين</h3>
<p>فيزا / ماستركارد</p>
<p>الدفع المباشر عبر بوابة الدفع عند تفعيلها.</p>
</div>
</div>
</section>

<section class="section" id="readerSection">
<h2>📖 القراءة المباشرة</h2>
<p class="section-subtitle">اقرأ الصفحات المتاحة مباشرة من هنا.</p>
<div id="readerText" class="reader-box">جاري تحميل صفحات القراءة... ⏳</div>
<div class="reader-controls">
<button class="btn btn-secondary" id="prevBtn" onclick="changePage(-1)" disabled>⬅ السابقة</button>
<span id="pageIndicator">صفحة 1 من 1</span>
<button class="btn btn-secondary" id="nextBtn" onclick="changePage(1)" disabled>التالية ➡</button>
</div>
</section>

<div class="share-note">🔗 يمكنك مشاركة رابط هذه الصفحة مباشرة، وسيظهر عنوان الكتاب وغلافه في معاينة المشاركة.</div>
</main>

<footer>
<p>© جميع الحقوق محفوظة للكاتب سعيد الشوادفي</p>
<p>${safeTitle} — ${safeAuthor}</p>
</footer>
</div>

<script>
const realPages = ${pagesJson};
let currentPage = 0;

function updateContent() {
  const reader = document.getElementById("readerText");
  const indicator = document.getElementById("pageIndicator");
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");

  if (!Array.isArray(realPages) || realPages.length === 0) {
    reader.innerText = "عذراً، لا توجد صفحات متوفرة للقراءة المباشرة حالياً لهذا العمل.";
    indicator.innerText = "لا توجد صفحات متاحة";
    prev.disabled = true;
    next.disabled = true;
    return;
  }

  reader.innerText = String(realPages[currentPage] ?? "");
  indicator.innerText = "صفحة " + (currentPage + 1) + " من " + realPages.length;
  prev.disabled = currentPage === 0;
  next.disabled = currentPage === realPages.length - 1;
}

function changePage(direction) {
  if (!Array.isArray(realPages) || realPages.length === 0) return;
  const nextPage = currentPage + direction;
  if (nextPage >= 0 && nextPage < realPages.length) {
    currentPage = nextPage;
    updateContent();
    document.getElementById("readerSection").scrollIntoView({behavior:"smooth",block:"start"});
  }
}

function scrollToReader() {
  document.getElementById("readerSection").scrollIntoView({behavior:"smooth"});
}

function scrollToPayment() {
  document.getElementById("paymentSection").scrollIntoView({behavior:"smooth"});
}

window.changePage = changePage;
window.scrollToReader = scrollToReader;
window.scrollToPayment = scrollToPayment;
updateContent();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}


/* ==================== أدوات مساعدة ==================== */

function normalizeText(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function validUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlError(message, status = 404) {
  const safeMessage = escapeHtml(message);

  return new Response(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeMessage} | ${escapeHtml(SITE_NAME)}</title>
<meta name="robots" content="noindex,nofollow">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#120205;color:#f5f5f5;font-family:Tahoma,Arial,sans-serif;text-align:center;padding:20px}.box{max-width:650px;padding:35px;border:1px solid rgba(212,175,55,.35);border-radius:24px;background:#2d0a12}h1{color:#d4af37}a{display:inline-block;margin-top:20px;padding:12px 25px;border-radius:25px;background:#d4af37;color:#fff;text-decoration:none;font-weight:bold}
</style>
</head>
<body><div class="box"><h1>📚 ${safeMessage}</h1><a href="${SITE_URL}">🏠 العودة إلى الموقع الرئيسي</a></div></body>
</html>`, {
    status,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
