/**
 * fetch-festival-images.js
 *
 * What it does:
 *   Reads backend/data/festivals.json and, for every festival whose
 *   `imageUrl` is still null, searches Pexels for `searchTerm`, uploads
 *   the top result to Cloudinary (via the same unsigned upload preset the
 *   app already uses for storefront images), and writes the resulting
 *   Cloudinary secure_url back into that festival's `imageUrl`.
 *
 *   Festivals that already have an `imageUrl` are skipped, so the script
 *   is safe to re-run at any time — e.g. after adding a new festival, or
 *   after fixing a search term that returned a bad photo (just null out
 *   that one entry's imageUrl and re-run).
 *
 * How to run:
 *   cd backend
 *   PEXELS_API_KEY=xxx node scripts/fetch-festival-images.js
 *
 *   (CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET must also be set,
 *   either in backend/.env or the shell environment — same variables the
 *   rest of the backend already uses for image uploads.)
 *
 * How to add a future festival:
 *   Append a new entry to backend/data/festivals.json with the usual
 *   name/date/emoji/suggestion/message fields, plus:
 *     "searchTerm": "<a descriptive stock-photo search phrase>",
 *     "imageUrl": null
 *   Then re-run this script — it will only fetch the new entry, since
 *   every festival that already has an imageUrl is skipped.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const FESTIVALS_PATH = path.join(__dirname, '../data/festivals.json');
const DELAY_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadFestivals() {
  const raw = fs.readFileSync(FESTIVALS_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveFestivals(festivals) {
  fs.writeFileSync(FESTIVALS_PATH, JSON.stringify(festivals, null, 2) + '\n', 'utf8');
}

async function searchPexels(searchTerm, apiKey) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchTerm)}&per_page=1&orientation=square`;
  const response = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    throw new Error(`Pexels search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const photo = data.photos && data.photos[0];
  if (!photo || !photo.src || !photo.src.medium) {
    throw new Error('No Pexels results for search term');
  }

  return photo.src.medium;
}

async function uploadToCloudinary(remoteUrl, cloudName, uploadPreset) {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: remoteUrl,
        upload_preset: uploadPreset,
      }),
    }
  );

  const data = await response.json();
  if (!data.secure_url) {
    throw new Error(
      `Cloudinary upload failed: ${(data.error && data.error.message) || 'no secure_url returned'}`
    );
  }

  return data.secure_url;
}

async function main() {
  const pexelsApiKey = process.env.PEXELS_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!pexelsApiKey) {
    console.error('[fetch-festival-images] PEXELS_API_KEY is not set — aborting.');
    process.exit(1);
  }
  if (!cloudName || !uploadPreset) {
    console.error(
      '[fetch-festival-images] CLOUDINARY_CLOUD_NAME and/or CLOUDINARY_UPLOAD_PRESET is not set — aborting.'
    );
    process.exit(1);
  }

  const festivals = loadFestivals();

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const festival of festivals) {
    if (festival.imageUrl) {
      console.log(`[fetch-festival-images] ${festival.name} — skipped (already has imageUrl)`);
      skipped += 1;
      continue;
    }

    console.log(`[fetch-festival-images] ${festival.name} — searching "${festival.searchTerm}"...`);

    try {
      const pexelsUrl = await searchPexels(festival.searchTerm, pexelsApiKey);
      const cloudinaryUrl = await uploadToCloudinary(pexelsUrl, cloudName, uploadPreset);

      festival.imageUrl = cloudinaryUrl;
      saveFestivals(festivals);

      console.log(`[fetch-festival-images] ${festival.name} — fetched: ${cloudinaryUrl}`);
      fetched += 1;
    } catch (err) {
      console.error(`[fetch-festival-images] ${festival.name} — FAILED: ${err.message}`);
      failed += 1;
    }

    await delay(DELAY_MS);
  }

  console.log('');
  console.log(
    `[fetch-festival-images] Done — ${fetched} fetched, ${skipped} skipped, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error('[fetch-festival-images] Unexpected error:', err.message);
  process.exit(1);
});
