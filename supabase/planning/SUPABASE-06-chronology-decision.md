# SUPABASE-06 — Decisão Cronológica

## Problema

As migrations Analytics existentes possuem timestamps reais anteriores à data de implementação do baseline:

```text
20260719153000_analytics_events_storage_schema_v1.sql
20260719153001_analytics_events_storage_security_v1.sql
```

As migrations baseline foram criadas via CLI em 2026-07-21 com timestamps posteriores (`20260721194830` … `20260721194850`).

Num `supabase db reset` limpo, a ordem **cronológica real** de execução é:

1. Analytics Schema  
2. Analytics Security  
3. Baseline Foundation → … → Baseline Alerts  

Isso difere da **ordem conceitual** aprovada no SUPABASE-05A (baseline antes de Analytics).

## Solução adotada

**Manter timestamps reais sem renomear Analytics** e aceitar ordem cronológica inversa à ordem conceitual, porque:

| Critério | Evidência |
|----------|-----------|
| Autossuficiência Analytics | Migrations 53000/53001 tocam **somente** `analytics_events` |
| Independência estrutural | Dump remoto (SUPABASE-06): **zero foreign keys** em `public` |
| Idempotência baseline | Baseline usa `CREATE TABLE IF NOT EXISTS` + constraints guardadas |
| Instalação limpa | `db reset` local concluiu com sucesso aplicando 10 migrations nesta ordem |
| Produção futura | SUPABASE-07 usará repair/execução por equivalência; ordem conceitual guia repair, não reexecução cega |

## O que não foi feito (proibido)

- Renomear ou retrodatá timestamps das migrations Analytics  
- Criar timestamps fictícios `20260701*`  
- Mover Analytics para depois do baseline alterando nomes  

## Implicação para SUPABASE-07

- Analytics 53000: repair esperado (objeto já existe)  
- Analytics 53001: possível execução real após preflight G  
- Baseline: repair por domínio após preflight de equivalência  

*Documento gerado no SUPABASE-06 — planejamento técnico.*
