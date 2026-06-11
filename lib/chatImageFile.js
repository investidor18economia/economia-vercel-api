export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1600;

export function validateImageFile(file) {
  if (!file) {
    return { ok: false, error: "Nenhuma imagem selecionada." };
  }

  const type = String(file.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    return { ok: false, error: "Use JPG, PNG ou WEBP." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Imagem muito grande. Tente uma menor que 10 MB." };
  }

  return { ok: true };
}

export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = (event) => {
      const img = new Image();

      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        let { width, height } = img;
        const maxSide = MAX_IMAGE_DIMENSION;

        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_failed"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const fileType = String(file.type || "").toLowerCase();
        const usePng = fileType === "image/png";
        const mime = usePng ? "image/png" : "image/jpeg";
        const dataUrl = usePng
          ? canvas.toDataURL(mime)
          : canvas.toDataURL(mime, 0.88);

        resolve({ dataUrl, width, height, mime });
      };

      img.src = event.target?.result || "";
    };

    reader.readAsDataURL(file);
  });
}
