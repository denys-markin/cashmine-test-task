// Deployment smoke check: GET /api/health
// Reports whether the server has its API settings, without revealing them.
export function GET() {
  return Response.json({
    ok: true,
    apiConfigured: Boolean(process.env.API_BASE_URL && process.env.API_TOKEN),
    time: new Date().toISOString(),
  });
}
