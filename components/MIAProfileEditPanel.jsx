import { useRef, useState } from "react";

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "🙂";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function MIAProfileEditPanel({
  user,
  profile,
  onClose,
  onSave,
  saving,
}) {
  const fileRef = useRef(null);
  const [displayName, setDisplayName] = useState(profile?.displayName || user?.nome || "");
  const [photoPreview, setPhotoPreview] = useState(profile?.photoDataUrl || "");

  function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave?.({
      displayName: displayName.trim(),
      photoDataUrl: photoPreview,
    });
  }

  return (
    <div
      className="mia-side-panel mia-side-panel--profile-edit mia-profile-edit-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Editar perfil"
    >
      <div className="mia-profile-edit-header">
        <div>
          <p className="mia-profile-edit-eyebrow">Central Teilor</p>
          <h4 className="mia-profile-edit-title">Editar perfil</h4>
          <p className="mia-profile-edit-subtitle">
            Ajuste sua foto e nome para personalizar sua experiência na MIΛ.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar edição de perfil"
        >
          Fechar
        </button>
      </div>

      <form className="mia-profile-edit-form" onSubmit={handleSubmit}>
        <div className="mia-profile-edit-photo-block">
          <button
            type="button"
            className="mia-profile-edit-photo-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Alterar foto de perfil"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="" className="mia-profile-edit-photo-image" />
            ) : (
              <span className="mia-profile-edit-photo-fallback" aria-hidden="true">
                {getInitials(displayName || user?.nome)}
              </span>
            )}
            <span className="mia-profile-edit-photo-badge">Alterar foto</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="mia-profile-edit-file-input"
            onChange={handlePhotoChange}
          />
        </div>

        <label className="mia-profile-edit-field">
          <span className="mia-profile-edit-field-label">Nome</span>
          <input
            type="text"
            className="mia-profile-edit-input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Como você quer ser chamado"
            autoComplete="name"
            enterKeyHint="done"
          />
        </label>

        <label className="mia-profile-edit-field">
          <span className="mia-profile-edit-field-label">Email</span>
          <input
            type="email"
            className="mia-profile-edit-input"
            value={user?.email || ""}
            readOnly
            aria-readonly="true"
          />
        </label>

        <div className="mia-profile-edit-actions">
          <button type="submit" className="mia-profile-edit-save" disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
          <button type="button" className="mia-profile-edit-cancel" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
