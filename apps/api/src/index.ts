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

function parseNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

app.get("/health", async () => ({
  status: "ok",
  service: "RATEIT API",
  version: "0.1.0"
}));

app.get("/api/v1", async () => ({
  name: "RATEIT",
  message: "API платформы соревновательного матчмейкинга",
  status: "В разработке"
}));

app.get("/api/v1/config", async () => ({
  startingElo: 751,
  maxHoursDifference: 50,
  levels,
  note: "Challenger — отдельный статус для игроков из топ-1000 рейтинговой таблицы."
}));

app.get<{ Querystring: { hours?: string } }>("/api/v1/hours/prefix", async (request, reply) => {
  const hours = parseNonNegativeNumber(request.query.hours);
  if (hours === null) {
    return reply.code(400).send({
      error: "Укажи корректное неотрицательное число в параметре hours."
    });
  }

  return { hours, prefix: `${Math.floor(hours / 10) * 10}+` };
});

app.get<{ Querystring: { a?: string; b?: string } }>("/api/v1/matchmaking/hours-check", async (request, reply) => {
  const a = parseNonNegativeNumber(request.query.a);
  const b = parseNonNegativeNumber(request.query.b);

  if (a === null || b === null) {
    return reply.code(400).send({
      error: "Укажи два корректных неотрицательных значения часов: a и b."
    });
  }

  const difference = Math.abs(a - b);
  return {
    playerA: a,
    playerB: b,
    difference,
    compatible: difference <= 50,
    maxDifference: 50
  };
});

app.get<{ Querystring: { elo?: string } }>("/api/v1/elo/rank", async (request, reply) => {
  const elo = parseNonNegativeNumber(request.query.elo);
  if (elo === null || !Number.isInteger(elo)) {
    return reply.code(400).send({
      error: "Укажи целое неотрицательное значение ELO в параметре elo."
    });
  }

  const currentIndex = levels.findIndex((item) => elo >= item.min && (item.max === null || elo <= item.max));
  if (currentIndex === -1) {
    return {
      elo,
      level: null,
      rankName: "Без уровня",
      nextLevel: 1,
      nextElo: 100,
      progressPercent: 0,
      challenger: false
    };
  }

  const current = levels[currentIndex];
  const next = levels[currentIndex - 1];
  const progressPercent = next
    ? Math.max(0, Math.min(100, Math.floor(((elo - current.min) / (next.min - current.min)) * 100)))
    : 100;

  return {
    elo,
    level: current.level,
    rankName: `Уровень ${current.level}`,
    nextLevel: next?.level ?? null,
    nextElo: next?.min ?? null,
    progressPercent,
    challenger: false,
    note: "Статус Challenger определяется отдельно по месту в топ-1000."
  };
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
