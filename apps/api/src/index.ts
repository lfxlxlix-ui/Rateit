import Fastify from "fastify";
import cors from "@fastify/cors";
import { checkDatabase, dbPool } from "./db.js";
import {
  START_ELO,
  MAX_HOURS_DIFFERENCE,
  RANKS,
  getHoursPrefix,
  isHoursRangeCompatible
} from "../../../packages/shared/src/index.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const levels = RANKS
  .filter((rank) => rank.min !== null)
  .map((rank) => ({
    level: Number(rank.name),
    min: rank.min as number,
    max: rank.max
  }));

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

app.get("/ready", async (_request, reply) => {
  try {
    const database = await checkDatabase();
    if (!database) {
      return reply.code(503).send({ status: "not_ready", database: "not_configured" });
    }
    return { status: "ready", database: "connected" };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

app.addHook("onClose", async () => {
  await dbPool?.end();
});

app.get("/api/v1", async () => ({
  name: "RATEIT",
  message: "API платформы соревновательного матчмейкинга",
  status: "В разработке"
}));

app.get("/api/v1/config", async () => ({
  startingElo: START_ELO,
  maxHoursDifference: MAX_HOURS_DIFFERENCE,
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

  return { hours, prefix: getHoursPrefix(hours) };
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
    compatible: isHoursRangeCompatible(a, b),
    maxDifference: MAX_HOURS_DIFFERENCE
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
