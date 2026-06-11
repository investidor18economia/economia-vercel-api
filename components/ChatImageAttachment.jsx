export default function ChatImageAttachment({
  preview,
  sourceLabel,
  disabled,
  onReplace,
  onRemove,
  onSubmit,
}) {
  if (!preview) return null;

  return (
    <div className="mia-chat-image-attachment" role="region" aria-label="Imagem selecionada para análise">
      <div className="mia-chat-image-attachment-preview-wrap">
        <img
          src={preview}
          alt="Preview da imagem selecionada"
          className="mia-chat-image-attachment-preview"
          decoding="async"
        />
      </div>
      <div className="mia-chat-image-attachment-copy">
        <p className="mia-chat-image-attachment-status">Imagem pronta para análise</p>
        {sourceLabel && (
          <p className="mia-chat-image-attachment-meta">{sourceLabel}</p>
        )}
      </div>
      <div className="mia-chat-image-attachment-actions">
        <button
          type="button"
          className="mia-chat-image-attachment-btn"
          onClick={onReplace}
          disabled={disabled}
        >
          Trocar imagem
        </button>
        <button
          type="button"
          className="mia-chat-image-attachment-btn"
          onClick={onRemove}
          disabled={disabled}
        >
          Remover
        </button>
        <button
          type="button"
          className="mia-chat-image-attachment-btn mia-chat-image-attachment-btn--primary"
          onClick={onSubmit}
          disabled={disabled}
        >
          Enviar para análise
        </button>
      </div>
    </div>
  );
}
