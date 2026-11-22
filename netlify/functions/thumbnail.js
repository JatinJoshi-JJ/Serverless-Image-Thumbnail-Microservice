const sharp = require("sharp");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async (event) => {
  // 1. Handle CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: ""
    };
  }

  // 2. Health / Documentation Check on GET without query params
  if (event.httpMethod === "GET" && (!event.queryStringParameters || !event.queryStringParameters.url)) {
    return jsonResponse(200, {
      service: "SnapScale Serverless Image Thumbnail Microservice",
      status: "healthy",
      usage: {
        POST: "/api/thumbnail with JSON body { imageUrl | imageBase64, width, height, format }",
        GET: "/api/thumbnail?url=<image_url>&width=200&height=200&format=webp"
      }
    });
  }

  try {
    let imageUrl = null;
    let imageBase64 = null;
    let width = 200;
    let height = 200;
    let format = "webp";

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      imageUrl = params.url;
      width = parseInt(params.width, 10) || 200;
      height = parseInt(params.height, 10) || 200;
      format = (params.format || "webp").toLowerCase();
    } else if (event.httpMethod === "POST") {
      if (!event.body) {
        return jsonResponse(400, { error: "Bad Request: Empty request body." });
      }
      let parsed;
      try {
        parsed = JSON.parse(event.body);
      } catch {
        return jsonResponse(400, { error: "Bad Request: Payload must be valid JSON." });
      }
      imageUrl = parsed.imageUrl;
      imageBase64 = parsed.imageBase64;
      width = parseInt(parsed.width, 10) || 200;
      height = parseInt(parsed.height, 10) || 200;
      format = (parsed.format || "webp").toLowerCase();
    } else {
      return jsonResponse(405, { error: "Method Not Allowed. Use GET or POST." });
    }

    // Clamp dimensions for safety & cold-start speed
    width = Math.min(Math.max(width, 16), 1024);
    height = Math.min(Math.max(height, 16), 1024);
    const allowedFormats = ["webp", "jpeg", "png"];
    if (!allowedFormats.includes(format)) {
      return jsonResponse(400, { error: "Bad Request: Supported formats are webp, jpeg, png." });
    }

    if (!imageUrl && !imageBase64) {
      return jsonResponse(400, {
        error: "Bad Request: Provide either 'imageUrl' or 'imageBase64' in the payload."
      });
    }

    // 3. Load Image Buffer from URL or Base64
    let inputBuffer;
    if (imageUrl) {
      let parsedUrl;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        return jsonResponse(400, { error: "Bad Request: Invalid imageUrl format." });
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return jsonResponse(400, { error: "Bad Request: Only HTTP/HTTPS image URLs are allowed." });
      }

      const fetchRes = await fetch(imageUrl);
      if (!fetchRes.ok) {
        return jsonResponse(400, {
          error: `Bad Request: Unable to fetch image from URL (HTTP ${fetchRes.status}).`
        });
      }

      const contentType = fetchRes.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        return jsonResponse(400, {
          error: `Bad Request: URL did not return an image (received ${contentType || "unknown"}).`
        });
      }

      const arrayBuf = await fetchRes.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuf);
    } else {
      // Strip Data URI prefix if present (e.g., data:image/png;base64,...)
      const base64Clean = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
      inputBuffer = Buffer.from(base64Clean, "base64");
    }

    if (!inputBuffer || inputBuffer.length === 0) {
      return jsonResponse(400, { error: "Bad Request: Image buffer is empty." });
    }

    // 4. Extract Original Metadata & Validate Image Integrity via Sharp
    let metadata;
    try {
      metadata = await sharp(inputBuffer).metadata();
    } catch {
      return jsonResponse(400, {
        error: "Bad Request: Payload is not a valid or supported image file."
      });
    }

    if (!metadata || !metadata.width || !metadata.height) {
      return jsonResponse(400, { error: "Bad Request: Unable to extract valid image dimensions." });
    }

    // 5. Generate Optimized Thumbnail
    const startTime = Date.now();
    const thumbnailBuffer = await sharp(inputBuffer)
      .resize(width, height, { fit: "cover", position: "center" })
      .toFormat(format, { quality: 80 })
      .toBuffer();

    const processingMs = Date.now() - startTime;
    const dataUri = `data:image/${format};base64,${thumbnailBuffer.toString("base64")}`;

    return jsonResponse(200, {
      success: true,
      processingTimeMs: processingMs,
      original: {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        sizeBytes: inputBuffer.length,
        sizeKB: Number((inputBuffer.length / 1024).toFixed(2))
      },
      thumbnail: {
        format,
        width,
        height,
        sizeBytes: thumbnailBuffer.length,
        sizeKB: Number((thumbnailBuffer.length / 1024).toFixed(2)),
        compressionRatio: `${Math.max(0, Math.round((1 - thumbnailBuffer.length / inputBuffer.length) * 100))}%`,
        dataUri
      }
    });
  } catch (err) {
    return jsonResponse(500, {
      error: "Internal Server Error while processing image.",
      details: err.message
    });
  }
};