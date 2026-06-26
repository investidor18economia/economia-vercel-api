import {
  COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX,
  MIA_HOW_IT_WORKS_AUDIT_HREF,
  shouldShowCommercialTransparencyNotice,
} from "../lib/miaCommercialKnowledgeTransparency.js";

export default function MIACommercialTransparencyNotice({
  knowledgeMetadata = null,
  onLearnMore,
}) {
  if (!shouldShowCommercialTransparencyNotice(knowledgeMetadata)) {
    return null;
  }

  function handleLearnMoreClick(event) {
    if (typeof onLearnMore === "function") {
      event.preventDefault();
      onLearnMore();
    }
  }

  return (
    <p className="mia-commercial-transparency-notice" role="note">
      <span className="mia-commercial-transparency-notice__icon" aria-hidden="true">
        ℹ️
      </span>
      <span className="mia-commercial-transparency-notice__text">
        {COMMERCIAL_TRANSPARENCY_NOTICE_PREFIX}{" "}
        <a
          className="mia-commercial-transparency-notice__link"
          href={MIA_HOW_IT_WORKS_AUDIT_HREF}
          onClick={handleLearnMoreClick}
        >
          Saiba mais
        </a>
      </span>
    </p>
  );
}
