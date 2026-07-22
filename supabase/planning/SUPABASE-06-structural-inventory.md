# SUPABASE-06 — Inventário Estrutural

> Fonte: `supabase db dump --linked --schema public` (read-only)  
> Arquivo: `supabase/.temp/audit/public-schema-remote.sql` (gitignored)

## Schemas inspecionados

- `public` (completo)

## Resumo

| Métrica | Valor |
|---------|-------|
| Tabelas `public` | 16 |
| Foreign keys | **0** |
| Functions | 1 (`set_updated_at`) |
| Triggers | 0 no dump |
| Views | 0 |
| RLS habilitado | 5 tabelas (catalog + vault + alert logs) |
| Policies | 3 (read-only em specs) |

## Matriz domínio × objetos

| Domínio | Objetos | Dependências reais | Evidência | Migration |
|---------|---------|-------------------|-----------|-----------|
| Foundation | `usage_log`, `cache_results` | Sem dependência | Sem FK no dump | `baseline_foundation_v1` |
| Catalog | `phone_specs`, `product_specs`, `notebook_specs` | Sem dependência | Sem FK; sequences identity | `baseline_catalog_v1` |
| Users | `users` | Sem dependência | PK only | `baseline_users_v1` |
| Conversation | `conversations`, `messages`, `mia_sessions` | **Lógica** (`user_id` cols) | Sem FK | `baseline_conversation_v1` |
| Engagement | `wishes` | **Lógica** (`user_id` text) | Sem FK | `baseline_engagement_v1` |
| Commercial | `commercial_products_cache`, `commercial_candidates` | Sem dependência | Unique `product_key` | `baseline_commercial_v1` |
| Commercial Vault | `provider_credentials` | Sem dependência | RLS + unique ternary | `baseline_commercial_vault_v1` |
| Alerts | `price_alerts`, `price_alert_delivery_logs` | **Lógica** (`alert_id` uuid) | Sem FK | `baseline_alerts_v1` |
| Analytics Schema | `analytics_events` | Sem dependência | 15 colunas | `20260719153000_*` |
| Analytics Security | `analytics_events` RLS/grants | **CS** → 53000 | migration repo | `20260719153001_*` |

## Dependências descartadas

- Catalog → Commercial: **provável** apenas (sem FK)  
- Users → Conversation/Alerts/Engagement: **lógica** (colunas `user_id`, sem FK)

## Ordem definitiva confirmada

Ordem conceitual = ordem de **repair planejado** no SUPABASE-07.  
Ordem cronológica de arquivos difere para Analytics — ver `SUPABASE-06-chronology-decision.md`.

## Limitações

- Dump não inclui `auth` schema  
- Grants em produção são heterogêneos; baseline local replica subset crítico de segurança  
- `product_specs` não possui PK no dump remoto  

*Documento gerado no SUPABASE-06.*
