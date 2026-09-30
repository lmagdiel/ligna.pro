// Formulário de contato: POST /api/contato
// Sem banco de dados: a mensagem é validada, passa pelo Turnstile (se configurado)
// e é entregue diretamente na caixa de entrada do Fastmail via JMAP (Email/set),
// com Reply-To apontando para quem escreveu. Anexo opcional (subido como blob JMAP).
//
// Variáveis/segredos do projeto no Cloudflare Pages:
//   TURNSTILE_SECRET     segredo do widget Turnstile (opcional, recomendado)
//   FASTMAIL_API_TOKEN   token de API do Fastmail com permissão de e-mail (JMAP Mail)
//   CONTATO_DESTINO      endereço exibido como destinatário (opcional)
//   CONTATO_REMETENTE    endereço exibido como remetente (opcional; sem ele, aparece o de quem escreveu)
//
// Nenhum endereço fica no código: o repositório pode ser público e e-mail exposto atrai spam.

const LIMITES = { nome: 120, email: 200, mensagem: 5000, anexoBytes: 25 * 1024 * 1024 };
const ANEXO_TIPOS = /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.oasis\.opendocument\.[a-z]+|rtf|zip|x-zip-compressed|x-subrip)|text\/(plain|rtf|x-subrip|vtt)|image\/|audio\/|video\/)/;
const ASSUNTO_IDIOMA = { pt: 'Contato pelo site', en: 'Website contact', es: 'Contacto por el sitio' };

const redirecionar = (request, caminho) => Response.redirect(new URL(caminho, request.url).toString(), 303);

function limpar(valor, max) {
  return String(valor || '').replace(/\r\n?/g, '\n').trim().slice(0, max);
}

// Caminhos de retorno vêm do formulário (página do idioma), mas só aceitamos caminhos relativos do próprio site.
function destino(form, campo, padrao) {
  const v = String(form.get(campo) || '');
  return /^\/(?!\/)[\w\-./]*$/.test(v) ? v : padrao;
}

async function verificarTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // sem segredo configurado: não bloqueia (fase de testes)
  if (!token) return false;
  const corpo = new FormData();
  corpo.append('secret', env.TURNSTILE_SECRET);
  corpo.append('response', token);
  if (ip) corpo.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: corpo });
  const dados = await r.json();
  return Boolean(dados.success);
}

async function jmap(env) {
  const auth = { Authorization: `Bearer ${env.FASTMAIL_API_TOKEN}` };
  const sessao = await (await fetch('https://api.fastmail.com/jmap/session', { headers: auth })).json();
  const accountId = sessao.primaryAccounts['urn:ietf:params:jmap:mail'];
  const chamar = async (methodCalls) => {
    const r = await fetch(sessao.apiUrl, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'], methodCalls }),
    });
    if (!r.ok) throw new Error(`JMAP HTTP ${r.status}`);
    return (await r.json()).methodResponses;
  };
  const subir = async (arquivo) => {
    const url = sessao.uploadUrl.replace('{accountId}', accountId);
    const r = await fetch(url, { method: 'POST', headers: { ...auth, 'Content-Type': arquivo.type || 'application/octet-stream' }, body: arquivo.stream() });
    if (!r.ok) throw new Error(`JMAP upload HTTP ${r.status}`);
    return r.json(); // { blobId, type, size }
  };
  return { accountId, chamar, subir };
}

async function entregarFastmail(env, msg) {
  const { accountId, chamar, subir } = await jmap(env);
  const [[, caixas]] = await chamar([['Mailbox/query', { accountId, filter: { role: 'inbox' } }, 'a']]);
  const inboxId = caixas.ids && caixas.ids[0];
  if (!inboxId) throw new Error('Caixa de entrada não encontrada');

  const texto = [
    `Nome: ${msg.nome}`,
    `E-mail: ${msg.email}`,
    `Idioma do site: ${msg.idioma}`,
    `Enviado em: ${new Date().toISOString()}`,
    msg.anexo ? `Anexo: ${msg.anexo.name} (${msg.anexo.type || 'tipo desconhecido'}, ${Math.round(msg.anexo.size / 1024)} KB)` : 'Anexo: nenhum',
    '',
    msg.mensagem,
  ].join('\n');

  const attachments = [];
  if (msg.anexo) {
    const blob = await subir(msg.anexo);
    attachments.push({ blobId: blob.blobId, type: blob.type, name: msg.anexo.name, disposition: 'attachment' });
  }

  const [[metodo, resultado]] = await chamar([[
    'Email/set',
    {
      accountId,
      create: {
        m: {
          mailboxIds: { [inboxId]: true },
          keywords: {},
          from: [{ name: `${msg.nome} (via site)`, email: env.CONTATO_REMETENTE || msg.email }],
          replyTo: [{ name: msg.nome, email: msg.email }],
          ...(env.CONTATO_DESTINO ? { to: [{ email: env.CONTATO_DESTINO }] } : {}),
          subject: `[ligna.pro · ${ASSUNTO_IDIOMA[msg.idioma] || ASSUNTO_IDIOMA.pt}] ${msg.nome}`,
          receivedAt: new Date().toISOString(),
          bodyValues: { t: { value: texto, charset: 'utf-8' } },
          textBody: [{ partId: 't', type: 'text/plain' }],
          ...(attachments.length ? { attachments } : {}),
        },
      },
    },
    'b',
  ]]);
  if (metodo !== 'Email/set' || !resultado.created || !resultado.created.m) {
    throw new Error('Falha ao criar a mensagem: ' + JSON.stringify(resultado.notCreated || resultado));
  }
}

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirecionar(request, '/contato/erro/');
  }
  const ok = destino(form, 'ok', '/contato/enviado/');
  const erro = destino(form, 'erro', '/contato/erro/');

  // Armadilha para robôs: campo invisível preenchido → finge sucesso.
  if (limpar(form.get('website'), 200)) return redirecionar(request, ok);

  const msg = {
    nome: limpar(form.get('nome'), LIMITES.nome),
    email: limpar(form.get('email'), LIMITES.email),
    idioma: ['pt', 'en', 'es'].includes(form.get('idioma')) ? form.get('idioma') : 'pt',
    mensagem: limpar(form.get('mensagem'), LIMITES.mensagem),
    anexo: null,
  };
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email);
  if (!msg.nome || !emailValido || msg.mensagem.length < 5) return redirecionar(request, erro);

  const anexo = form.get('anexo');
  if (anexo && typeof anexo === 'object' && anexo.size > 0) {
    if (anexo.size > LIMITES.anexoBytes || !ANEXO_TIPOS.test(anexo.type || '')) return redirecionar(request, erro);
    msg.anexo = anexo;
  }

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await verificarTurnstile(env, form.get('cf-turnstile-response'), ip))) {
    return redirecionar(request, erro);
  }

  if (!env.FASTMAIL_API_TOKEN) {
    console.warn('contato: FASTMAIL_API_TOKEN não configurado');
    return redirecionar(request, erro);
  }

  try {
    await entregarFastmail(env, msg);
  } catch (e) {
    console.error('contato:', e.message);
    return redirecionar(request, erro);
  }
  return redirecionar(request, ok);
}

export function onRequestGet({ request }) {
  return redirecionar(request, '/contato/');
}
