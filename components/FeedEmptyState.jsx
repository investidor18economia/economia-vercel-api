import MIAAvatar from "./MIAAvatar";
import MIAMenuSymbol from "./MIAMenuSymbol";

export default function FeedEmptyState({ onScrollToChat }) {
  return (
    <div className="mia-feed-empty">
      <div className="mia-feed-empty-icon mia-hub-empty-mia-mark" aria-hidden="true">
        <MIAAvatar size="feed" alt="" />
      </div>
      <h5 className="mia-feed-empty-title">Feed da MIΛ</h5>
      <p className="mia-feed-empty-text">
        Aqui a MIΛ vai mostrar produtos, oportunidades e descobertas que podem fazer sentido
        para você.
      </p>
      <button type="button" className="mia-feed-empty-cta" onClick={onScrollToChat}>
        <MIAMenuSymbol />
        Conversar com a MIΛ
      </button>
    </div>
  );
}
