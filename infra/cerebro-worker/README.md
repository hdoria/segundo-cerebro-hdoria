# Receptor do Cérebro em cerebro.vibemakers.com.br

Cloudflare Worker (`cerebro-vibemakers`, conta Popcode) com D1 `cerebro-telemetry`.

- `POST /cerebro-ping` grava só campos técnicos (install_id, evento, versão, SO, runtime, sistema, run, eval, decisão, motivo, duração). E-mail, `member_id` e credencial são descartados antes de gravar.
- `POST /cerebro-install-activation` responde 403 `activation_not_available` até existir emissão de claims.
- `POST /api/system-distribution` e `/api/library-sync` respondem 403 até existir catálogo (issue #21 no `hugo-os-lab`).
- `GET /health` responde `{ok:true}`.

Deploy, com `CLOUDFLARE_EMAIL` e `CLOUDFLARE_API_KEY` no ambiente:

```bash
node test.mjs
npx wrangler@3.114.0 d1 execute cerebro-telemetry --remote --file=schema.sql
npx wrangler@3.114.0 deploy
```

Consultar: `npx wrangler@3.114.0 d1 execute cerebro-telemetry --remote --command "SELECT event, count(*) FROM pings GROUP BY event"`.
