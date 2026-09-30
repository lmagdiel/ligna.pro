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
| `functions/` | Cloudflare Pages Functions: `_middleware.js` (senha do preview e `noindex`) e `api/contato.js` (formulário, entrega via JMAP no Fastmail, anexo opcional). |
| `_fonte/` | Exportação do site antigo (HTML, JSON da API REST, uploads originais, PDFs). Ignorada pelo git; só referência. |

## Uso local (PowerShell)

```powershell
winget install Hugo.Hugo.Extended     # uma vez
hugo server                            # http://localhost:1313
hugo --gc --minify                     # build em public/
```

Para testar as Functions localmente: `npx wrangler pages dev public` (lê segredos de `.dev.vars`).

## Publicação

- **Cloudflare Pages**, projeto `ligna-pro` (upload direto via `wrangler`).
- **GitHub Actions** publica a cada push: `main` → produção; outros ramos → preview.
  Segredos do repositório: `CLOUDFLARE_API_TOKEN` (Account › Cloudflare Pages › Edit) e `CLOUDFLARE_ACCOUNT_ID`.
- Variáveis/segredos do projeto no Pages:
  - `PREVIEW_AUTH` = `usuario:senha` → enquanto existir, o site inteiro pede senha e sai com `noindex`. **Remover no lançamento.**
  - `TURNSTILE_SECRET` (+ `turnstileSiteKey` em `hugo.toml`) → proteção do formulário.
  - `FASTMAIL_API_TOKEN` → entrega das mensagens do formulário na caixa de entrada (JMAP). Anexos sobem como blob e vão junto.
  - `CONTATO_DESTINO`, `CONTATO_REMETENTE` → opcionais (endereços ficam só nas variáveis do Cloudflare, nunca no código).

Publicação manual (com `.env` contendo `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`), no PowerShell:

```powershell
.\publicar.ps1              # build + deploy no ramo main
.\publicar.ps1 -Ramo teste  # deploy de teste, em endereço separado
```

## Formulário

Campos: nome, e-mail, anexo (opcional, até 25 MB; PDF, Office, texto, imagem, áudio, vídeo, zip) e mensagem. Proteções: campo-armadilha, Turnstile e validação no servidor. O formulário envia os caminhos das páginas de "enviado"/"erro" do idioma atual (`ok`/`erro`, só caminhos relativos do próprio site são aceitos). Para desligar o anexo: `anexo = false` em `hugo.toml`.

## Plano de virada

1. Preview com senha (`PREVIEW_AUTH`) para a Ligna aprovar.
2. Turnstile e token do Fastmail configurados; testar o formulário nos 3 idiomas, com e sem anexo.
3. Domínio `ligna.pro` no projeto do Pages (DNS já está na Cloudflare); remover `PREVIEW_AUTH`.
4. Conferir os endereços antigos (`_redirects`), em especial os PDFs dos cartões (QR codes) e `/catalogo/`.
5. E-mail continua no cPanel por enquanto (MX/SPF não mudam nesta etapa). Só cancelar a hospedagem depois de migrar o e-mail.
