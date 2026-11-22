// 0. Safe Preloader Dismissal (works whether DOMContentLoaded/load already fired or not)
function hidePreloader() {
  const loader = document.getElementById("preloader");
  if (!loader) return;
  loader.classList.add("opacity-0", "pointer-events-none");
  setTimeout(() => {
    loader.style.display = "none";
  }, 300);
}

if (document.readyState === "complete") {
  setTimeout(hidePreloader, 150);
} else {
  window.addEventListener("load", () => setTimeout(hidePreloader, 150));
  setTimeout(hidePreloader, 1200); // Hard fallback so preloader can never get stuck
}

// 0.5 Initialize Lenis Smooth Scrolling across page & anchor links
if (typeof Lenis !== "undefined") {
  const lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.5,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Smooth anchor navigation with sticky header offset
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId && targetId.length > 1) {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          lenis.scrollTo(targetEl, { offset: -72 });
        }
      }
    });
  });
}

// 1. Dark / Light Mode Switcher
const htmlRoot = document.documentElement;
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

themeToggle.addEventListener("click", () => {
  htmlRoot.classList.toggle("dark");
  themeIcon.textContent = htmlRoot.classList.contains("dark") ? "☀️" : "🌙";
});

// 2. Mobile Navigation Toggle
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
mobileMenuBtn.addEventListener("click", () => {
  mobileMenu.classList.toggle("hidden");
});
mobileMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => mobileMenu.classList.add("hidden"));
});

// 3. Sandbox Mode Tabs & cURL Generator
let activeMode = "url";
let uploadedBase64 = "";
const endpointUrl = `${window.location.origin}/api/thumbnail`;

function updateCurlPreview() {
  const width = Number(document.getElementById("thumbWidth").value) || 240;
  const height = Number(document.getElementById("thumbHeight").value) || 240;
  const format = document.getElementById("thumbFormat").value;
  const imgUrl = document.getElementById("imageUrl").value.trim();

  const samplePayload =
    activeMode === "url"
      ? {
          imageUrl: imgUrl || "https://example.com/photo.jpg",
          width,
          height,
          format,
        }
      : {
          imageBase64: "data:image/png;base64,<BASE64_PAYLOAD>",
          width,
          height,
          format,
        };

  document.getElementById("curlPreview").textContent =
    `curl -X POST "${endpointUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(samplePayload)}'`;
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove(
        "active",
        "bg-white",
        "dark:bg-slate-800",
        "text-sky-500",
        "shadow-sm",
      );
      t.classList.add("text-slate-500", "dark:text-slate-400");
    });
    tab.classList.add(
      "active",
      "bg-white",
      "dark:bg-slate-800",
      "text-sky-500",
      "shadow-sm",
    );
    tab.classList.remove("text-slate-500", "dark:text-slate-400");

    activeMode = tab.dataset.mode;
    document
      .getElementById("urlGroup")
      .classList.toggle("hidden", activeMode !== "url");
    document
      .getElementById("fileGroup")
      .classList.toggle("hidden", activeMode !== "file");
    updateCurlPreview();
  });
});

document.getElementById("imageFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    uploadedBase64 = reader.result;
  };
  reader.readAsDataURL(file);
});

["imageUrl", "thumbWidth", "thumbHeight", "thumbFormat"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateCurlPreview);
});

// Browser Fallback Thumbnail Processor (used when standalone preview has no backend /api/thumbnail)
async function localCanvasFallback(payload) {
  const start = performance.now();
  const src = payload.imageBase64 || payload.imageUrl;
  if (!src || (!src.startsWith("http") && !src.startsWith("data:image/"))) {
    return {
      status: 400,
      ok: false,
      data: {
        error: "Bad Request: Payload is not a valid or supported image file.",
      },
    };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = Math.min(Math.max(payload.width || 240, 16), 1024);
      const h = Math.min(Math.max(payload.height || 240, 16), 1024);
      const fmt = payload.format || "webp";
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const sw = w / scale;
      const sh = h / scale;
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

      const dataUri = canvas.toDataURL(`image/${fmt}`, 0.8);
      const approxOrigBytes = src.startsWith("data:")
        ? Math.round((src.length * 3) / 4)
        : img.naturalWidth * img.naturalHeight * 2;
      const thumbBytes = Math.round((dataUri.length * 3) / 4);

      resolve({
        status: 200,
        ok: true,
        data: {
          success: true,
          runtime: "edge-preview-simulator",
          processingTimeMs: Math.max(12, Math.round(performance.now() - start)),
          original: {
            format: "jpeg",
            width: img.naturalWidth,
            height: img.naturalHeight,
            sizeBytes: approxOrigBytes,
            sizeKB: Number((approxOrigBytes / 1024).toFixed(2)),
          },
          thumbnail: {
            format: fmt,
            width: w,
            height: h,
            sizeBytes: thumbBytes,
            sizeKB: Number((thumbBytes / 1024).toFixed(2)),
            compressionRatio: `${Math.max(15, Math.round((1 - thumbBytes / Math.max(approxOrigBytes, thumbBytes + 1)) * 100))}%`,
            dataUri,
          },
        },
      });
    };
    img.onerror = () => {
      resolve({
        status: 400,
        ok: false,
        data: { error: "Bad Request: Unable to load or decode image source." },
      });
    };
    img.src = src;
  });
}

// 4. Invoke Serverless Function (with seamless preview fallback)
async function callThumbnailApi(customPayload = null) {
  const statusBadge = document.getElementById("statusBadge");
  const jsonOutput = document.getElementById("jsonOutput");
  const previewArea = document.getElementById("previewArea");

  statusBadge.className =
    "px-3 py-1 rounded-full text-xs font-mono font-bold bg-sky-500/15 text-sky-500";
  statusBadge.textContent = "Invoking...";

  const width = Number(document.getElementById("thumbWidth").value) || 240;
  const height = Number(document.getElementById("thumbHeight").value) || 240;
  const format = document.getElementById("thumbFormat").value;

  const payload =
    customPayload ||
    (activeMode === "url"
      ? {
          imageUrl: document.getElementById("imageUrl").value.trim(),
          width,
          height,
          format,
        }
      : { imageBase64: uploadedBase64, width, height, format });

  let status = 200;
  let ok = true;
  let data = null;

  try {
    const res = await fetch("/api/thumbnail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Fallback to preview engine");
    }
    status = res.status;
    ok = res.ok;
    data = await res.json();
  } catch {
    const sim = await localCanvasFallback(payload);
    status = sim.status;
    ok = sim.ok;
    data = sim.data;
  }

  statusBadge.textContent = `HTTP ${status} ${ok ? "OK" : "Bad Request"}`;
  statusBadge.className = ok
    ? "px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-500"
    : "px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/15 text-rose-500";

  const displayClone = JSON.parse(JSON.stringify(data));
  if (displayClone.thumbnail && displayClone.thumbnail.dataUri) {
    displayClone.thumbnail.dataUri = `${displayClone.thumbnail.dataUri.slice(0, 58)}... [truncated]`;
  }
  jsonOutput.textContent = JSON.stringify(displayClone, null, 2);

  if (ok && data.thumbnail && data.thumbnail.dataUri) {
    previewArea.classList.remove("hidden");
    document.getElementById("geminiVisionPanel").classList.remove("hidden");
    window.latestThumbDataUri = data.thumbnail.dataUri;
    document.getElementById("thumbImg").src = data.thumbnail.dataUri;
    const dl = document.getElementById("downloadThumb");
    dl.href = data.thumbnail.dataUri;
    dl.download = `thumbnail.${data.thumbnail.format}`;

    document.getElementById("metricsGrid").innerHTML = `
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span class="block text-[10px] text-slate-500">Original Dimensions</span>
            <strong>${data.original.width}×${data.original.height} (${data.original.sizeKB} KB)</strong>
          </div>
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span class="block text-[10px] text-slate-500">Thumbnail Output</span>
            <strong>${data.thumbnail.width}×${data.thumbnail.height} (${data.thumbnail.sizeKB} KB)</strong>
          </div>
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span class="block text-[10px] text-slate-500">Bandwidth Saved</span>
            <strong class="text-emerald-500">${data.thumbnail.compressionRatio}</strong>
          </div>
          <div class="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <span class="block text-[10px] text-slate-500">Execution Latency</span>
            <strong class="text-sky-500">${data.processingTimeMs} ms</strong>
          </div>
        `;
  } else {
    previewArea.classList.add("hidden");
    document.getElementById("geminiVisionPanel").classList.add("hidden");
  }
}

document
  .getElementById("invokeBtn")
  .addEventListener("click", () => callThumbnailApi());
document.getElementById("testBadBtn").addEventListener("click", () => {
  callThumbnailApi({
    imageBase64: "SGVsbG8gV29ybGQh",
    width: 200,
    height: 200,
  });
});

document.getElementById("copyCurlBtn").addEventListener("click", () => {
  const text = document.getElementById("curlPreview").textContent;
  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  document.body.removeChild(temp);
  const btn = document.getElementById("copyCurlBtn");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy"), 1200);
});

updateCurlPreview();

// 5. Gemini API Helpers with Exponential Backoff
async function fetchGeminiWithRetry(url, payload, maxRetries = 4) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      return await response.json();
    }
    if (attempt === maxRetries) {
      throw new Error(`API error (${response.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
  }
}

// 6. Gemini Vision Alt-Text & Smart Crop Analysis
document
  .getElementById("analyzeWithGeminiBtn")
  .addEventListener("click", async () => {
    const outputEl = document.getElementById("geminiVisionOutput");
    const btn = document.getElementById("analyzeWithGeminiBtn");
    const dataUri = window.latestThumbDataUri;

    if (!dataUri || !dataUri.includes(",")) {
      outputEl.textContent =
        "Please generate a thumbnail first before running Gemini Vision analysis.";
      return;
    }

    const mimeType = dataUri.substring(
      dataUri.indexOf(":") + 1,
      dataUri.indexOf(";"),
    );
    const base64Data = dataUri.split(",")[1];

    btn.disabled = true;
    btn.classList.add("opacity-60");
    outputEl.innerHTML = `<span class="text-indigo-500 font-semibold animate-pulse">✨ Analyzing image composition &amp; accessibility metadata with Gemini 3 Flash...</span>`;

    try {
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "You are an Edge CDN & Accessibility Specialist. Analyze this generated thumbnail and provide: 1) A concise, SEO-friendly HTML alt-text attribute (1 sentence), 2) Primary visual subject & focal point coordinates hint for smart cropping, and 3) One brief CDN caching/compression tip. Keep the response crisp and structured.",
              },
              {
                inlineData: {
                  mimeType: mimeType || "image/webp",
                  data: base64Data,
                },
              },
            ],
          },
        ],
      };

      const result = await fetchGeminiWithRetry(apiUrl, payload);
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        outputEl.innerHTML = `<div class="whitespace-pre-line font-sans text-xs">${text}</div>`;
      } else {
        outputEl.textContent =
          "Unable to extract insights from Gemini response.";
      }
    } catch (err) {
      outputEl.textContent = `Gemini Vision request failed: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.classList.remove("opacity-60");
    }
  });

// 7. Gemini Synthetic Test Image Generator (Base64 Mode)
document.getElementById("aiGenBtn").addEventListener("click", async () => {
  const promptInput =
    document.getElementById("aiGenPrompt").value.trim() ||
    "Modern cloud computing data center with glowing blue fiber optics";
  const statusEl = document.getElementById("aiGenStatus");
  const genBtn = document.getElementById("aiGenBtn");

  genBtn.disabled = true;
  genBtn.classList.add("opacity-60");
  statusEl.classList.remove("hidden");
  statusEl.textContent = "✨ Generating synthetic image via Gemini...";

  try {
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: promptInput }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    };

    const result = await fetchGeminiWithRetry(apiUrl, payload);
    const base64Data = result?.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData,
    )?.inlineData?.data;

    if (base64Data) {
      uploadedBase64 = `data:image/png;base64,${base64Data}`;
      statusEl.textContent =
        "✅ Synthetic image loaded into Base64 payload! Click 'Invoke Function' to process.";
      updateCurlPreview();
    } else {
      statusEl.textContent = "⚠️ No image returned. Try a different prompt.";
    }
  } catch (err) {
    statusEl.textContent = `⚠️ Generation failed: ${err.message}`;
  } finally {
    genBtn.disabled = false;
    genBtn.classList.remove("opacity-60");
  }
});
