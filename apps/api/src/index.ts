import Fastify from "fastify";
import { createHash, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
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



const scrypt = promisify(scryptCallback);
const passwordHash = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
};
const passwordMatches = async (password: string, stored: string) => {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const derived = await scrypt(password, parts[1], 64) as Buffer;
  const expected = Buffer.from(parts[2], "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
};
const bearerToken = (request: { headers: { authorization?: string } }) => {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
};
async function createSession(userId: string) {
  if (!dbPool) throw new Error("Database unavailable");
  const token = randomBytes(32).toString("base64url");
  await dbPool.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')", [userId, sha256(token)]);
  return token;
}
async function authenticatedUser(request: { headers: { authorization?: string } }) {
  if (!dbPool) return null;
  const token = bearerToken(request);
  if (!token || token.length > 128) return null;
  const result = await dbPool.query(
    "SELECT u.id,u.nickname,u.login_name,u.email,u.standoff2_id,ps.elo,ps.level,ps.verified_hours FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN player_stats ps ON ps.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [sha256(token)]
  );
  if (!result.rowCount) return null;
  await dbPool.query("UPDATE auth_sessions SET last_used_at=now() WHERE token_hash=$1", [sha256(token)]);
  return result.rows[0];
}

app.post<{ Body: { nickname?: string; loginName?: string; email?: string; password?: string } }>("/api/v1/auth/register", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "Сервис аккаунтов временно недоступен." });
  const nickname = request.body?.nickname?.trim().replace(/\\s+/g," ");
  const loginName = request.body?.loginName?.trim();
  const email = request.body?.email?.trim().toLowerCase();
  const password = request.body?.password;
  if (!nickname || nickname.length > 24 || !loginName || !/^[a-zA-Z0-9_]{3,24}$/.test(loginName) || !email || email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !password || password.length < 8 || password.length > 128) {
    return reply.code(400).send({ error: "Проверь ник, логин (3–24 символа: латиница, цифры, _), почту и пароль (8–128 символов)." });
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("INSERT INTO users(nickname,login_name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id", [nickname,loginName,email,await passwordHash(password)]);
    const userId = user.rows[0].id as string;
    await client.query("INSERT INTO player_stats(user_id,elo,level) VALUES($1,751,3)",[userId]);
    await client.query("INSERT INTO auth_identities(user_id,provider,provider_user_id) VALUES($1,'email',$2)",[userId,email]);
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')",[userId,sha256(token)]);
    await client.query("COMMIT");
    return reply.code(201).send({ token, user:{id:userId,nickname,loginName,email,elo:751,level:3} });
  } catch (error) {
    await client.query("ROLLBACK");
    const pgError = error as { code?: string };
    if (pgError.code === "23505") return reply.code(409).send({ error: "Этот логин или адрес почты уже зарегистрирован." });
    request.log.error(error);
    return reply.code(500).send({ error: "Не удалось создать аккаунт." });
  } finally { client.release(); }
});

app.post<{ Body: { identifier?: string; password?: string } }>("/api/v1/auth/login", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "Сервис аккаунтов временно недоступен." });
  const identifier = request.body?.identifier?.trim();
  const password = request.body?.password;
  if (!identifier || !password) return reply.code(400).send({ error: "Укажи логин или почту и пароль." });
  const result = await dbPool.query("SELECT id,nickname,login_name,email,password_hash FROM users WHERE lower(login_name)=lower($1) OR lower(email)=lower($1) LIMIT 1",[identifier]);
  const user = result.rows[0];
  if (!user || !user.password_hash || !(await passwordMatches(password,user.password_hash))) return reply.code(401).send({ error: "Неверный логин, почта или пароль." });
  const token = await createSession(user.id);
  return { token,user:{id:user.id,nickname:user.nickname,loginName:user.login_name,email:user.email} };
});

app.get("/api/v1/auth/me", async (request, reply) => {
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error: "Войди в аккаунт RATEIT." });
  return { user };
});

app.post("/api/v1/auth/logout", async (request, reply) => {
  const token = bearerToken(request);
  if (token && dbPool) await dbPool.query("DELETE FROM auth_sessions WHERE token_hash=$1",[sha256(token)]);
  return { ok:true };
});

app.post<{ Body: { currentPassword?: string; newPassword?: string } }>("/api/v1/auth/password", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error:"База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error:"Войди в аккаунт RATEIT." });
  const currentPassword=request.body?.currentPassword, newPassword=request.body?.newPassword;
  const found=await dbPool.query("SELECT password_hash FROM users WHERE id=$1",[user.id]);
  if (!currentPassword || !found.rows[0]?.password_hash || !(await passwordMatches(currentPassword,found.rows[0].password_hash))) return reply.code(400).send({error:"Текущий пароль неверен."});
  if (!newPassword || newPassword.length<8 || newPassword.length>128) return reply.code(400).send({error:"Новый пароль должен содержать 8–128 символов."});
  await dbPool.query("UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",[await passwordHash(newPassword),user.id]);
  await dbPool.query("DELETE FROM auth_sessions WHERE user_id=$1 AND token_hash<>$2",[user.id,sha256(bearerToken(request) ?? "")]);
  return {ok:true,message:"Пароль изменён. Другие сессии завершены."};
});


app.patch<{ Body: { nickname?: string; standoff2Id?: string } }>("/api/v1/profile", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error: "Войди в аккаунт RATEIT." });
  const nickname = request.body?.nickname?.trim().replace(/\\s+/g, " ");
  const standoff2Id = request.body?.standoff2Id?.trim();
  if (nickname !== undefined && (!nickname || nickname.length > 24 || /[\\u0000-\\u001f\\u007f]/.test(nickname))) {
    return reply.code(400).send({ error: "Ник должен содержать от 1 до 24 символов." });
  }
  if (standoff2Id !== undefined && (!standoff2Id || standoff2Id.length > 64 || /[\\u0000-\\u001f\\u007f]/.test(standoff2Id))) {
    return reply.code(400).send({ error: "Укажи корректный Standoff 2 ID." });
  }
  try {
    const current = await dbPool.query("SELECT standoff2_id FROM users WHERE id=$1", [user.id]);
    const currentId = current.rows[0]?.standoff2_id as string | null | undefined;
    if (standoff2Id !== undefined && currentId && currentId !== standoff2Id) {
      return reply.code(409).send({ error: "Standoff 2 ID нельзя изменить после привязки." });
    }
    if (standoff2Id !== undefined && !currentId) {
      const duplicate = await dbPool.query("SELECT id FROM users WHERE standoff2_id=$1 AND id<>$2", [standoff2Id, user.id]);
      if (duplicate.rowCount) return reply.code(409).send({ error: "Этот Standoff 2 ID уже используется другим аккаунтом RATEIT." });
    }
    const updated = await dbPool.query(
      "UPDATE users SET nickname=COALESCE($1,nickname), standoff2_id=COALESCE(standoff2_id,$2), updated_at=now() WHERE id=$3 RETURNING id,nickname,login_name,email,standoff2_id",
      [nickname ?? null, standoff2Id ?? null, user.id]
    );
    return { user: updated.rows[0], standoff2IdLocked: Boolean(updated.rows[0].standoff2_id) };
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") return reply.code(409).send({ error: "Этот Standoff 2 ID уже используется другим аккаунтом RATEIT." });
    if (pgError.code === "23514") return reply.code(409).send({ error: "Standoff 2 ID нельзя изменить после привязки." });
    request.log.error(error);
    return reply.code(500).send({ error: "Не удалось сохранить профиль." });
  }
});


app.get("/api/v1/friends", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error: "Войди в RATEIT." });
  const result = await dbPool.query(
    `SELECT DISTINCT ON (u.id) f.user_id AS relation_user_id, f.friend_id AS other_id, f.status,
            u.id, u.nickname, COALESCE(ps.elo,751) AS elo,
            CASE WHEN f.user_id=$1 THEN 'outgoing' ELSE 'incoming' END AS direction
     FROM friendships f
     JOIN users u ON u.id=CASE WHEN f.user_id=$1 THEN f.friend_id ELSE f.user_id END
     LEFT JOIN player_stats ps ON ps.user_id=u.id
     WHERE (f.user_id=$1 OR f.friend_id=$1) AND f.status IN ('pending','accepted')
     ORDER BY u.id, CASE WHEN f.status='accepted' THEN 0 ELSE 1 END, lower(u.nickname)`,
    [user.id]
  );
  return { friends: result.rows };
});

app.post<{ Body: { nickname?: string } }>("/api/v1/friends/request", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error: "Войди в RATEIT." });
  const nickname = request.body?.nickname?.trim();
  if (!nickname || nickname.length > 24) return reply.code(400).send({ error: "Укажи ник игрока." });
  const target = await dbPool.query("SELECT id,nickname FROM users WHERE lower(nickname)=lower($1) AND id<>$2 LIMIT 1", [nickname,user.id]);
  if (!target.rowCount) return reply.code(404).send({ error: "Игрок с таким ником не найден." });
  const friendId = target.rows[0].id as string;
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT user_id,friend_id,status FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) FOR UPDATE",
      [user.id,friendId]
    );
    if (existing.rows.some((row:any)=>row.status==="accepted")) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "Вы уже друзья." });
    }
    const reverse = existing.rows.find((row:any)=>row.user_id===friendId && row.friend_id===user.id && row.status==="pending");
    if (reverse) {
      await client.query("UPDATE friendships SET status='accepted' WHERE user_id=$1 AND friend_id=$2",[friendId,user.id]);
      await client.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted'",[user.id,friendId]);
      await client.query("COMMIT");
      return { status:"accepted", message:"Запрос принят. Теперь вы друзья." };
    }
    if (existing.rows.some((row:any)=>row.status==="pending")) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "Запрос дружбы уже отправлен или ожидает ответа." });
    }
    await client.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'pending')",[user.id,friendId]);
    await client.query("COMMIT");
    return reply.code(201).send({ status:"pending", message:`Запрос игроку ${target.rows[0].nickname} отправлен.` });
  } catch (error) {
    await client.query("ROLLBACK");
    request.log.error(error);
    return reply.code(500).send({ error:"Не удалось отправить запрос." });
  } finally { client.release(); }
});

app.post<{ Body: { userId?: string; action?: "accept" | "decline" } }>("/api/v1/friends/respond", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error:"База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error:"Войди в RATEIT." });
  const { userId, action } = request.body ?? {};
  if (!userId || !["accept","decline"].includes(action ?? "")) return reply.code(400).send({ error:"Некорректный запрос." });
  if (action === "decline") {
    const result=await dbPool.query("DELETE FROM friendships WHERE user_id=$1 AND friend_id=$2 AND status='pending'",[userId,user.id]);
    if (!result.rowCount) return reply.code(404).send({error:"Входящий запрос не найден."});
    return {ok:true};
  }
  const client=await dbPool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query("UPDATE friendships SET status='accepted' WHERE user_id=$1 AND friend_id=$2 AND status='pending' RETURNING user_id",[userId,user.id]);
    if (!result.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({error:"Входящий запрос не найден."}); }
    await client.query("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted'",[user.id,userId]);
    await client.query("COMMIT");
    return {ok:true};
  } catch(error) { await client.query("ROLLBACK"); request.log.error(error); return reply.code(500).send({error:"Не удалось принять запрос."}); }
  finally { client.release(); }
});

app.delete<{ Params: { userId: string } }>("/api/v1/friends/:userId", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if (!user) return reply.code(401).send({error:"Войди в RATEIT."});
  await dbPool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",[user.id,request.params.userId]);
  return {ok:true};
});

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramBotUsername = "Rateit_auth_bot";
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
  const linkedUser = purpose === "link" ? await authenticatedUser(request) : null;
  if (purpose === "link" && !linkedUser) return reply.code(401).send({ error: "Сначала войди в RATEIT, чтобы привязать Telegram." });
  const challengeId = randomUUID();
  const startToken = randomBytes(32).toString("base64url");
  try {
    await dbPool.query(
      "INSERT INTO telegram_auth_challenges (id, start_token_hash, expires_at, purpose, user_id) VALUES ($1, $2, now() + interval '10 minutes', $3, $4)",
      [challengeId, sha256(startToken), purpose, linkedUser?.id ?? null]
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
      "SELECT code_hash, telegram_user_id, expires_at, attempts, consumed_at, purpose, user_id FROM telegram_auth_challenges WHERE id = $1 FOR UPDATE",
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
    const telegramId = String(challenge.telegram_user_id);
    let userId: string;
    if (challenge.purpose === "link") {
      userId = challenge.user_id;
      const occupied = await client.query("SELECT user_id FROM auth_identities WHERE provider='telegram' AND provider_user_id=$1", [telegramId]);
      if (occupied.rowCount && occupied.rows[0].user_id !== userId) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "Этот Telegram уже привязан к другому аккаунту RATEIT." });
      }
      await client.query("INSERT INTO auth_identities(user_id,provider,provider_user_id) VALUES($1,'telegram',$2) ON CONFLICT (provider,provider_user_id) DO NOTHING", [userId, telegramId]);
    } else {
      const existing = await client.query("SELECT user_id FROM auth_identities WHERE provider='telegram' AND provider_user_id=$1", [telegramId]);
      if (existing.rowCount) {
        userId = existing.rows[0].user_id;
      } else {
        const suffix = telegramId.slice(-10);
        const created = await client.query(
          "INSERT INTO users(nickname,login_name) VALUES($1,$2) RETURNING id",
          [`Игрок ${suffix.slice(-6)}`, `tg_${suffix}`]
        );
        userId = created.rows[0].id;
        await client.query("INSERT INTO player_stats(user_id,elo,level) VALUES($1,751,3)", [userId]);
        await client.query("INSERT INTO auth_identities(user_id,provider,provider_user_id) VALUES($1,'telegram',$2)", [userId,telegramId]);
      }
    }
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')", [userId,sha256(token)]);
    const profile = await client.query("SELECT id,nickname,login_name,email FROM users WHERE id=$1", [userId]);
    await client.query("COMMIT");
    return {
      verified: true,
      token,
      user: profile.rows[0],
      nextStep: challenge.purpose === "link" ? "telegram_linked" : "signed_in",
      message: challenge.purpose === "link" ? "Telegram успешно привязан к аккаунту RATEIT." : "Вход в RATEIT через Telegram выполнен."
    };
  } catch (error) {
    await client.query("ROLLBACK");
    request.log.error(error);
    return reply.code(500).send({ error: "Не удалось проверить код." });
  } finally {
    client.release();
  }
});


async function handleTelegramMenu(chatId: number, telegramUserId: number, command: string) {
  if (!dbPool) return;
  const found = await dbPool.query(
    `SELECT u.id, u.nickname, u.standoff2_id, ps.elo, ps.level, ps.verified_hours,
            ps.matches_played, ps.wins, ps.losses, ps.kills, ps.deaths
     FROM auth_identities ai JOIN users u ON u.id = ai.user_id
     LEFT JOIN player_stats ps ON ps.user_id = u.id
     WHERE ai.provider = 'telegram' AND ai.provider_user_id = $1 LIMIT 1`,
    [String(telegramUserId)]
  );
  const keyboard = { keyboard: [[{text:"👤 Профиль"},{text:"📊 Статистика"}],[{text:"⚔️ Матчи"},{text:"⚙️ Настройки"}]], resize_keyboard:true, is_persistent:true };
  if (!found.rowCount) {
    await sendTelegramMessage(chatId, "👋 <b>Добро пожаловать в RATEIT!</b>\\nТвой Telegram пока не привязан. Сначала войди на сайте RATEIT и привяжи Telegram в настройках аккаунта. После этого здесь появятся профиль, статистика и матчи.");
  } else {
    const u = found.rows[0];
    const safe = (v: unknown) => String(v ?? "—").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"} as Record<string,string>)[ch]);
    let body = "";
    if (["/start","/menu","🏠 Меню"].includes(command)) {
      body = `🎮 <b>Личный кабинет RATEIT</b>\\nПривет, <b>${safe(u.nickname)}</b>! Выбери раздел в меню.`;
    } else if (["/profile","👤 Профиль"].includes(command)) {
      body = `👤 <b>Профиль</b>\\nНик: <b>${safe(u.nickname)}</b>\\nStandoff 2 ID: ${safe(u.standoff2_id)}\\nELO: <b>${u.elo ?? 751}</b>\\nУровень: <b>${u.level ?? 3}</b>`;
    } else if (["/stats","📊 Статистика"].includes(command)) {
      const n=Number(u.matches_played??0), wins=Number(u.wins??0), deaths=Number(u.deaths??0), kills=Number(u.kills??0);
      body = `📊 <b>Статистика RATEIT</b>\\nELO: <b>${u.elo??751}</b>\\nМатчей: <b>${n}</b>\\nПобед: ${wins}\\nПоражений: ${u.losses??0}\\nWinrate: <b>${n?Math.round(wins/n*100):0}%</b>\\nУбийства / смерти: ${kills} / ${deaths}\\nK/D: <b>${deaths?(kills/deaths).toFixed(2):(kills?"∞":"—")}</b>\\nЧасы: ${safe(u.verified_hours)}`;
    } else if (["/matches","⚔️ Матчи"].includes(command)) {
      const rows=await dbPool.query(`SELECT m.map_name,m.mode,m.team_a_score,m.team_b_score,m.winner_team,mp.team FROM match_players mp JOIN matches m ON m.id=mp.match_id WHERE mp.user_id=$1 AND m.status='completed' ORDER BY m.completed_at DESC NULLS LAST LIMIT 5`,[u.id]);
      body = rows.rowCount ? "⚔️ <b>Последние матчи</b>\\n"+rows.rows.map((m,i)=>`${i+1}. ${safe(m.map_name)} · ${m.mode} · ${m.team_a_score??"?"}:${m.team_b_score??"?"} · ${m.winner_team===m.team?"Победа":"Поражение"}`).join("\\n") : "⚔️ <b>История матчей</b>\\nЗавершённых матчей RATEIT пока нет.";
    } else if (["/settings","⚙️ Настройки"].includes(command)) {
      body = "⚙️ <b>Настройки аккаунта</b>\\nСмена пароля и управление привязками появятся в защищённом кабинете. Не отправляй пароль боту сообщением.";
    } else {
      body = "Выбери раздел в меню ниже или отправь /start.";
    }
    await sendTelegramMessage(chatId, body);
  }
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text:"Меню RATEIT:",reply_markup:keyboard})});
  if (!response.ok) throw new Error(`Telegram keyboard send failed: ${response.status}`);
}

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
  if (!chatId || !telegramUserId) return { ok: true };
  const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{20,100})$/);
  if (!match) {
    try { await handleTelegramMenu(chatId, telegramUserId, text.trim()); }
    catch (error) { request.log.error(error); await sendTelegramMessage(chatId, "Не удалось открыть кабинет. Попробуй позже."); }
    return { ok: true };
  }
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
    ].join("\n");
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

if (telegramToken && telegramWebhookSecret) {
  try {
    const webhookResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `https://rateit-api-6chg.onrender.com/api/v1/webhooks/telegram`,
        secret_token: telegramWebhookSecret,
        allowed_updates: ["message"]
      })
    });
    const webhookResult = await webhookResponse.json() as { ok?: boolean; description?: string };
    if (webhookResult.ok) app.log.info("Telegram webhook configured.");
    else app.log.error({ description: webhookResult.description }, "Telegram webhook setup failed.");
  } catch (error) {
    app.log.error(error, "Telegram webhook setup request failed.");
  }
}
