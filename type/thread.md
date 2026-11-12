---
type: Type
_icon: flame
_color: "#ef4444"
_sidebar_label: Fios
_order: 25
statuses: [Active, Paused, Done, Superseded]
---
# Thread

Fio: decisão ou problema que está quente agora. Vive em `meu-negocio/fios/`. Quando esfria, vai para `meu-negocio/arquivo/` com `status: Done`. `Superseded` só quando outra nota substitui o fio, sempre com `superseded_by`.

O campo `status` usa: `Active`, `Paused`, `Done`, `Superseded` (declarados em `statuses` no frontmatter). Uma linha de status no topo diz onde o fio parou.
