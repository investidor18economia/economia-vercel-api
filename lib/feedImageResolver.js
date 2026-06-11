import { getOfferCardImages } from "../components/OfferImageLightbox";
import { feedImageMap } from "./feedImageMap";

export function isLocalFeedImagePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function resolveMappedPath(item = {}) {
  const byId = item.id ? feedImageMap[item.id] : null;
  const byName = item.name ? feedImageMap[item.name] : null;
  const mapped = byId || byName;
  return isLocalFeedImagePath(mapped) ? mapped : null;
}

export function resolveFeedItemImage(item = {}) {
  const mapped = resolveMappedPath(item);
  if (mapped) return mapped;

  if (isLocalFeedImagePath(item.image)) return item.image.trim();
  if (isLocalFeedImagePath(item.thumbnail)) return item.thumbnail.trim();

  return null;
}

export function getFeedItemGallery(item = {}) {
  const gallery = getOfferCardImages(item).filter(isLocalFeedImagePath);
  if (gallery.length > 0) return gallery;

  const primary = resolveFeedItemImage(item);
  return primary ? [primary] : [];
}
