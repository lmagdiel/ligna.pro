// Formulário de contato: POST /api/contato
// Sem banco de dados: a mensagem é validada, passa pelo Turnstile (se configurado)
// e é enviada por SMTP pela própria conta contato@ligna.pro (servidor de e-mail do cPanel),
// com Reply-To apontando para quem escreveu. Anexo opcional vai junto.
//
// Variáveis/segredos do projeto no Cloudflare Pages:
//   SMTP_HOST, SMTP_PORT   servidor de saída (mail.ligna.pro, 465 = TLS direto; 587 = STARTTLS)
//   SMTP_USER, SMTP_PASS   conta que envia (contato@ligna.pro e a senha da caixa)
//   CONTATO_DESTINO        quem recebe (opcional; padrão = SMTP_USER)
//   TURNSTILE_SECRET       segredo do widget Turnstile (opcional, recomendado)
//
// Nenhum endereço ou senha fica no código: o repositório pode ser público.

import { WorkerMailer } from 'worker-mailer';

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

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function enviarSmtp(env, msg) {
  const porta = Number(env.SMTP_PORT || 465);
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
    attachments.push({
      filename: msg.anexo.name.replace(/[\r\n"]/g, '_').slice(0, 150),
      content: base64(await msg.anexo.arrayBuffer()),
      mimeType: msg.anexo.type || 'application/octet-stream',
    });
  }

  await WorkerMailer.send(
    {
      host: env.SMTP_HOST,
      port: porta,
      secure: porta === 465,
      startTls: porta !== 465,
      credentials: { username: env.SMTP_USER, password: env.SMTP_PASS },
      authType: ['plain', 'login'],
      socketTimeoutMs: 30000,
      responseTimeoutMs: 30000,
    },
    {
      from: { name: `${msg.nome} (via site)`, email: env.SMTP_USER },
      to: env.CONTATO_DESTINO || env.SMTP_USER,
      reply: { name: msg.nome, email: msg.email },
      subject: `[ligna.pro · ${ASSUNTO_IDIOMA[msg.idioma] || ASSUNTO_IDIOMA.pt}] ${msg.nome}`,
      text: texto,
      ...(attachments.length ? { attachments } : {}),
    },
  );
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

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn('contato: SMTP_HOST/SMTP_USER/SMTP_PASS não configurados');
    return redirecionar(request, erro);
  }

  try {
    await enviarSmtp(env, msg);
  } catch (e) {
    console.error('contato:', e.message);
    return redirecionar(request, erro);
  }
  return redirecionar(request, ok);
}

export function onRequestGet({ request }) {
  return redirecionar(request, '/contato/');
}
