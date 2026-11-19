import Fastify from "fastify";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
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


const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function sendTelegramMessage(chatId: number, text: string) {
  if (!telegramToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed: ${response.status}`);
}

app.post<{ Body: { purpose?: "login" | "link" } }>("/api/v1/auth/telegram/start", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "Авторизация временно недоступна: база данных не подключена." });
  if (!telegramBotUsername) return reply.code(503).send({ error: "Не настроен TELEGRAM_BOT_USERNAME в Render." });
  const purpose = request.body?.purpose === "link" ? "link" : "login";
  const challengeId = randomUUID();
  const startToken = randomBytes(32).toString("base64url");
  try {
    await dbPool.query(
      "INSERT INTO telegram_auth_challenges (id, start_token_hash, expires_at) VALUES ($1, $2, now() + interval '10 minutes')",
      [challengeId, sha256(startToken)]
    );
    return {
      challengeId,
      botUrl: `https://t.me/${telegramBotUsername}?start=${startToken}`,
      expiresInSeconds: 600,
      purpose,
      instructions: "Открой бота и нажми Start. Код придёт в личное сообщение."
    };
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ error: "Не удалось создать запрос. Проверь подключение базы данных и миграции." });
  }
});

app.post<{ Body: { challengeId?: string; code?: string } }>("/api/v1/auth/telegram/verify", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "База данных не подключена." });
  const { challengeId, code } = request.body ?? {};
  if (!challengeId || !/^[0-9a-f-]{36}$/i.test(challengeId) || !code || !/^\\d{6}$/.test(code)) {
    return reply.code(400).send({ error: "Укажи запрос авторизации и шестизначный код." });
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT code_hash, telegram_user_id, expires_at, attempts, consumed_at FROM telegram_auth_challenges WHERE id = $1 FOR UPDATE",
      [challengeId]
    );
    const challenge = result.rows[0];
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() <= Date.now() || challenge.attempts >= 5 || !challenge.code_hash) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ error: "Код недействителен или срок его действия истёк. Запроси новый." });
    }
    if (sha256(code) !== challenge.code_hash) {
      await client.query("UPDATE telegram_auth_challenges SET attempts = attempts + 1 WHERE id = $1", [challengeId]);
      await client.query("COMMIT");
      return reply.code(400).send({ error: challenge.attempts + 1 >= 5 ? "Слишком много попыток. Запроси новый код." : "Неверный код." });
    }
    await client.query("UPDATE telegram_auth_challenges SET consumed_at = now() WHERE id = $1", [challengeId]);
    await client.query("COMMIT");
    return {
      verified: true,
      telegramUserId: challenge.telegram_user_id,
      nextStep: "telegram_identity_verified",
      message: "Telegram подтверждён. Создание сессии RATEIT и привязка к профилю будут завершены после подключения системы аккаунтов."
    };
  } catch (error) {
    await client.query("ROLLBACK");
    request.log.error(error);
    return reply.code(500).send({ error: "Не удалось проверить код." });
  } finally {
    client.release();
  }
});

app.post<{ Body: { message?: { text?: string; from?: { id?: number }; chat?: { id?: number } } } }>("/api/v1/webhooks/telegram", async (request, reply) => {
  if (!telegramToken || !telegramWebhookSecret || !dbPool) {
    return reply.code(503).send({ error: "Telegram webhook не настроен полностью." });
  }
  const suppliedSecret = request.headers["x-telegram-bot-api-secret-token"];
  if (typeof suppliedSecret !== "string" || suppliedSecret !== telegramWebhookSecret) {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const message = request.body?.message;
  const text = message?.text ?? "";
  const chatId = message?.chat?.id;
  const telegramUserId = message?.from?.id;
  const match = text.match(/^\\/start(?:@\\w+)?\\s+([A-Za-z0-9_-]{20,100})$/);
  if (!match || !chatId || !telegramUserId) return { ok: true };
  const startToken = match[1];
  const code = String(randomInt(100000, 1000000));
  const client = await dbPool.connect();
  let challengeId: string | null = null;
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT id FROM telegram_auth_challenges WHERE start_token_hash = $1 AND expires_at > now() AND consumed_at IS NULL AND code_hash IS NULL FOR UPDATE",
      [sha256(startToken)]
    );
    if (result.rowCount) {
      challengeId = result.rows[0].id as string;
      await client.query(
        "UPDATE telegram_auth_challenges SET telegram_user_id = $2, code_hash = $3, expires_at = now() + interval '5 minutes' WHERE id = $1",
        [challengeId, String(telegramUserId), sha256(code)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    request.log.error(error);
    client.release();
    return reply.code(500).send({ error: "Challenge processing failed" });
  }
  client.release();
  if (challengeId) {
    const botMessage = [
      "⚠️ <b>БЕЗОПАСНОСТЬ АККАУНТА RATEIT</b>",
      "",
      "• Никому не сообщай этот код — даже людям, представляющимся администрацией RATEIT.",
      "• Сотрудники RATEIT никогда не запрашивают код авторизации.",
      "• Передача, продажа, покупка и аренда аккаунтов запрещены правилами RATEIT.",
      "• За подтверждённую продажу или передачу аккаунта предусмотрена блокировка, вплоть до перманентного бана.",
      "",
      "🔐 <b>ТВОЙ КОД ВХОДА: " + code + "</b>",
      "",
      "Код одноразовый и действует 5 минут. Если ты не запрашивал вход, просто проигнорируй это сообщение."
    ].join("\\n");
    try {
      await sendTelegramMessage(chatId, botMessage);
    } catch (error) {
      request.log.error(error);
      await dbPool.query("UPDATE telegram_auth_challenges SET code_hash = NULL, telegram_user_id = NULL WHERE id = $1 AND consumed_at IS NULL", [challengeId]);
      return reply.code(502).send({ error: "Не удалось отправить код в Telegram." });
    }
  } else {
    await sendTelegramMessage(chatId, "Этот запрос RATEIT уже недействителен. Вернись на сайт и запроси новый код.");
  }
  return { ok: true };
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
