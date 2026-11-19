import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const levels = [
  { level: 10, min: 2000, max: null },
  { level: 9, min: 1750, max: 1999 },
  { level: 8, min: 1530, max: 1749 },
  { level: 7, min: 1350, max: 1529 },
  { level: 6, min: 1200, max: 1349 },
  { level: 5, min: 1050, max: 1199 },
  { level: 4, min: 900, max: 1049 },
  { level: 3, min: 751, max: 899 },
  { level: 2, min: 501, max: 750 },
  { level: 1, min: 100, max: 500 }
] as const;

app.get("/health", async () => ({ status: "ok", service: "RATEIT API", version: "0.1.0" }));

app.get("/api/v1", async () => ({
  name: "RATEIT",
  message: "API платформы соревновательного матчмейкинга",
  status: "В разработке"
}));

app.get("/api/v1/config", async () => ({
  startingElo: 751,
  maxHoursDifference: 50,
  levels,
  note: "Challenger присваивается отдельно игрокам из топ-1000."
}));

app.get<{ Querystring: { hours?: string } }>("/api/v1/hours/prefix", async (request, reply) => {
  const hours = Number(request.query.hours);
  if (request.query.hours === undefined || !Number.isFinite(hours) || hours < 0) {
    return reply.code(400).send({ error: "Укажи корректное неотрицательное число в параметре hours." });
  }
  return { hours, prefix: `${Math.floor(hours / 10) * 10}+` };
});

app.get<{ Querystring: { a?: string; b?: string } }>("/api/v1/matchmaking/hours-check", async (request, reply) => {
  const a = Number(request.query.a);
  const b = Number(request.query.b);
  if (request.query.a === undefined || request.query.b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
    return reply.code(400).send({ error: "Укажи два корректных значения часов: a и b." });
  }
  return { playerA: a, playerB: b, difference: Math.abs(a - b), compatible: Math.abs(a - b) <= 50, maxDifference: 50 };
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
