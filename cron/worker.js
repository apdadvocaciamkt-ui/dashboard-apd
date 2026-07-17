// Cron Worker — roda todo dia às 00h15 BRT (03h15 UTC).
// Sincroniza o dia anterior (já fechado) no dashboard-apd. Nunca sincroniza
// "hoje": Meta Ads tem atraso de horas pra consolidar o investimento do dia
// corrente, então "hoje" sempre viria incompleto.

const DASHBOARD_URL = "https://dashboard-apd.apd-advocacia-mkt.workers.dev";

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

export default {
  async scheduled(_event, env, ctx) {
    const secret = env.SYNC_SECRET;
    const today = fmtDate(new Date());
    const yesterday = fmtDate(new Date(Date.now() - 86400000));

    const urls = [
      `${DASHBOARD_URL}/api/sync/meta?secret=${secret}&since=${yesterday}&until=${today}`,
      `${DASHBOARD_URL}/api/sync/liderhub?secret=${secret}&since=${yesterday}T00:00:00Z`,
      `${DASHBOARD_URL}/api/sync/googleads?secret=${secret}&since=${yesterday}&until=${today}`,
    ];

    ctx.waitUntil(
      Promise.all(
        urls.map((url) =>
          fetch(url).then((r) => r.json()).then((data) => console.log(url, JSON.stringify(data)))
        )
      )
    );
  },
};
