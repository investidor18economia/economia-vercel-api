# Commercial Domain — Documentação

Patches e contratos do **domínio comercial/conversacional** da MIA (roteamento, catálogo, busca, comparação, decision engine).

## Isolamento de domínios

| Domínio | Patches | Documentação |
|---------|---------|--------------|
| Analytics / identidade | 3.1–3.3, 3.4+ | [docs/analytics/](../analytics/) |
| Autenticação / confiança | 3.3A, 3.3A.1, 3.3A.2 | [docs/auth/](../auth/) |
| **Comercial / roteamento** | **COMM-R01+** | Este diretório |
| Infraestrutura | SUPABASE-* | [docs/infrastructure/](../infrastructure/) |

Autenticação **não** altera roteamento comercial. Roteamento comercial **não** altera segredos criptográficos de auth.

## Patches registrados

| Patch | Status | Título |
|-------|--------|--------|
| [PATCH COMM-R01](./PATCH_COMM_R01_COMPARISON_INTENT_ROUTING.md) | **Aberto** | Comparison Intent False Positive Guard |

## Referências

- [mia-routing-contract.md](../mia-routing-contract.md) — contrato de roteamento
- [KNOWN_LIMITATIONS.md](../architecture/KNOWN_LIMITATIONS.md) — limitações e dívidas ativas
