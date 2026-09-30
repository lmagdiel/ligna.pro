// Middleware de todas as rotas do Cloudflare Pages.
// - Preview de acesso restrito: se a variável PREVIEW_AUTH ("usuario:senha") existir,
//   exige autenticação HTTP Basic. No lançamento, basta remover a variável.
// - Previews e o domínio *.pages.dev nunca são indexados (X-Robots-Tag).
// - www.ligna.pro redireciona para ligna.pro.

const REALM = 'Preview ligna.pro';

function iguais(a, b) {
  // comparação em tempo constante para strings do mesmo tamanho
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function codificar(credenciais) {
  // btoa só aceita Latin-1; converte UTF-8 antes
  return btoa(String.fromCharCode(...new TextEncoder().encode(credenciais)));
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const restrito = Boolean(env.PREVIEW_AUTH);

  // www → apex (o canonical é ligna.pro; o _redirects não aceita origem com host).
  if (url.hostname === 'www.ligna.pro') {
    url.hostname = 'ligna.pro';
    return Response.redirect(url.toString(), 301);
  }

  if (restrito) {
    const esperado = 'Basic ' + codificar(env.PREVIEW_AUTH);
    const recebido = request.headers.get('Authorization') || '';
    if (!iguais(recebido, esperado)) {
      return new Response('Acesso restrito.', {
        status: 401,
        headers: {
          'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
  }

  const resposta = await next();
  if (restrito || url.hostname.endsWith('.pages.dev')) {
    const r = new Response(resposta.body, resposta);
    r.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (restrito) r.headers.set('Cache-Control', 'private, no-store');
    return r;
  }
  return resposta;
}
