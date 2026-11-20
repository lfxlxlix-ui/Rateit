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
    "SELECT u.id,u.nickname,u.login_name,u.email,u.standoff2_id,ps.elo,ps.level,ps.verified_hours,ps.matches_played,ps.wins,ps.losses,ps.kills,ps.deaths FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN player_stats ps ON ps.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [sha256(token)]
  );
  if (!result.rowCount) return null;
  await dbPool.query("UPDATE auth_sessions SET last_used_at=now() WHERE token_hash=$1", [sha256(token)]);
  return result.rows[0];
}

app.post<{ Body: { nickname?: string; loginName?: string; email?: string; password?: string; telegramRegistrationToken?: string } }>("/api/v1/auth/register", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "Сервис аккаунтов временно недоступен." });
  const nickname = request.body?.nickname?.trim().replace(/\s+/g," ");
  const loginName = request.body?.loginName?.trim();
  const email = request.body?.email?.trim().toLowerCase();
  const password = request.body?.password;
  const telegramRegistrationToken = request.body?.telegramRegistrationToken;
  if (!nickname || nickname.length > 24 || !loginName || !/^[a-zA-Z0-9_]{3,24}$/.test(loginName) || !email || email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !password || password.length < 8 || password.length > 128) {
    return reply.code(400).send({ error: "Проверь ник, логин (3–24 символа: латиница, цифры, _), почту и пароль (8–128 символов)." });
  }
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query("INSERT INTO users(nickname,login_name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id", [nickname,loginName,email,await passwordHash(password)]);
    const userId = user.rows[0].id as string;
    if (telegramRegistrationToken) {
      const ticket = await client.query(
        "SELECT telegram_user_id FROM telegram_registration_tickets WHERE token_hash=$1 AND expires_at>now() AND consumed_at IS NULL FOR UPDATE",
        [sha256(telegramRegistrationToken)]
      );
      if (!ticket.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "Подтверждение Telegram истекло. Повтори вход через Telegram." });
      }
      await client.query("INSERT INTO auth_identities(user_id,provider,provider_user_id) VALUES($1,'telegram',$2)", [userId, ticket.rows[0].telegram_user_id]);
      await client.query("UPDATE telegram_registration_tickets SET consumed_at=now() WHERE token_hash=$1", [sha256(telegramRegistrationToken)]);
    }
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


app.patch<{ Body: { nickname?: string; standoff2Id?: string; hours?: number } }>("/api/v1/profile", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({ error: "База данных недоступна." });
  const user = await authenticatedUser(request);
  if (!user) return reply.code(401).send({ error: "Войди в аккаунт RATEIT." });
  const nickname = request.body?.nickname?.trim().replace(/\s+/g, " ");
  const standoff2Id = request.body?.standoff2Id?.trim();
  const hours = request.body?.hours;
  if (hours !== undefined && (!Number.isInteger(hours) || hours < 0 || hours > 100000)) return reply.code(400).send({ error: "Укажи целое количество часов от 0 до 100000." });
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
    if (hours !== undefined) await dbPool.query("UPDATE player_stats SET verified_hours=$1,updated_at=now() WHERE user_id=$2", [hours,user.id]);
    return { user: { ...updated.rows[0], verified_hours: hours ?? user.verified_hours }, standoff2IdLocked: Boolean(updated.rows[0].standoff2_id) };
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") return reply.code(409).send({ error: "Этот Standoff 2 ID уже используется другим аккаунтом RATEIT." });
    if (pgError.code === "23514") return reply.code(409).send({ error: "Standoff 2 ID нельзя изменить после привязки." });
    request.log.error(error);
    return reply.code(500).send({ error: "Не удалось сохранить профиль." });
  }
});





app.post<{Body:{mode?:"2x2"|"5x5"}}>("/api/v1/matchmaking/queue/join",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const mode=request.body?.mode;
  if(mode!=="2x2"&&mode!=="5x5")return reply.code(400).send({error:"Выбери режим 2×2 или 5×5."});
  const profile=await dbPool.query("SELECT u.standoff2_id,ps.verified_hours,ps.elo FROM users u JOIN player_stats ps ON ps.user_id=u.id WHERE u.id=$1",[user.id]);
  if(!profile.rowCount||!profile.rows[0].standoff2_id)return reply.code(409).send({error:"Сначала привяжи Standoff 2 ID в профиле. Он используется один раз и не меняется."});
  if(profile.rows[0].verified_hours===null)return reply.code(409).send({error:"Укажи игровые часы в профиле — подбор учитывает разницу не более 50 часов."});
  const activeParty=await dbPool.query("SELECT 1 FROM party_members WHERE user_id=$1 AND left_at IS NULL",[user.id]);
  if(activeParty.rowCount)return reply.code(409).send({error:"Для первой версии очереди выйди из пати. Подбор группами добавим следующим этапом."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`rateit_matchmaking_${mode}`]);
    await client.query(
      "INSERT INTO matchmaking_queue(user_id,mode,hours,elo) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET mode=EXCLUDED.mode,hours=EXCLUDED.hours,elo=EXCLUDED.elo,joined_at=now()",
      [user.id,mode,profile.rows[0].verified_hours,profile.rows[0].elo]
    );
    const queued=await client.query("SELECT user_id,hours,elo,joined_at FROM matchmaking_queue WHERE mode=$1 ORDER BY joined_at FOR UPDATE",[mode]);
    const needed=mode==="2x2"?4:10;
    let selected:any[]=[];
    for(const candidate of queued.rows){
      const next=[...selected,candidate];
      const hours=next.map((p:any)=>Number(p.hours));
      if(hours.length===1||Math.max(...hours)-Math.min(...hours)<=50)selected=next;
      if(selected.length===needed)break;
    }
    if(selected.length<needed){
      await client.query("COMMIT");
      return {status:"searching",mode,playersFound:selected.length,playersNeeded:needed, maxHoursDifference:50};
    }
    const sorted=[...selected].sort((a:any,b:any)=>Number(b.elo)-Number(a.elo));
    const teamOne=needed===4?new Set([0,3]):new Set([0,3,4,7,8]);
    const match=await client.query("INSERT INTO matches(mode,status) VALUES($1,'ready') RETURNING id",[mode]);
    const matchId=match.rows[0].id as string;
    for(let i=0;i<sorted.length;i++){
      const player=sorted[i];
      const team=teamOne.has(i)?1:2;
      await client.query("INSERT INTO match_players(match_id,user_id,team,elo_before) VALUES($1,$2,$3,$4)",[matchId,player.user_id,team,player.elo]);
      await client.query("INSERT INTO match_ready_checks(match_id,user_id,status) VALUES($1,$2,'pending')",[matchId,player.user_id]);
      await client.query("DELETE FROM matchmaking_queue WHERE user_id=$1",[player.user_id]);
    }
    const players=await client.query("SELECT mp.user_id,mp.team,u.nickname,mp.elo_before AS elo FROM match_players mp JOIN users u ON u.id=mp.user_id WHERE mp.match_id=$1 ORDER BY mp.team,mp.elo_before DESC",[matchId]);
    await client.query("COMMIT");
    return {status:"found",matchId,mode,players,readySeconds:30};
  }catch(error){
    await client.query("ROLLBACK");request.log.error(error);return reply.code(500).send({error:"Не удалось выполнить подбор."});
  }finally{client.release();}
});

app.get("/api/v1/matchmaking/queue/status",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const queued=await dbPool.query("SELECT mode,joined_at,(SELECT count(*) FROM matchmaking_queue q2 WHERE q2.mode=matchmaking_queue.mode)::int AS players_found FROM matchmaking_queue WHERE user_id=$1",[user.id]);
  if(queued.rowCount)return {status:"searching",mode:queued.rows[0].mode,joinedAt:queued.rows[0].joined_at,playersFound:queued.rows[0].players_found,playersNeeded:queued.rows[0].mode==="2x2"?4:10};
  await dbPool.query(
    `UPDATE matches SET status='cancelled' WHERE status='ready' AND created_at<now()-interval '30 seconds'
     AND id IN (SELECT match_id FROM match_players WHERE user_id=$1)`,
    [user.id]
  );
  await dbPool.query(
    `UPDATE match_ready_checks SET status='expired',responded_at=now()
     WHERE user_id=$1 AND status='pending' AND match_id IN (SELECT id FROM matches WHERE status='cancelled')`,
    [user.id]
  );
  const match=await dbPool.query(
    `SELECT m.id,m.mode,m.status,rc.status AS ready_status,m.created_at
     FROM match_players mp JOIN matches m ON m.id=mp.match_id
     LEFT JOIN match_ready_checks rc ON rc.match_id=m.id AND rc.user_id=mp.user_id
     WHERE mp.user_id=$1 AND m.status IN ('ready','in_progress')
     ORDER BY m.created_at DESC LIMIT 1`,
    [user.id]
  );
  if(match.rowCount)return {status:match.rows[0].status==="ready"?"found":"in_progress",match:match.rows[0]};
  return {status:"idle"};
});


app.get<{Params:{matchId:string}}>("/api/v1/matches/:matchId",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const match=await dbPool.query("SELECT id,mode,status,created_at,map_name FROM matches WHERE id=$1",[request.params.matchId]);
  if(!match.rowCount)return reply.code(404).send({error:"Матч не найден."});
  const roster=await dbPool.query(
    `SELECT mp.user_id,u.nickname,mp.team,mp.elo_before AS elo,rc.status AS ready_status
     FROM match_players mp JOIN users u ON u.id=mp.user_id
     LEFT JOIN match_ready_checks rc ON rc.match_id=mp.match_id AND rc.user_id=mp.user_id
     WHERE mp.match_id=$1 ORDER BY mp.team,mp.elo_before DESC`,
    [request.params.matchId]
  );
  const own=roster.rows.find((player:any)=>player.user_id===user.id);
  if(!own)return reply.code(403).send({error:"Ты не участвуешь в этом матче."});
  const pending=roster.rows.filter((player:any)=>player.ready_status==="pending").length;
  return {match:match.rows[0],players:roster.rows,readyCount:roster.rows.length-pending,pendingCount:pending,myReadyStatus:own.ready_status};
});


app.post<{Params:{matchId:string}}>("/api/v1/matches/:matchId/decline",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const own=await client.query("UPDATE match_ready_checks SET status='declined',responded_at=now() WHERE match_id=$1 AND user_id=$2 AND status='pending' RETURNING user_id",[request.params.matchId,user.id]);
    if(!own.rowCount){await client.query("ROLLBACK");return reply.code(404).send({error:"Нет ожидающего подтверждения для этого матча."});}
    await client.query("UPDATE matches SET status='cancelled' WHERE id=$1 AND status='ready'",[request.params.matchId]);
    await client.query("UPDATE match_ready_checks SET status='expired',responded_at=now() WHERE match_id=$1 AND status='pending'",[request.params.matchId]);
    await client.query("COMMIT");
    return {ok:true,message:"Ты отклонил матч. Можно вернуться в очередь позже."};
  }catch(error){await client.query("ROLLBACK");request.log.error(error);return reply.code(500).send({error:"Не удалось отклонить матч."});}
  finally{client.release();}
});

app.post("/api/v1/matchmaking/queue/cancel",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  await dbPool.query("DELETE FROM matchmaking_queue WHERE user_id=$1",[user.id]);
  return {ok:true,status:"idle"};
});


const RATEIT_MAP_POOL=["Sandstone","Province","Rust","Zone 9","Breeze","Dune","Sakura"] as const;
app.get<{Params:{matchId:string}}>("/api/v1/matches/:matchId/maps",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const match=await dbPool.query("SELECT id,status,map_name FROM matches WHERE id=$1",[request.params.matchId]);
  if(!match.rowCount)return reply.code(404).send({error:"Матч не найден."});
  const own=await dbPool.query("SELECT team FROM match_players WHERE match_id=$1 AND user_id=$2",[request.params.matchId,user.id]);
  if(!own.rowCount)return reply.code(403).send({error:"Ты не участвуешь в этом матче."});
  const bans=await dbPool.query("SELECT map_name,banned_by_user_id,ban_order FROM match_map_bans WHERE match_id=$1 ORDER BY ban_order",[request.params.matchId]);
  const nextOrder=bans.rows.length+1;
  const nextTeam=nextOrder>6?null:(nextOrder%2===1?1:2);
  const captain=nextTeam===null?null:await dbPool.query("SELECT user_id FROM match_players WHERE match_id=$1 AND team=$2 ORDER BY elo_before DESC,user_id LIMIT 1",[request.params.matchId,nextTeam]);
  return {mapPool:RATEIT_MAP_POOL,bans:bans.rows,nextOrder,nextTeam,isMyTurn:nextTeam===own.rows[0].team&&captain?.rows[0]?.user_id===user.id,remainingMap:match.rows[0].map_name,status:match.rows[0].status};
});

app.post<{Params:{matchId:string};Body:{mapName?:string}}>("/api/v1/matches/:matchId/maps/ban",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const mapName=request.body?.mapName;
  if(!mapName||!(RATEIT_MAP_POOL as readonly string[]).includes(mapName))return reply.code(400).send({error:"Выбери карту из доступного пула RATEIT."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const match=await client.query("SELECT id,status FROM matches WHERE id=$1 FOR UPDATE",[request.params.matchId]);
    if(!match.rowCount||match.rows[0].status!=="in_progress"){await client.query("ROLLBACK");return reply.code(409).send({error:"Баны карт доступны после подтверждения матча всеми игроками."});}
    const own=await client.query("SELECT team FROM match_players WHERE match_id=$1 AND user_id=$2",[request.params.matchId,user.id]);
    if(!own.rowCount){await client.query("ROLLBACK");return reply.code(403).send({error:"Ты не участник этого матча."});}
    const bans=await client.query("SELECT map_name FROM match_map_bans WHERE match_id=$1 ORDER BY ban_order",[request.params.matchId]);
    const nextOrder=bans.rows.length+1;
    if(nextOrder>6){await client.query("ROLLBACK");return reply.code(409).send({error:"Все шесть банов уже сделаны."});}
    if(bans.rows.some((ban:any)=>ban.map_name===mapName)){await client.query("ROLLBACK");return reply.code(409).send({error:"Эта карта уже забанена."});}
    const expectedTeam=nextOrder%2===1?1:2;
    if(own.rows[0].team!==expectedTeam){await client.query("ROLLBACK");return reply.code(403).send({error:"Сейчас ход другой команды."});}
    const captain=await client.query("SELECT user_id FROM match_players WHERE match_id=$1 AND team=$2 ORDER BY elo_before DESC,user_id LIMIT 1",[request.params.matchId,expectedTeam]);
    if(captain.rows[0]?.user_id!==user.id){await client.query("ROLLBACK");return reply.code(403).send({error:"Банить карту может капитан команды."});}
    await client.query("INSERT INTO match_map_bans(match_id,map_name,banned_by_user_id,ban_order) VALUES($1,$2,$3,$4)",[request.params.matchId,mapName,user.id,nextOrder]);
    const allBans=[...bans.rows.map((x:any)=>x.map_name),mapName];
    const remaining=RATEIT_MAP_POOL.filter(name=>!allBans.includes(name));
    if(allBans.length===6)await client.query("UPDATE matches SET map_name=$1 WHERE id=$2",[remaining[0],request.params.matchId]);
    await client.query("COMMIT");
    return {ok:true,banOrder:nextOrder,complete:allBans.length===6,remainingMap:allBans.length===6?remaining[0]:null};
  }catch(error){await client.query("ROLLBACK");request.log.error(error);return reply.code(500).send({error:"Не удалось забанить карту."});}
  finally{client.release();}
});

app.post<{Params:{matchId:string}}>("/api/v1/matches/:matchId/ready",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const match=await client.query("SELECT id,status,created_at FROM matches WHERE id=$1 FOR UPDATE",[request.params.matchId]);
    if(!match.rowCount||match.rows[0].status!=="ready"){await client.query("ROLLBACK");return reply.code(404).send({error:"Матч больше не ожидает подтверждения."});}
    if(Date.now()-new Date(match.rows[0].created_at).getTime()>30000){
      await client.query("UPDATE matches SET status='cancelled' WHERE id=$1",[request.params.matchId]);
      await client.query("UPDATE match_ready_checks SET status='expired',responded_at=now() WHERE match_id=$1 AND status='pending'",[request.params.matchId]);
      await client.query("COMMIT");
      return reply.code(410).send({error:"Время подтверждения матча истекло. Вернись в очередь."});
    }
    const own=await client.query("UPDATE match_ready_checks SET status='accepted',responded_at=now() WHERE match_id=$1 AND user_id=$2 AND status='pending' RETURNING user_id",[request.params.matchId,user.id]);
    if(!own.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"Ты уже подтвердил матч или не участвуешь в нём."});}
    const pending=await client.query("SELECT count(*)::int AS total FROM match_ready_checks WHERE match_id=$1 AND status='pending'",[request.params.matchId]);
    if(pending.rows[0].total===0)await client.query("UPDATE matches SET status='in_progress' WHERE id=$1",[request.params.matchId]);
    await client.query("COMMIT");
    return {ok:true,allReady:pending.rows[0].total===0};
  }catch(error){await client.query("ROLLBACK");request.log.error(error);return reply.code(500).send({error:"Не удалось подтвердить матч."});}
  finally{client.release();}
});

app.get("/api/v1/leaderboard",async()=>{
  if(!dbPool)return {players:[]};
  const result=await dbPool.query(
    `SELECT ranked.id,ranked.nickname,ranked.elo,ranked.level,ranked.matches_played,ranked.wins,ranked.losses,ranked.position,
            CASE WHEN ranked.position<=1000 THEN true ELSE false END AS challenger
     FROM (
       SELECT u.id,u.nickname,COALESCE(ps.elo,751) AS elo,COALESCE(ps.level,3) AS level,
              COALESCE(ps.matches_played,0) AS matches_played,COALESCE(ps.wins,0) AS wins,COALESCE(ps.losses,0) AS losses,
              row_number() OVER(ORDER BY COALESCE(ps.elo,751) DESC,COALESCE(ps.wins,0) DESC,u.created_at ASC) AS position
       FROM users u LEFT JOIN player_stats ps ON ps.user_id=u.id
     ) ranked
     ORDER BY ranked.position LIMIT 100`
  );
  return {players:result.rows};
});

app.get("/api/v1/matches/history",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const result=await dbPool.query(
    `SELECT m.id,m.mode,m.map_name,m.team_a_score,m.team_b_score,m.winner_team,m.completed_at,
            mp.team,mp.elo_before,mp.elo_change,mp.kills,mp.deaths,
            CASE WHEN m.winner_team=mp.team THEN 'win'
                 WHEN m.winner_team IS NULL THEN 'draw' ELSE 'loss' END AS result
     FROM match_players mp JOIN matches m ON m.id=mp.match_id
     WHERE mp.user_id=$1 AND m.status='completed'
     ORDER BY m.completed_at DESC NULLS LAST,m.created_at DESC LIMIT 50`,
    [user.id]
  );
  return {matches:result.rows};
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


app.get("/api/v1/party", async (request, reply) => {
  if (!dbPool) return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if (!user) return reply.code(401).send({error:"Войди в RATEIT."});
  const [membership, invites]=await Promise.all([
    dbPool.query(
      `SELECT p.id,p.leader_user_id,p.status,p.max_members,
              pm.role, u.id AS member_id,u.nickname,COALESCE(ps.elo,751) AS elo
       FROM party_members mine
       JOIN parties p ON p.id=mine.party_id
       JOIN party_members pm ON pm.party_id=p.id AND pm.left_at IS NULL
       JOIN users u ON u.id=pm.user_id
       LEFT JOIN player_stats ps ON ps.user_id=u.id
       WHERE mine.user_id=$1 AND mine.left_at IS NULL AND p.status='open'
       ORDER BY pm.joined_at`,
      [user.id]
    ),
    dbPool.query(
      `SELECT i.id AS invite_id,i.party_id,i.expires_at,u.nickname AS inviter_nickname,
              p.max_members, (SELECT count(*) FROM party_members pm WHERE pm.party_id=p.id AND pm.left_at IS NULL) AS member_count
       FROM party_invites i JOIN users u ON u.id=i.invited_by JOIN parties p ON p.id=i.party_id
       WHERE i.invitee_user_id=$1 AND i.status='pending' AND i.expires_at>now() AND p.status='open'
       ORDER BY i.created_at DESC`,
      [user.id]
    )
  ]);
  const members=membership.rows;
  return {
    party: members.length ? {id:members[0].id,leaderUserId:members[0].leader_user_id,maxMembers:members[0].max_members,members:members.map((m:any)=>({id:m.member_id,nickname:m.nickname,elo:m.elo,role:m.role}))} : null,
    invites: invites.rows
  };
});

app.post<{Body:{maxMembers?:2|5}}>("/api/v1/party/create", async (request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const maxMembers=request.body?.maxMembers;
  if(maxMembers!==2&&maxMembers!==5)return reply.code(400).send({error:"Размер пати может быть 2 или 5 игроков."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const active=await client.query("SELECT party_id FROM party_members WHERE user_id=$1 AND left_at IS NULL FOR UPDATE",[user.id]);
    if(active.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"Ты уже состоишь в активной пати."});}
    const created=await client.query("INSERT INTO parties(leader_user_id,max_members) VALUES($1,$2) RETURNING id",[user.id,maxMembers]);
    await client.query("INSERT INTO party_members(party_id,user_id,role) VALUES($1,$2,'leader')",[created.rows[0].id,user.id]);
    await client.query("COMMIT");
    return reply.code(201).send({partyId:created.rows[0].id,maxMembers});
  }catch(error){
    await client.query("ROLLBACK");
    const pgError=error as {code?:string};
    if(pgError.code==="23505")return reply.code(409).send({error:"Ты уже состоишь в активной пати."});
    request.log.error(error);return reply.code(500).send({error:"Не удалось создать пати."});
  }finally{client.release();}
});

app.post<{Body:{userId?:string}}>("/api/v1/party/invite",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const inviteeId=request.body?.userId;
  if(!inviteeId||inviteeId===user.id)return reply.code(400).send({error:"Выбери друга для приглашения."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const own=await client.query(
      "SELECT p.id,p.max_members FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.user_id=$1 AND pm.left_at IS NULL AND pm.role='leader' AND p.status='open' FOR UPDATE",
      [user.id]
    );
    if(!own.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"Сначала создай пати. Приглашать может лидер."});}
    const party=own.rows[0];
    const friendship=await client.query("SELECT 1 FROM friendships WHERE status='accepted' AND ((user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1))",[user.id,inviteeId]);
    if(!friendship.rowCount){await client.query("ROLLBACK");return reply.code(403).send({error:"Приглашать в пати можно только друзей RATEIT."});}
    const active=await client.query("SELECT 1 FROM party_members WHERE user_id=$1 AND left_at IS NULL",[inviteeId]);
    if(active.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"Игрок уже состоит в пати."});}
    const count=await client.query("SELECT count(*)::int AS total FROM party_members WHERE party_id=$1 AND left_at IS NULL",[party.id]);
    if(count.rows[0].total>=party.max_members){await client.query("ROLLBACK");return reply.code(409).send({error:"В пати больше нет свободных мест."});}
    await client.query("INSERT INTO party_invites(party_id,invited_by,invitee_user_id) VALUES($1,$2,$3)",[party.id,user.id,inviteeId]);
    await client.query("COMMIT");
    return {ok:true,message:"Приглашение отправлено."};
  }catch(error){
    await client.query("ROLLBACK");
    const pgError=error as {code?:string};
    if(pgError.code==="23505")return reply.code(409).send({error:"Приглашение уже отправлено."});
    request.log.error(error);return reply.code(500).send({error:"Не удалось отправить приглашение."});
  }finally{client.release();}
});

app.post<{Body:{inviteId?:string;action?:"accept"|"decline"}}>("/api/v1/party/respond",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const {inviteId,action}=request.body??{};
  if(!inviteId||!(action==="accept"||action==="decline"))return reply.code(400).send({error:"Некорректный ответ на приглашение."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const invite=await client.query(
      "SELECT i.id,i.party_id,i.expires_at,p.status AS party_status,p.max_members FROM party_invites i JOIN parties p ON p.id=i.party_id WHERE i.id=$1 AND i.invitee_user_id=$2 AND i.status='pending' FOR UPDATE",
      [inviteId,user.id]
    );
    if(!invite.rowCount||new Date(invite.rows[0].expires_at).getTime()<Date.now()||invite.rows[0].party_status!=="open"){
      await client.query("UPDATE party_invites SET status='expired',responded_at=now() WHERE id=$1 AND invitee_user_id=$2 AND status='pending'",[inviteId,user.id]);
      await client.query("COMMIT");return reply.code(410).send({error:"Приглашение истекло или пати закрыта."});
    }
    if(action==="decline"){
      await client.query("UPDATE party_invites SET status='declined',responded_at=now() WHERE id=$1",[inviteId]);
      await client.query("COMMIT");return {ok:true};
    }
    const active=await client.query("SELECT 1 FROM party_members WHERE user_id=$1 AND left_at IS NULL",[user.id]);
    if(active.rowCount){await client.query("ROLLBACK");return reply.code(409).send({error:"Сначала выйди из текущей пати."});}
    const count=await client.query("SELECT count(*)::int AS total FROM party_members WHERE party_id=$1 AND left_at IS NULL",[invite.rows[0].party_id]);
    if(count.rows[0].total>=invite.rows[0].max_members){await client.query("ROLLBACK");return reply.code(409).send({error:"В пати больше нет свободных мест."});}
    await client.query("INSERT INTO party_members(party_id,user_id,role) VALUES($1,$2,'member')",[invite.rows[0].party_id,user.id]);
    await client.query("UPDATE party_invites SET status='accepted',responded_at=now() WHERE id=$1",[inviteId]);
    await client.query("COMMIT");return {ok:true,message:"Ты вступил в пати."};
  }catch(error){
    await client.query("ROLLBACK");
    const pgError=error as {code?:string};
    if(pgError.code==="23505")return reply.code(409).send({error:"Ты уже состоишь в активной пати."});
    request.log.error(error);return reply.code(500).send({error:"Не удалось обработать приглашение."});
  }finally{client.release();}
});

app.post("/api/v1/party/leave",async(request,reply)=>{
  if(!dbPool)return reply.code(503).send({error:"База данных недоступна."});
  const user=await authenticatedUser(request);
  if(!user)return reply.code(401).send({error:"Войди в RATEIT."});
  const client=await dbPool.connect();
  try{
    await client.query("BEGIN");
    const membership=await client.query(
      "SELECT p.id,pm.role FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.user_id=$1 AND pm.left_at IS NULL AND p.status='open' FOR UPDATE",
      [user.id]
    );
    if(!membership.rowCount){await client.query("ROLLBACK");return reply.code(404).send({error:"Ты сейчас не состоишь в пати."});}
    const {id,role}=membership.rows[0];
    if(role==="leader"){
      await client.query("UPDATE parties SET status='closed',updated_at=now() WHERE id=$1",[id]);
      await client.query("UPDATE party_members SET left_at=now() WHERE party_id=$1 AND left_at IS NULL",[id]);
      await client.query("UPDATE party_invites SET status='expired',responded_at=now() WHERE party_id=$1 AND status='pending'",[id]);
    }else{
      await client.query("UPDATE party_members SET left_at=now() WHERE party_id=$1 AND user_id=$2",[id,user.id]);
    }
    await client.query("COMMIT");return {ok:true,message:role==="leader"?"Пати закрыта.":"Ты вышел из пати."};
  }catch(error){await client.query("ROLLBACK");request.log.error(error);return reply.code(500).send({error:"Не удалось выйти из пати."});}
  finally{client.release();}
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
  if (!challengeId || !/^[0-9a-f-]{36}$/i.test(challengeId) || !code || !/^\d{6}$/.test(code)) {
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
      const existing = await client.query(
        "SELECT u.id,u.nickname,u.login_name,u.email FROM auth_identities ai JOIN users u ON u.id=ai.user_id WHERE ai.provider='telegram' AND ai.provider_user_id=$1",
        [telegramId]
      );
      if (!existing.rowCount) {
        const registrationToken = randomBytes(32).toString("base64url");
        await client.query(
          "INSERT INTO telegram_registration_tickets(telegram_user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes') ON CONFLICT (telegram_user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,consumed_at=NULL",
          [telegramId, sha256(registrationToken)]
        );
        await client.query("COMMIT");
        return { verified:true, accountExists:false, registrationToken, nextStep:"registration", message:"Telegram подтверждён. Заверши регистрацию RATEIT." };
      }
      userId = existing.rows[0].id;
    }
    const token = randomBytes(32).toString("base64url");
    await client.query("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')", [userId,sha256(token)]);
    const profile = await client.query("SELECT id,nickname,login_name,email FROM users WHERE id=$1", [userId]);
    await client.query("COMMIT");
    return {
      verified: true,
      token,
      user: challenge.purpose === "link" ? profile.rows[0] : (await client.query("SELECT id,nickname,login_name,email FROM users WHERE id=$1", [userId])).rows[0],
      accountExists: true,
      nextStep: challenge.purpose === "link" ? "telegram_linked" : "confirm_account",
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
    // Telegram renders inline <code> as a tappable copyable code block.
    // Keep the message to the code only, as requested.
    const botMessage = `<code>${code}</code>`;
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
