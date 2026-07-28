const KHALAS_ORIGIN = "khalas-website.j0rd4nj4k50n.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/khalas" || url.pathname.startsWith("/khalas/")) {
      const upstream = new URL(request.url);
      upstream.hostname = KHALAS_ORIGIN;
      upstream.pathname = url.pathname.slice("/khalas".length) || "/";

      return fetch(new Request(upstream, request));
    }

    return env.ASSETS.fetch(request);
  },
};
