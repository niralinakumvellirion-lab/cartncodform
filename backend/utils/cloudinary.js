// backend/utils/cloudinary.js
// Thin Cloudinary upload helper.  No npm dependency — plain fetch.
//
// uploadImage(dataUrl) returns { url, width, height } or null.
// uploadToCloudinary(dataUrl) returns url string or null (backward-compat).

async function uploadImage(dataUrl) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) return null;

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: dataUrl, upload_preset: uploadPreset }),
      }
    );
    const data = await response.json();
    if (!data.secure_url) return null;
    return {
      url: data.secure_url,
      width: data.width || null,
      height: data.height || null,
    };
  } catch (e) {
    console.error('[cloudinary] upload error:', e.message);
    return null;
  }
}

async function uploadToCloudinary(dataUrl) {
  const result = await uploadImage(dataUrl);
  return result ? result.url : null;
}

module.exports = { uploadImage, uploadToCloudinary };
