export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = `https://${env.SUPABASE_TARGET}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      });

      const respHeaders = new Headers(response.headers);
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      respHeaders.set('Access-Control-Allow-Headers', '*');

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: respHeaders });
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'proxy_error', message: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
