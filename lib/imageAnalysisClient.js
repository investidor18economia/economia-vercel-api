/**
 * Future integration point for image-based product search.
 * Replace the placeholder body with a real POST when /api/search-by-image exists.
 */
export const IMAGE_SEARCH_ENDPOINT = "/api/search-by-image";

export async function requestImageAnalysis({
  imageBase64 = "",
  text = "",
  metadata = {},
  file = null,
} = {}) {
  // Future implementation:
  // const formData = new FormData();
  // if (file) formData.append("file", file);
  // if (imageBase64) formData.append("image_base64", imageBase64);
  // if (text) formData.append("text", text);
  // formData.append("metadata", JSON.stringify(metadata));
  // const response = await fetch(IMAGE_SEARCH_ENDPOINT, { method: "POST", body: formData });
  // return response.json();

  void file;
  void imageBase64;
  void metadata;

  await new Promise((resolve) => {
    setTimeout(resolve, 2400);
  });

  const trimmedText = String(text || "").trim();
  const intro = trimmedText
    ? `Recebi sua imagem sobre “${trimmedText}”.`
    : "Recebi sua imagem.";

  return {
    ok: true,
    placeholder: true,
    message: `${intro} 🔍

Em breve vou identificar produtos e comparar preços a partir de fotos.

Por enquanto, me conte o que você quer encontrar — ou envie outra foto mais nítida, com o produto em destaque.`,
  };
}
