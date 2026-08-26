from __future__ import annotations

import json
from pathlib import Path

rows = [
    {"dimension": "Canais WhatsApp e omnichannel", "weight": 20, "current": 2.0, "after_channels": 8.5, "top1": 9.5, "gap": "Evolution/Meta homologados, QR/status, inbound/outbound, mídia, templates e reconexão."},
    {"dimension": "Inbox, roteamento, filas e SLA", "weight": 12, "current": 7.5, "after_channels": 8.5, "top1": 9.0, "gap": "Presença em tempo real, reequilíbrio de carga, views salvas e workforce avançado."},
    {"dimension": "CRM, tickets e jornada", "weight": 10, "current": 7.0, "after_channels": 8.0, "top1": 9.0, "gap": "Objetos customizados, customer health, portal e jornada multicanal completa."},
    {"dimension": "Fluxos, automações e campanhas", "weight": 10, "current": 7.0, "after_channels": 8.5, "top1": 9.0, "gap": "Publicação segura, testes de regressão, campanhas multi-etapa e calendário visual."},
    {"dimension": "IA, RAG e voz", "weight": 10, "current": 6.0, "after_channels": 7.5, "top1": 9.0, "gap": "Agentes com ações, benchmark de modelos, transcrição, avaliação e limites de custo."},
    {"dimension": "Analytics, QA, conversão e ROI", "weight": 8, "current": 6.0, "after_channels": 8.0, "top1": 9.0, "gap": "Dashboards em tempo real, scorecards de IA, cohort/retention e atribuição por campanha."},
    {"dimension": "API pública, integrações e webhooks", "weight": 10, "current": 4.5, "after_channels": 8.5, "top1": 9.0, "gap": "API operacional versionada, OAuth, idempotência, scopes, SDKs, sandbox e marketplace."},
    {"dimension": "Segurança, privacidade e governança", "weight": 10, "current": 7.5, "after_channels": 8.5, "top1": 9.5, "gap": "SSO/SCIM, IP allowlist, export/delete, DPA, pentest, status público e compliance."},
    {"dimension": "Onboarding, UX, mobile e suporte", "weight": 5, "current": 4.5, "after_channels": 7.5, "top1": 9.0, "gap": "Wizard guiado, help center, app mobile, tour, treinamento e suporte com SLA."},
    {"dimension": "Escala, performance e operação", "weight": 5, "current": 6.5, "after_channels": 8.0, "top1": 9.5, "gap": "Testes de carga, multi-região, SLO, autoscaling, disaster recovery e chaos testing contínuo."},
]

for row in rows:
    row["current_weighted"] = row["weight"] * row["current"]
    row["after_channels_weighted"] = row["weight"] * row["after_channels"]
    row["top1_weighted"] = row["weight"] * row["top1"]

summary = {
    "scores": {
        "current_production": round(sum(row["current_weighted"] for row in rows) / 100, 2),
        "after_evolution_meta_api": round(sum(row["after_channels_weighted"] for row in rows) / 100, 2),
        "top1_target": round(sum(row["top1_weighted"] for row in rows) / 100, 2),
    },
    "rows": rows,
}

Path("/home/ubuntu/mago-bot-dev/docs/top1-benchmark-score.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(summary["scores"], ensure_ascii=False, indent=2))
