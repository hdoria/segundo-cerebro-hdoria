---
type: Type
_icon: user
_color: "#10b981"
_sidebar_label: Pessoas
_order: 30
statuses: [Active, Paused, Archived, Superseded]
---
# Person

Pessoa ou empresa que importa: cliente-chave, parceiro, concorrente, fornecedor. Vive em `meu-negocio/gente/`, uma página por pessoa. Pessoa privada usa papel ("o cliente grande de SC"), nunca nome com dados pessoais.

O campo `status` usa: `Active`, `Paused`, `Archived`, `Superseded` (declarados em `statuses` no frontmatter). Relações via `related_to` e `belongs_to`.
