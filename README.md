# ligna.pro

Site da Ligna (traduções e serviços linguísticos), estático, feito com [Hugo](https://gohugo.io) (≥ 0.146; testado na 0.166) e tema próprio (`themes/ligna`), publicado no Cloudflare Pages. Mesma estrutura do lucasmagdiel.com.

Migrado do WordPress (tema Zakra + SiteOrigin + Polylang + Contact Form 7 + dFlip) em setembro de 2026. O design original é da Polvo; o site novo reproduz o visual com HTML/CSS próprios.

## Estrutura

| Pasta | O que é |
|---|---|
| `content/` | Páginas em Markdown, uma por idioma (`sobre.pt.md`, `sobre.en.md`, `sobre.es.md`). Os slugs antigos do Polylang foram mantidos (`/en/about/`, `/es/acerca-de/`…) via `slug`/`url` no front matter. |
| `content/_index.*.md` | Página inicial: título do hero, faixa e os três pilares ficam no front matter. |
| `content/catalogo.*.md`, `content/cartao-mayra.*.md` | Páginas de PDF (layout `pdf`): `pdf:` aponta para o arquivo em `static/arquivos/`. |
| `assets/img/` | Imagens de origem (faixas duotone, equipe, ícones, logos). O Hugo gera WebP em várias larguras no build. |
| `static/arquivos/` | Os PDFs (catálogo, brochure, cartões digitais). **Limite do Cloudflare Pages: 25 MiB por arquivo** — o catálogo tem 23 MB; se crescer, comprimir ou mover para o R2. |
| `static/_redirects` | Endereços antigos (WordPress/Polylang, `wp-content/uploads/*.pdf`) → novos, com 301. |
| `static/fonts/` | Montserrat (variável, woff2) auto-hospedada. |
| `i18n/` | Textos da interface (menu, formulário, rodapé) em PT/EN/ES. |
| `themes/ligna/` | Tema: layouts, parciais (`_partials/`), shortcodes (`faixa`, `intro`, `equipe`, `membro`, `prosa`, `lista`) e CSS (`assets/css/main.css`). |
| `functions/` | Cloudflare Pages Functions: `_middleware.js` (senha do preview e `noindex`) e `api/contato.js` (formulário: envia por SMTP pela conta `contato@ligna.pro` do cPanel, com anexo opcional). Dependência: `worker-mailer` (`package.json`). |
| `_fonte/` | Exportação do site antigo (HTML, JSON da API REST, uploads originais, PDFs). Ignorada pelo git; só referência. |

## Uso local (PowerShell)

```powershell
winget install Hugo.Hugo.Extended     # uma vez
hugo server                            # http://localhost:1313
hugo --gc --minify                     # build em public/
```

Para testar as Functions localmente: `npm install` uma vez e `npx wrangler pages dev public` (lê segredos de `.dev.vars`; modelo em `.dev.vars.example`).

## Publicação

- **Cloudflare Pages**, projeto `ligna-pro` (upload direto via `wrangler`).
- **GitHub Actions** publica a cada push: `main` → produção; outros ramos → preview.
  Segredos do repositório: `CLOUDFLARE_API_TOKEN` (Account › Cloudflare Pages › Edit) e `CLOUDFLARE_ACCOUNT_ID`.
- Variáveis/segredos do projeto no Pages:
  - `PREVIEW_AUTH` = `usuario:senha` → enquanto existir, o site inteiro pede senha e sai com `noindex`. **Remover no lançamento.**
  - `TURNSTILE_SECRET` (+ `turnstileSiteKey` em `hugo.toml`) → proteção do formulário.
  - `SMTP_HOST` (`mail.ligna.pro`), `SMTP_PORT` (`465`), `SMTP_USER` (`contato@ligna.pro`), `SMTP_PASS` (senha da caixa, segredo) → envio do formulário pelo servidor de e-mail do cPanel. O e-mail continua hospedado lá; só o site muda de lugar. **Manter os registros DNS `mail.ligna.pro`, `webmail`, `cpanel` apontando para o cPanel.**
  - `CONTATO_DESTINO` → quem recebe (padrão: `SMTP_USER`).
  - Para definir um segredo: `npx wrangler@4 pages secret put SMTP_PASS --project-name ligna-pro` (produção) — o preview usa os mesmos valores se definidos no painel do Pages em *Settings › Variables and secrets*.

Publicação manual (com `.env` contendo `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`), no PowerShell:

```powershell
.\publicar.ps1              # build + deploy no ramo main
.\publicar.ps1 -Ramo teste  # deploy de teste, em endereço separado
```

## Formulário

Campos: nome, e-mail, anexo (opcional, até 25 MB; PDF, Office, texto, imagem, áudio, vídeo, zip) e mensagem. Proteções: campo-armadilha, Turnstile e validação no servidor. O formulário envia os caminhos das páginas de "enviado"/"erro" do idioma atual (`ok`/`erro`, só caminhos relativos do próprio site são aceitos). Para desligar o anexo: `anexo = false` em `hugo.toml`.

## Virada (feita em 30/09/2026)

- DNS: `ligna.pro` e `www` → CNAME proxied para `ligna-pro.pages.dev`; `mail.ligna.pro` e `ftp.ligna.pro` viraram registros A diretos no IP do cPanel (antes eram CNAME para o apex, o que derrubaria o e-mail); MX e SRVs (CalDAV/CardDAV) passaram a apontar para `mail.ligna.pro`. Backup dos registros anteriores em `_fonte/dns-antes-da-virada.json` (fora do git).
- O wildcard `*.ligna.pro` continua no cPanel (`webmail`, `cpanel` etc.).

## Plano de virada (histórico)

1. Preview com senha (`PREVIEW_AUTH`) para a Ligna aprovar.
2. Turnstile e `SMTP_PASS` configurados; testar o formulário nos 3 idiomas, com e sem anexo.
3. Domínio `ligna.pro` no projeto do Pages (DNS já está na Cloudflare); remover `PREVIEW_AUTH`.
4. Conferir os endereços antigos (`_redirects`), em especial os PDFs dos cartões (QR codes) e `/catalogo/`.
5. E-mail continua no cPanel por enquanto (MX/SPF não mudam nesta etapa). Só cancelar a hospedagem depois de migrar o e-mail.
