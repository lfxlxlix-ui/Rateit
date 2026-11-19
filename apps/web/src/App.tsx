import { useEffect, useState, type FormEvent } from "react";

type Tab = "Главная" | "Друзья" | "Играть" | "История" | "Профиль";
const tabs: Tab[] = ["Главная", "Друзья", "Играть", "История", "Профиль"];

const demoMatches = [
  { map: "Sandstone", mode: "5×5", result: "Победа", score: "13 : 9", elo: "+24", date: "Сегодня" },
  { map: "Rust", mode: "2×2", result: "Поражение", score: "8 : 13", elo: "−17", date: "Вчера" },
  { map: "Province", mode: "5×5", result: "Победа", score: "13 : 6", elo: "+21", date: "18 ноя" }
];

type LeaderRow={id:string;nickname:string;elo:number;position:number;challenger:boolean;level:number};
function Home({ go }: { go: (tab: Tab) => void }) {
 const [leaders,setLeaders]=useState<LeaderRow[]>([]);
 const [leaderLoading,setLeaderLoading]=useState(true);
 useEffect(()=>{
  fetch("https://rateit-api-6chg.onrender.com/api/v1/leaderboard")
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error("Не удалось загрузить рейтинг.");setLeaders(data.players||[])})
   .catch(()=>setLeaders([]))
   .finally(()=>setLeaderLoading(false));
 },[]);
 return <>
  <section className="hero">
   <small>СОРЕВНОВАТЕЛЬНАЯ ПЛАТФОРМА · STANDOFF 2</small>
   <h1>ИГРАЙ.<br/><em>ПОДНИМАЙСЯ.</em></h1>
   <p>Твой рейтинг. Твои матчи. Твой путь на вершину.</p>
   <button className="primary" onClick={()=>go("Играть")}>НАЙТИ МАТЧ　↗</button>
   <button className="secondary" onClick={()=>go("Профиль")}>МОЙ ПРОФИЛЬ</button>
   <b className="watermark">R</b>
  </section>
  <section className="grid">
   <article className="card"><small>МАТЧМЕЙКИНГ</small><h2>Готов к игре?</h2><p>Выбери режим и найди игроков с близким рейтингом и игровым опытом.</p><button className="primary wide" onClick={()=>go("Играть")}>ПЕРЕЙТИ К ПОДБОРУ　→</button><small className="hint">Пока доступен тестовый режим. Реальная очередь — следующий этап.</small></article>
   <article className="card"><small>СТАРТОВЫЙ ПРОГРЕСС</small><div className="rank"><b>3</b><div><h2>Уровень 3</h2><p>Стартовый рейтинг</p></div></div><div className="elo">751 <span>ELO</span></div><div className="bar" aria-label="Прогресс до следующего уровня"><i style={{width:"0%"}}/></div><p className="between">Следующий уровень <b>149 ELO · 900</b></p></article>
  </section>
  <section className="features"><div><b>ЧЕСТНЫЙ ПОДБОР</b><span>Учитываем рейтинг и игровой опыт</span></div><div><b>ЕДИНЫЙ АККАУНТ</b><span>Android и Telegram в одном профиле</span></div><div><b>ТВОЯ СТАТИСТИКА</b><span>История матчей и прогресс ELO</span></div></section>
  <section className="home-extras"><article className="card"><small>ГЛОБАЛЬНЫЙ РЕЙТИНГ</small><h2>Таблица лидеров</h2>{leaderLoading?<p className="hint">Загружаем рейтинг…</p>:leaders.length===0?<p className="hint">Пока нет зарегистрированных игроков. Стань одним из первых!</p>:leaders.slice(0,10).map(player=><div className="leader-row" key={player.id}><b>#{player.position}</b><span>{player.nickname}{player.challenger?" · Challenger":""}</span><strong>{player.elo} ELO</strong></div>)}<p className="hint">Рейтинг формируется по ELO игроков RATEIT. Демонстрационные аккаунты не учитываются.</p></article><article className="card"><small>СЕЗОНЫ · ПЛАНИРУЮТСЯ</small><h2>Соревнуйся за место в топе</h2><p>Сезонные таблицы, турниры, награды и отдельная статистика каждого сезона — часть дорожной карты RATEIT.</p><button className="secondary wide" onClick={()=>go("Играть")}>ПЕРЕЙТИ К ТРЕНИРОВКЕ ↗</button></article></section>
 </>;
}

type QueueMatch={id:string;mode:string;status:string;created_at:string;map_name:string|null};
type QueuePlayer={user_id:string;nickname:string;team:number;elo:number;ready_status:string};
function RealQueue() {
 const [mode,setMode]=useState<"5x5"|"2x2">("5x5");
 const [status,setStatus]=useState<"idle"|"searching"|"found"|"in_progress">("idle");
 const [playersFound,setPlayersFound]=useState(0);
 const [playersNeeded,setPlayersNeeded]=useState(10);
 const [match,setMatch]=useState<QueueMatch|null>(null);
 const [players,setPlayers]=useState<QueuePlayer[]>([]);
 const [myReadyStatus,setMyReadyStatus]=useState("pending");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const apiBase="https://rateit-api-6chg.onrender.com";
 const token=()=>localStorage.getItem("rateit-session");
 const headers=()=>({authorization:`Bearer ${token()||""}`});
 const refresh=async()=>{
  const session=token();if(!session){setStatus("idle");return}
  const response=await fetch(`${apiBase}/api/v1/matchmaking/queue/status`,{headers:headers()});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось проверить очередь.");
  if(data.status==="searching"){
   setStatus("searching");setMode(data.mode);setPlayersFound(data.playersFound||0);setPlayersNeeded(data.playersNeeded|| (data.mode==="2x2"?4:10));
  }else if(data.status==="found"||data.status==="in_progress"){
   setStatus(data.status);const id=data.match?.id;if(id){setMatch(data.match);const detail=await fetch(`${apiBase}/api/v1/matches/${id}`,{headers:headers()});const matchData=await detail.json();if(detail.ok){setPlayers(matchData.players||[]);setMyReadyStatus(matchData.myReadyStatus||"pending")}}
  }else{setStatus("idle");setMatch(null);setPlayers([]);setPlayersFound(0)}
 };
 useEffect(()=>{void refresh().catch(error=>setMessage(error instanceof Error?error.message:"Ошибка очереди."))},[]);
 useEffect(()=>{
  if(status!=="searching"&&status!=="found"&&status!=="in_progress")return;
  const timer=window.setInterval(()=>{void refresh().catch(error=>setMessage(error instanceof Error?error.message:"Ошибка обновления очереди."))},4000);
  return()=>window.clearInterval(timer);
 },[status,match?.id]);
 const join=async()=>{
  if(!token()){setMessage("Сначала войди в аккаунт RATEIT.");return}
  setBusy(true);setMessage("");
  try{
   const response=await fetch(`${apiBase}/api/v1/matchmaking/queue/join`,{method:"POST",headers:{"content-type":"application/json",...headers()},body:JSON.stringify({mode})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось начать поиск.");
   if(data.status==="searching"){setStatus("searching");setPlayersFound(data.playersFound||0);setPlayersNeeded(data.playersNeeded|| (mode==="2x2"?4:10));setMessage("Ты добавлен в очередь. Ожидаем подходящих игроков.");}
   else if(data.status==="found"){setStatus("found");setMatch({id:data.matchId,mode:data.mode,status:"ready",created_at:new Date().toISOString(),map_name:null});setPlayers(data.players||[]);setMyReadyStatus("pending");setMessage("Матч найден! Подтверди участие.");}
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка поиска.")}
  finally{setBusy(false)}
 };
 const cancel=async()=>{
  setBusy(true);
  try{const response=await fetch(`${apiBase}/api/v1/matchmaking/queue/cancel`,{method:"POST",headers:headers()});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось отменить поиск.");setStatus("idle");setMatch(null);setPlayers([]);setMessage("Поиск отменён.");}
  catch(error){setMessage(error instanceof Error?error.message:"Ошибка отмены.")}
  finally{setBusy(false)}
 };
 const ready=async()=>{
  if(!match)return;setBusy(true);
  try{const response=await fetch(`${apiBase}/api/v1/matches/${match.id}/ready`,{method:"POST",headers:headers()});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось подтвердить участие.");setMyReadyStatus("accepted");setMessage(data.allReady?"Все игроки готовы. Матч перешёл в статус игры.":"Готово! Ожидаем подтверждения остальных игроков.");await refresh();}
  catch(error){setMessage(error instanceof Error?error.message:"Ошибка подтверждения.")}
  finally{setBusy(false)}
 };
 const declineMatch=async()=>{
  if(!match)return;setBusy(true);
  try{const response=await fetch(`${apiBase}/api/v1/matches/${match.id}/decline`,{method:"POST",headers:headers()});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось отклонить матч.");setStatus("idle");setMatch(null);setPlayers([]);setMessage(data.message||"Матч отклонён.");}
  catch(error){setMessage(error instanceof Error?error.message:"Ошибка отклонения матча.")}
  finally{setBusy(false)}
 };
 return <article className="card real-queue"><small>ОСНОВНОЙ РЕЖИМ · РЕАЛЬНЫЕ ИГРОКИ</small><h2>Рейтинговый матчмейкинг</h2><p>Подбор учитывает режим, ELO и разницу игровых часов не более 50. Для поиска нужен аккаунт, Standoff 2 ID и заполненные часы в профиле.</p>{status==="idle"&&<><div className="modes">{(["5x5","2x2"] as const).map(value=><button key={value} className={mode===value?"chosen":""} onClick={()=>setMode(value)}>{value==="5x5"?"5×5":"2×2"}</button>)}</div><button className="primary wide" disabled={busy} onClick={()=>void join()}>{busy?"ПОДКЛЮЧАЕМСЯ…":"НАЙТИ РЕАЛЬНЫЙ МАТЧ ↗"}</button></>}{status==="searching"&&<div className="queue-live"><div className="found-label">● ПОИСК ИДЁТ · {mode==="5x5"?"5×5":"2×2"}</div><h3>{playersFound} / {playersNeeded} игроков</h3><div className="bar"><i style={{width:`${Math.min(100,playersFound/playersNeeded*100)}%`}}/></div><p>Ищем игроков с подходящими игровыми часами (±50).</p><button className="secondary wide" disabled={busy} onClick={()=>void cancel()}>ОТМЕНИТЬ ПОИСК</button></div>}{(status==="found"||status==="in_progress")&&match&&<div className="queue-live"><div className="found-label">{status==="found"?"✓ МАТЧ НАЙДЕН":"МАТЧ ПОДТВЕРЖДЁН"}</div><h3>{match.mode==="5x5"?"Режим 5×5":"Режим 2×2"}</h3><div className="demo-teams"><div><small>КОМАНДА A</small>{players.filter(p=>p.team===1).map(p=><span key={p.user_id}>{p.nickname} · {p.elo} ELO</span>)}</div><div><small>КОМАНДА B</small>{players.filter(p=>p.team===2).map(p=><span key={p.user_id}>{p.nickname} · {p.elo} ELO</span>)}</div></div>{status==="found"&&<button className="primary wide" disabled={busy||myReadyStatus==="accepted"} onClick={()=>void ready()}>{myReadyStatus==="accepted"?"ТЫ ПОДТВЕРДИЛ УЧАСТИЕ":"ПОДТВЕРДИТЬ УЧАСТИЕ ✓"}</button>}<button className="secondary wide" disabled={busy} onClick={()=>void declineMatch()}>ОТКЛОНИТЬ МАТЧ</button>}{status==="in_progress"&&<p className="notice">Все игроки подтвердили участие. Следующий этап — выбор карты и лобби матча.</p>}<p className="hint">Готовы: {players.filter(p=>p.ready_status==="accepted").length} / {players.length}</p></div>}{message&&<p className="hint" role="status">{message}</p>}</article>;
}

function Play() {
  const [mode, setMode] = useState<"5×5" | "2×2">("5×5");
  const [stage, setStage] = useState<"setup" | "searching" | "found" | "banning" | "finished" | "lobby" | "result" | "completed">("setup");
  const [banned, setBanned] = useState<string[]>([]);
  const [botTurn, setBotTurn] = useState(false);
  const [readySeconds, setReadySeconds] = useState(30);
  const [demoScore, setDemoScore] = useState({ teamA: 13, teamB: 8 });
  const maps = ["Sandstone", "Province", "Rust", "Zone 9", "Breeze", "Dune", "Sakura"];
  const remaining = maps.filter((map) => !banned.includes(map));

  useEffect(() => {
    if (stage !== "searching") return;
    const timer = window.setTimeout(() => setStage("found"), 1400);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "found") return;
    setReadySeconds(30);
    const timer = window.setInterval(() => {
      setReadySeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setStage("setup");
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "banning" || !botTurn) return;
    const timer = window.setTimeout(() => {
      const available = maps.filter((map) => !banned.includes(map));
      if (available.length === 0) return;
      const pick = available[Math.floor(Math.random() * available.length)];
      const next = [...banned, pick];
      setBanned(next);
      setBotTurn(false);
      if (next.length >= 6) setStage("finished");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [stage, botTurn, banned]);

  const startSearch = () => {
    setBanned([]);
    setBotTurn(false);
    setStage("searching");
  };
  const cancel = () => {
    setStage("setup");
    setBanned([]);
    setBotTurn(false);
  };
  const accept = () => {
    setStage("banning");
    setBanned([]);
  };
  const banMap = (map: string) => {
    if (stage !== "banning" || botTurn || banned.includes(map)) return;
    const next = [...banned, map];
    setBanned(next);
    if (next.length >= 6) setStage("finished");
    else setBotTurn(true);
  };

  return <section className="page">
    <small>ДЕМО-МАТЧМЕЙКИНГ · БЕЗ РЕАЛЬНЫХ ИГРОКОВ</small>
    <h1 className="page-title">НАЙДИ СВОЮ <em>ИГРУ</em></h1>\n    <RealQueue/>
    {stage === "setup" && <article className="card">
      <h2>Тренировочный поиск с ботами</h2>
      <p>Запусти тестовую катку: боты найдутся автоматически, примут матч, а затем вы по очереди забаните карты. Никакие реальные игроки не подключаются.</p>
      <div className="modes">{(["5×5", "2×2"] as const).map((x) => <button key={x} className={mode === x ? "chosen" : ""} onClick={() => setMode(x)}>{x}</button>)}</div>
      <div className="queue-info"><span>Режим</span><b>{mode}</b><span>Твой тестовый ELO</span><b>751</b><span>Состав</span><b>{mode === "5×5" ? "9 ботов и ты" : "3 бота и ты"}</b><span>Карты в пуле</span><b>7 · банов 6</b></div>
      <button className="primary wide" onClick={startSearch}>НАЧАТЬ ПОИСК С БОТАМИ ↗</button>
      <p className="hint">Это локальная симуляция интерфейса. Рейтинг и статистика аккаунта не меняются.</p>
    </article>}
    {stage === "searching" && <article className="card demo-stage">
      <div className="search-orbit">R</div><h2>Ищем соперников...</h2><p>Подбираем тестовых ботов для режима {mode}.</p>
      <div className="bot-squad"><span>ТЫ</span>{Array.from({length: mode === "5×5" ? 9 : 3}, (_,i)=><span key={i}>BOT</span>)}</div>
      <button className="secondary wide" onClick={cancel}>ОТМЕНИТЬ ПОИСК</button>
    </article>}
    {stage === "found" && <article className="card demo-stage">
      <div className="found-label">✓ МАТЧ НАЙДЕН · 00:{String(readySeconds).padStart(2, "0")}</div><h2>Все игроки готовы?</h2><p>Тестовое лобби {mode}. Боты уже автоматически подтвердили участие. Подтверди матч за 30 секунд.</p>
      <div className="ready-list"><div><b>ТЫ · Игрок RATEIT</b><strong className="waiting-you">ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ</strong></div>{Array.from({length: mode === "5×5" ? 9 : 3},(_,i)=><div key={i}><b>Бот_{String(i+1).padStart(2,"0")}</b><strong className="win">✓ ГОТОВ</strong></div>)}</div>
      <button className="primary wide" onClick={accept}>ПРИНЯТЬ МАТЧ ✓</button>
      <button className="secondary wide" onClick={cancel}>ОТКЛОНИТЬ</button>
    </article>}
    {stage === "banning" && <article className="card demo-stage">
      <div className="found-label">ЛОББИ · {mode}</div><h2>Бан карт</h2><p>{botTurn ? "Ход капитана соперников — боты выбирают карту..." : "Твой ход: выбери карту, которую хочешь забанить."}</p>
      <div className="ban-progress"><span>Забанено карт</span><b>{banned.length} / 6</b></div><div className="ban-track">{Array.from({length:6},(_,i)=><i key={i} className={i < banned.length ? "done" : ""}/>)}</div>
      <div className="map-grid">{maps.map((map)=> <button type="button" key={map} disabled={banned.includes(map) || botTurn} className={banned.includes(map) ? "map-banned" : ""} onClick={()=>banMap(map)}><b>{map}</b><span>{banned.includes(map) ? "ЗАБАНЕНА" : "НАЖМИ, ЧТОБЫ ЗАБАНИТЬ"}</span></button>)}</div>
      <p className="hint">Баны чередуются: ты — капитан ботов — ты — капитан ботов. После шести банов останется одна карта.</p>
      <button className="secondary wide" onClick={cancel}>ЗАВЕРШИТЬ ДЕМО</button>
    </article>}
    {stage === "finished" && <article className="card demo-stage">
      <div className="found-label">✓ КАРТА ВЫБРАНА</div><h2>Матч готов к старту!</h2><p>После шести банов для игры осталась карта:</p>
      <div className="final-map">{remaining[0] ?? "Карта не определена"}</div>
      <div className="queue-info"><span>Режим</span><b>{mode}</b><span>Забанено</span><b>{banned.length} карт</b><span>Участники</span><b>Ты и боты</b></div>
      <p className="notice">Демо завершено. Настоящая игровая комната в Standoff 2 не создавалась.</p>
      <button className="primary wide" onClick={()=>setStage("lobby")}>ПРОДОЛЖИТЬ В ЛОББИ ↗</button>
      <button className="secondary wide" onClick={cancel}>ВЕРНУТЬСЯ</button>
    </article>}
    {stage === "lobby" && <article className="card demo-stage">
      <div className="found-label">ЛОББИ СОЗДАНО · ДЕМО</div><h2>Команды готовы</h2><p>Карта: <b>{remaining[0]}</b> · Режим {mode}. Это демонстрация лобби — настоящая комната в игре не создаётся.</p>
      <div className="demo-teams"><div><small>КОМАНДА A</small><b>ТЫ · Игрок RATEIT</b>{Array.from({length:mode==="5×5"?4:1},(_,i)=><span key={i}>Бот союзник {i+1}</span>)}</div><div><small>КОМАНДА B</small>{Array.from({length:mode==="5×5"?5:2},(_,i)=><span key={i}>Бот соперник {i+1}</span>)}</div></div>
      <p className="notice">В настоящей версии здесь появятся данные комнаты и инструкции для ручного входа в Standoff 2.</p>
      <button className="primary wide" onClick={()=>setStage("result")}>ЗАВЕРШИТЬ ДЕМО-МАТЧ</button>
      <button className="secondary wide" onClick={cancel}>ВЫЙТИ ИЗ ЛОББИ</button>
    </article>}
    {stage === "result" && <article className="card demo-stage">
      <div className="found-label">РЕЗУЛЬТАТ МАТЧА · ДЕМО</div><h2>Введи счёт</h2><p>Проверь экран отправки результата. Эти данные никуда не отправляются.</p>
      <div className="score-entry"><label>КОМАНДА A<input type="number" min="0" max="13" value={demoScore.teamA} onChange={e=>setDemoScore({...demoScore,teamA:Math.max(0,Math.min(13,Number(e.target.value)))})}/></label><b>:</b><label>КОМАНДА B<input type="number" min="0" max="13" value={demoScore.teamB} onChange={e=>setDemoScore({...demoScore,teamB:Math.max(0,Math.min(13,Number(e.target.value)))})}/></label></div>
      <button className="primary wide" onClick={()=>setStage("completed")}>ПОДТВЕРДИТЬ РЕЗУЛЬТАТ</button>
      <button className="secondary wide" onClick={()=>setStage("lobby")}>НАЗАД В ЛОББИ</button>
    </article>}
    {stage === "completed" && <article className="card demo-stage">
      <div className="found-label">✓ ДЕМО ЗАВЕРШЕНО</div><h2>{demoScore.teamA===demoScore.teamB?"Ничья":demoScore.teamA>demoScore.teamB?"Победа команды A":"Победа команды B"}</h2>
      <div className="final-map">{demoScore.teamA} : {demoScore.teamB}</div><p>Карта: {remaining[0]} · Режим {mode}</p>
      <p className="notice">Результат показан только для проверки интерфейса. Матч не записан в историю, ELO не изменён.</p>
      <button className="primary wide" onClick={startSearch}>СЫГРАТЬ ЕЩЁ РАЗ ↗</button><button className="secondary wide" onClick={cancel}>В ГЛАВНОЕ МЕНЮ ПОИСКА</button>
    </article>}
  </section>;
}
type Friend = { id:string; nickname:string; elo:number; status:"pending"|"accepted"; direction:"incoming"|"outgoing" };
type PartyState = {id:string;leaderUserId:string;maxMembers:number;members:{id:string;nickname:string;elo:number;role:string}[]};
type PartyInvite = {invite_id:string;party_id:string;inviter_nickname:string;max_members:number;member_count:number};
function Friends() {
 const [friends,setFriends]=useState<Friend[]>([]);
 const [nickname,setNickname]=useState("");
 const [message,setMessage]=useState("");
 const [loading,setLoading]=useState(true);
 const [party,setParty]=useState<PartyState|null>(null);
 const [partyInvites,setPartyInvites]=useState<PartyInvite[]>([]);
 const [busy,setBusy]=useState(false);
 const apiBase="https://rateit-api-6chg.onrender.com";
 const token=()=>localStorage.getItem("rateit-session");
 const authHeaders=()=>({authorization:`Bearer ${token()||""}`});
 const load=async()=>{
  const session=token();
  if(!session){setLoading(false);setMessage("Войди в RATEIT, чтобы использовать друзей и пати.");return}
  try{
   const [fr,pr]=await Promise.all([
    fetch(`${apiBase}/api/v1/friends`,{headers:authHeaders()}),
    fetch(`${apiBase}/api/v1/party`,{headers:authHeaders()})
   ]);
   const fd=await fr.json(),pd=await pr.json();
   if(!fr.ok)throw new Error(fd.error||"Не удалось загрузить друзей.");
   if(!pr.ok)throw new Error(pd.error||"Не удалось загрузить пати.");
   setFriends(fd.friends||[]);setParty(pd.party||null);setPartyInvites(pd.invites||[]);
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка загрузки сообщества.")}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[]);
 const add=async()=>{
  if(!token()){setMessage("Сначала войди в аккаунт RATEIT.");return}
  if(!nickname.trim()){setMessage("Введи точный ник RATEIT.");return}
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/friends/request`,{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({nickname:nickname.trim()})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось отправить запрос.");
   setNickname("");setMessage(data.message||"Запрос отправлен.");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка отправки запроса.")}
  finally{setBusy(false)}
 };
 const respondFriend=async(userId:string,action:"accept"|"decline")=>{
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/friends/respond`,{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({userId,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось обработать запрос.");
   setMessage(action==="accept"?"Запрос принят. Вы теперь друзья.":"Запрос отклонён.");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка запроса.")}
  finally{setBusy(false)}
 };
 const removeFriend=async(friend:Friend)=>{
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/friends/${friend.id}`,{method:"DELETE",headers:authHeaders()});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось удалить друга.");
   setMessage("Игрок удалён из списка друзей.");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка удаления.")}
  finally{setBusy(false)}
 };
 const createParty=async(maxMembers:2|5)=>{
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/party/create`,{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({maxMembers})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать пати.");
   setMessage(`Пати ${maxMembers}×${maxMembers} создана. Теперь можно приглашать друзей.`);await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка создания пати.")}
  finally{setBusy(false)}
 };
 const inviteToParty=async(friend:Friend)=>{
  if(!party)return;
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/party/invite`,{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({userId:friend.id})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось пригласить игрока.");
   setMessage(`Приглашение отправлено игроку ${friend.nickname}.`);
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка приглашения.")}
  finally{setBusy(false)}
 };
 const respondParty=async(inviteId:string,action:"accept"|"decline")=>{
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/party/respond`,{method:"POST",headers:{"content-type":"application/json",...authHeaders()},body:JSON.stringify({inviteId,action})});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось обработать приглашение.");
   setMessage(data.message|| (action==="accept"?"Ты вступил в пати.":"Приглашение отклонено."));await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка приглашения.")}
  finally{setBusy(false)}
 };
 const leaveParty=async()=>{
  setBusy(true);
  try{
   const response=await fetch(`${apiBase}/api/v1/party/leave`,{method:"POST",headers:authHeaders()});
   const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось выйти из пати.");
   setMessage(data.message||"Ты вышел из пати.");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка выхода из пати.")}
  finally{setBusy(false)}
 };
 const accepted=friends.filter(f=>f.status==="accepted");
 const incoming=friends.filter(f=>f.status==="pending"&&f.direction==="incoming");
 const outgoing=friends.filter(f=>f.status==="pending"&&f.direction==="outgoing");
 const isLeader=Boolean(party?.members.some(m=>m.role==="leader"&&m.id===party.leaderUserId));
 return <section className="page"><small>СООБЩЕСТВО</small><h1 className="page-title">ТВОИ <em>ДРУЗЬЯ</em></h1><article className="card friend-add"><h2>Добавить игрока</h2><p>Найди игрока по точному нику RATEIT и отправь запрос дружбы.</p><div className="friend-add-row"><input aria-label="Ник игрока" maxLength={24} value={nickname} onChange={e=>setNickname(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void add()}} placeholder="Ник игрока RATEIT"/><button className="primary" disabled={busy} onClick={()=>void add()}>ОТПРАВИТЬ +</button></div>{message&&<p className="hint" role="status">{message}</p>}</article>
 <article className="card party-panel"><div className="friend-list-title"><h2>Твоя пати</h2><span>{party?party.members.length+" / "+party.maxMembers+" игроков":"не создана"}</span></div>{party?<><div className="party-slots">{party.members.map(member=><div className={`party-slot filled ${member.role==="leader"?"party-owner":""}`} key={member.id}><b>{member.nickname.slice(0,1).toUpperCase()}</b><span>{member.nickname}{member.role==="leader"?" · лидер":""}</span></div>)}{Array.from({length:Math.max(0,party.maxMembers-party.members.length)},(_,i)=><div className="party-slot" key={i}><b>＋</b><span>Свободный слот</span></div>)}</div><p className="hint">{isLeader?"Ты лидер пати. Приглашай друзей из списка ниже.":"Ты участник пати. Управление приглашениями доступно лидеру."}</p><button className="secondary wide" disabled={busy} onClick={()=>void leaveParty()}>{isLeader?"ЗАКРЫТЬ ПАТИ":"ВЫЙТИ ИЗ ПАТИ"}</button></>:<><p>Создай группу, выбрав формат под режим игры.</p><div className="modes"><button disabled={busy} onClick={()=>void createParty(2)}>СОЗДАТЬ 2×2</button><button disabled={busy} onClick={()=>void createParty(5)}>СОЗДАТЬ 5×5</button></div></>}</article>
 {partyInvites.length>0&&<article className="card friend-list-card"><div className="friend-list-title"><h2>Приглашения в пати</h2><span>{partyInvites.length}</span></div>{partyInvites.map(invite=><div className="friend-row" key={invite.invite_id}><div className="friend-avatar">＋</div><div className="friend-details"><b>{invite.inviter_nickname}</b><small>Пати · {invite.member_count}/{invite.max_members}</small></div><button className="primary invite-btn" disabled={busy} onClick={()=>void respondParty(invite.invite_id,"accept")}>ПРИНЯТЬ</button><button className="remove-friend" disabled={busy} aria-label="Отклонить приглашение" onClick={()=>void respondParty(invite.invite_id,"decline")}>×</button></div>)}</article>}
 {incoming.length>0&&<article className="card friend-list-card"><div className="friend-list-title"><h2>Входящие запросы</h2><span>{incoming.length}</span></div>{incoming.map(friend=><div className="friend-row" key={friend.id}><div className="friend-avatar">{friend.nickname.slice(0,1).toUpperCase()}</div><div className="friend-details"><b>{friend.nickname}</b><small>{friend.elo} ELO · запрос дружбы</small></div><button className="primary invite-btn" disabled={busy} onClick={()=>void respondFriend(friend.id,"accept")}>ПРИНЯТЬ</button><button className="remove-friend" disabled={busy} aria-label="Отклонить запрос" onClick={()=>void respondFriend(friend.id,"decline")}>×</button></div>)}</article>}
 <article className="card friend-list-card"><div className="friend-list-title"><h2>Мои друзья</h2><span>{accepted.length}</span></div>{loading?<p className="hint">Загружаем список…</p>:accepted.length===0?<div className="empty"><div className="empty-icon">♧</div><p>Пока нет друзей. Найди игрока и отправь запрос.</p></div>:accepted.map(friend=><div className="friend-row" key={friend.id}><div className="friend-avatar">{friend.nickname.slice(0,1).toUpperCase()}</div><div className="friend-details"><b>{friend.nickname}</b><small>{friend.elo} ELO · RATEIT</small></div><button className="secondary invite-btn" disabled={busy||!party||!isLeader} onClick={()=>void inviteToParty(friend)}>В ПАТИ</button><button className="remove-friend" disabled={busy} aria-label={`Удалить ${friend.nickname}`} onClick={()=>void removeFriend(friend)}>×</button></div>)}{outgoing.length>0&&<><div className="friend-list-title"><h2>Ожидают ответа</h2><span>{outgoing.length}</span></div>{outgoing.map(friend=><div className="friend-row" key={friend.id}><div className="friend-avatar">{friend.nickname.slice(0,1).toUpperCase()}</div><div className="friend-details"><b>{friend.nickname}</b><small>{friend.elo} ELO · запрос отправлен</small></div></div>)}</>}</article>
 </section>;
}

type HistoryMatch={id:string;mode:string;map_name:string|null;team_a_score:number|null;team_b_score:number|null;team:number;elo_before:number;elo_change:number|null;kills:number|null;deaths:number|null;completed_at:string|null;result:"win"|"loss"|"draw"};
function History() {
 const [filter,setFilter]=useState<"Все"|"Победы"|"Поражения">("Все");
 const [matches,setMatches]=useState<HistoryMatch[]>([]);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState("");
 const apiBase="https://rateit-api-6chg.onrender.com";
 useEffect(()=>{
  const token=localStorage.getItem("rateit-session");
  if(!token){setLoading(false);setMessage("Войди в RATEIT, чтобы увидеть настоящую историю матчей.");return}
  fetch(`${apiBase}/api/v1/matches/history`,{headers:{authorization:`Bearer ${token}`}})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось загрузить историю.");setMatches(data.matches||[])})
   .catch(error=>setMessage(error instanceof Error?error.message:"Ошибка загрузки истории."))
   .finally(()=>setLoading(false));
 },[]);
 const visible=matches.filter(m=>filter==="Все"||(filter==="Победы"?m.result==="win":m.result==="loss"));
 const wins=matches.filter(m=>m.result==="win").length;
 const rate=matches.length?Math.round(wins/matches.length*100):0;
 const label=(result:HistoryMatch["result"])=>result==="win"?"Победа":result==="loss"?"Поражение":"Ничья";
 return <section className="page"><small>ТВОИ РЕЗУЛЬТАТЫ</small><h1 className="page-title">ИСТОРИЯ <em>МАТЧЕЙ</em></h1><article className="card"><div className="history-summary"><div><strong>{matches.length}</strong><span>матчей RATEIT</span></div><div><strong>{wins}</strong><span>побед</span></div><div><strong>{rate}%</strong><span>винрейт</span></div></div><div className="history-filters">{(["Все","Победы","Поражения"] as const).map(item=><button key={item} className={filter===item?"chosen":""} onClick={()=>setFilter(item)}>{item}</button>)}</div>{loading?<p className="hint">Загружаем историю…</p>:visible.map(match=><div className="match-row" key={match.id}><div><b>{match.map_name||"Карта не указана"}</b><small>{match.mode==="5x5"?"5×5":"2×2"} · {match.completed_at?new Date(match.completed_at).toLocaleDateString("ru-RU"):"дата не указана"}</small></div><span className={match.result==="win"?"win":match.result==="loss"?"loss":""}>{label(match.result)}</span><b>{match.team_a_score??"—"} : {match.team_b_score??"—"}</b><strong className={match.elo_change&&match.elo_change>0?"win":match.elo_change&&match.elo_change<0?"loss":""}>{match.elo_change==null?"—":match.elo_change>0?"+"+match.elo_change:match.elo_change}</strong></div>)}{!loading&&visible.length===0&&<div className="empty"><div className="empty-icon">▤</div><p>{matches.length===0?"Завершённых матчей RATEIT пока нет.":"В этой категории матчей нет."}</p></div>}{message&&<p className="hint" role="status">{message}</p>}<p className="hint">В истории отображаются только матчи, записанные и завершённые в RATEIT.</p></article></section>;
}


type PlayerProfile={nickname:string;playerId:string;hours:string;elo:number;level:number;matches:number;wins:number;losses:number;kills:number;deaths:number};
const emptyProfile:PlayerProfile={nickname:"Игрок RATEIT",playerId:"",hours:"",elo:751,level:3,matches:0,wins:0,losses:0,kills:0,deaths:0};
function Profile() {
 const [profile,setProfile]=useState<PlayerProfile>(emptyProfile);
 const [draft,setDraft]=useState(profile);
 const [editing,setEditing]=useState(false);
 const [message,setMessage]=useState("");
 const [authenticated,setAuthenticated]=useState(false);
 const [loading,setLoading]=useState(true);
 const apiBase="https://rateit-api-6chg.onrender.com";
 useEffect(()=>{
  const token=localStorage.getItem("rateit-session");
  if(!token){setLoading(false);return}
  fetch(`${apiBase}/api/v1/auth/me`,{headers:{authorization:`Bearer ${token}`}})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось загрузить профиль.");const u=data.user;const next={nickname:u.nickname||"Игрок RATEIT",playerId:u.standoff2_id||"",hours:u.verified_hours==null?"":String(u.verified_hours),elo:u.elo??751,level:u.level??3,matches:u.matches_played??0,wins:u.wins??0,losses:u.losses??0,kills:u.kills??0,deaths:u.deaths??0};setProfile(next);setDraft(next);setAuthenticated(true)})
   .catch(error=>setMessage(error instanceof Error?error.message:"Ошибка загрузки профиля."))
   .finally(()=>setLoading(false));
 },[]);
 const save=async()=>{
  if(!authenticated){setMessage("Войди в RATEIT, чтобы сохранять профиль.");return}
  const nickname=draft.nickname.trim();
  if(!nickname||nickname.length>24){setMessage("Ник должен содержать от 1 до 24 символов.");return}
  if(draft.hours.trim()&&(!/^\\d+$/.test(draft.hours.trim())||Number(draft.hours)>100000)){setMessage("Укажи целое количество часов от 0 до 100000.");return}
  const token=localStorage.getItem("rateit-session");
  try{
   const response=await fetch(`${apiBase}/api/v1/profile`,{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${token||""}`},body:JSON.stringify({nickname,...(!profile.playerId&&draft.playerId.trim()?{standoff2Id:draft.playerId.trim()}: {}),...(draft.hours.trim()?{hours:Number(draft.hours)}:{})})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Не удалось сохранить профиль.");
   const next={...profile,nickname:data.user.nickname,playerId:data.user.standoff2_id||"",hours:data.user.verified_hours==null?profile.hours:String(data.user.verified_hours)};
   setProfile(next);setDraft(next);setEditing(false);
   setMessage(next.playerId?"Профиль сохранён. Standoff 2 ID закреплён за аккаунтом и больше не изменяется.":"Ник сохранён. Standoff 2 ID можно привязать один раз.");
  }catch(error){setMessage(error instanceof Error?error.message:"Ошибка сохранения профиля.")}
 };
 const shownHours=profile.hours?`${Math.floor(Number(profile.hours)/10)*10}+`:"не подтверждены";
 return <section className="page"><small>АККАУНТ И СТАТИСТИКА</small><h1 className="page-title">ТВОЙ <em>ПРОФИЛЬ</em></h1><article className="card profile-card"><div className="profile-head"><div className="profile-avatar">{profile.nickname.slice(0,1).toUpperCase()}</div><div><h2>{profile.nickname}</h2><p>Standoff 2 ID: {profile.playerId||"не привязан"}</p><p>Игровые часы: {shownHours}</p></div><b className="level-badge">{profile.level}</b></div>{editing?<div className="profile-editor"><label>Игровой ник<input maxLength={24} value={draft.nickname} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label><label>Standoff 2 ID<input maxLength={64} value={draft.playerId} disabled={Boolean(profile.playerId)} onChange={e=>setDraft({...draft,playerId:e.target.value})} placeholder={profile.playerId?"ID уже закреплён":"Введи свой ID один раз"}/></label><label>Игровые часы<input inputMode="numeric" value={draft.hours} onChange={e=>setDraft({...draft,hours:e.target.value.replace(/\\D/g,"").slice(0,6)})} placeholder="Например, 187"/></label>{profile.playerId&&<p className="hint">Этот ID уже использован для аккаунта и не может быть изменён или перенесён.</p>}<div className="editor-actions"><button className="primary" onClick={()=>void save()}>СОХРАНИТЬ</button><button className="secondary" onClick={()=>{setDraft(profile);setEditing(false);setMessage("")}}>ОТМЕНА</button></div></div>:<button className="secondary edit-profile" disabled={!authenticated||loading} onClick={()=>{setDraft(profile);setEditing(true)}}>{authenticated?"РЕДАКТИРОВАТЬ ПРОФИЛЬ ✎":"ВОЙДИ, ЧТОБЫ ИЗМЕНИТЬ ПРОФИЛЬ"}</button>}{message&&<p className="hint" role="status">{message}</p>}{loading&&<p className="hint">Загружаем профиль…</p>}<div className="elo">{profile.elo} <span>ELO · УРОВЕНЬ {profile.level}</span></div><div className="bar" aria-label="Прогресс до следующего уровня"><i style={{width:"0%"}}/></div><p className="between">Профиль RATEIT · единый для сайта и Telegram</p><div className="stats-grid"><div><b>{profile.deaths===0?(profile.kills?profile.kills.toFixed(1):"—"):(profile.kills/profile.deaths).toFixed(2)}</b><span>K/D</span></div><div><b>{profile.wins}</b><span>Победы</span></div><div><b>{profile.matches}</b><span>Матчи</span></div><div><b>{profile.matches?Math.round(profile.wins/profile.matches*100)+"%":"—"}</b><span>Винрейт</span></div></div><p className="notice">Standoff 2 ID закрепляется за аккаунтом один раз. Игровые часы указываются вручную и используются для подбора с разницей не более 50 часов.</p></article></section>;
}


type AuthMode = "login" | "register" | "recover";
const authProviders = [
  { id: "google", label: "Google", mark: "G" },
  { id: "telegram", label: "Telegram", mark: "➤" },
  { id: "yandex", label: "Яндекс ID", mark: "Я" },
  { id: "vk", label: "VK ID", mark: "ᴠκ" },
  { id: "facebook", label: "Facebook", mark: "f" }
] as const;

function AuthPanel({ close }: { close: () => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [telegramChallengeId, setTelegramChallengeId] = useState("");
  const [telegramBotUrl, setTelegramBotUrl] = useState("");
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramVerified, setTelegramVerified] = useState(false);
  const apiBase = "https://rateit-api-6chg.onrender.com";

  const startTelegramLogin = async () => {
    const telegramWindow = window.open("about:blank", "_blank");
    setTelegramBusy(true);
    setNotice("");
    setTelegramVerified(false);
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/telegram/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "login" })
      });
      const data = await response.json() as { challengeId?: string; botUrl?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось начать вход через Telegram.");
      setTelegramChallengeId(data.challengeId || "");
      setTelegramBotUrl(data.botUrl || "");
      if (data.botUrl && telegramWindow) telegramWindow.location.href = data.botUrl;
      else telegramWindow?.close();
      setTelegramCode("");
      setNotice("Открой бота по кнопке ниже и нажми Start. Он пришлёт одноразовый код.");
    } catch (error) {
      telegramWindow?.close();
      setNotice(error instanceof Error ? error.message : "Ошибка подключения к RATEIT API.");
    } finally {
      setTelegramBusy(false);
    }
  };

  const verifyTelegramCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTelegramBusy(true);
    setNotice("");
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: telegramChallengeId, code: telegramCode })
      });
      const data = await response.json() as { verified?: boolean; token?: string; user?: unknown; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Код не принят.");
      setTelegramVerified(Boolean(data.verified));
      if (data.verified && data.token) {
        localStorage.setItem("rateit-session", data.token);
        if (data.user) localStorage.setItem("rateit-user", JSON.stringify(data.user));
        close();
      }
      setNotice(data.message || "Telegram подтверждён.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка проверки кода.");
    } finally {
      setTelegramBusy(false);
    }
  };

  const title = mode === "register" ? "СОЗДАТЬ АККАУНТ" : mode === "recover" ? "ВОССТАНОВЛЕНИЕ" : "С ВОЗВРАЩЕНИЕМ";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTelegramBusy(true);
    setNotice("");
    try {
      if (mode === "recover") {
        setNotice("Восстановление пароля будет подключено после настройки подтверждения почты.");
        return;
      }
      const endpoint = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const body = mode === "register"
        ? { nickname, loginName, email, password }
        : { identifier, password };
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json() as { token?: string; user?: { nickname?: string }; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "Не удалось выполнить вход.");
      localStorage.setItem("rateit-session", data.token);
      if (data.user) localStorage.setItem("rateit-user", JSON.stringify(data.user));
      setNotice(mode === "register" ? "Аккаунт RATEIT создан. Ты вошёл в систему." : "Вход выполнен.");
      close();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка подключения к RATEIT API.");
    } finally {
      setTelegramBusy(false);
    }
  };

  return <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" onClick={close} aria-label="Закрыть окно">×</button>
      <div className="auth-brand">RATE<span>IT</span></div>
      <small>ЕДИНЫЙ АККАУНТ · ВСЕ ПЛАТФОРМЫ</small>
      <h1 id="auth-title">{title}</h1>
      <p className="auth-subtitle">{mode === "register" ? "Создай профиль и собери все способы входа в одном месте." : mode === "recover" ? "Укажи почту, привязанную к аккаунту RATEIT." : "Войди удобным способом и продолжай свой путь."}</p>
      {mode !== "recover" && <div className="auth-providers">
        {authProviders.map((provider) => <button type="button" key={provider.id} disabled={telegramBusy} onClick={() => provider.id === "telegram" ? void startTelegramLogin() : setNotice(`${provider.label}: подключение появится после настройки провайдера.`)}>
          <b>{provider.mark}</b><span>{provider.label}</span><i>↗</i>
        </button>)}
      </div>}
      {telegramBotUrl && mode !== "recover" && <section className="telegram-auth-box">
        <p><b>1.</b> Открой бота и нажми Start.</p>
        <a className="primary wide telegram-open" href={telegramBotUrl} target="_blank" rel="noreferrer">ОТКРЫТЬ TELEGRAM ↗</a>
        <div className="telegram-warning"><b>⚠️ ВАЖНО — НЕ ПЕРЕДАВАЙ КОД</b><br/>Никому не сообщай код, даже людям, представляющимся администрацией RATEIT. Продажа, покупка, аренда и передача аккаунтов запрещены; за подтверждённые нарушения возможна блокировка, вплоть до перманентного бана.</div>
        {!telegramVerified ? <form className="auth-form" onSubmit={verifyTelegramCode}>
          <label>2. Шестизначный код из Telegram<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={telegramCode} onChange={e=>setTelegramCode(e.target.value.replace(/\\D/g,"").slice(0,6))} placeholder="000000" /></label>
          <button className="primary wide" disabled={telegramBusy || telegramCode.length !== 6} type="submit">{telegramBusy ? "ПРОВЕРЯЕМ..." : "ПОДТВЕРДИТЬ КОД"}</button>
        </form> : <p className="auth-notice">Telegram подтверждён. Создание полноценной сессии RATEIT будет доступно после подключения базы и системы аккаунтов.</p>}
      </section>}
      {mode !== "recover" && <div className="auth-divider"><span>ИЛИ ПО ПАРОЛЮ</span></div>}
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <label>Игровой ник<input required maxLength={24} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Твой ник в RATEIT" /></label>}
        {mode === "register" && <label>Логин RATEIT<input required minLength={3} maxLength={24} value={loginName} onChange={e => setLoginName(e.target.value.replace(/\\s/g, ""))} placeholder="Придумай уникальный логин" /></label>}
        {mode === "register" && <label>Электронная почта<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label>}
        {mode !== "register" && <label>{mode === "recover" ? "Электронная почта" : "Логин или электронная почта"}<input required type={mode === "recover" ? "email" : "text"} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={mode === "recover" ? "name@example.com" : "Логин или name@example.com"} /></label>}
        {mode !== "recover" && <label>Пароль<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов" autoComplete={mode === "register" ? "new-password" : "current-password"} /></label>}
        <button className="primary wide" type="submit">{mode === "register" ? "СОЗДАТЬ АККАУНТ" : mode === "recover" ? "ВОССТАНОВИТЬ ДОСТУП" : "ВОЙТИ В RATEIT"} ↗</button>
      </form>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      <div className="auth-links">
        {mode === "login" && <><button onClick={() => {setMode("recover");setNotice("");}}>Забыли пароль?</button><button onClick={() => {setMode("register");setNotice("");}}>Создать аккаунт</button></>}
        {mode === "register" && <button onClick={() => {setMode("login");setNotice("");}}>Уже есть аккаунт? Войти</button>}
        {mode === "recover" && <button onClick={() => {setMode("login");setNotice("");}}>Вернуться ко входу</button>}
      </div>
      <p className="auth-footnote">Пароль передаётся только защищённому API RATEIT и хранится на сервере в виде криптографического хеша.</p>
    </section>
  </div>;
}

export default function App() {
  const [active, setActive] = useState<Tab>("Главная");
  const [authOpen, setAuthOpen] = useState(false);
  const content = active === "Главная" ? <Home go={setActive} /> : active === "Играть" ? <Play /> : active === "Друзья" ? <Friends /> : active === "История" ? <History /> : <Profile />;
  return <main className="app">
    <header><a className="logo" onClick={() => setActive("Главная")}>RATE<span>IT</span></a><div className="online">● ПРОЕКТ В РАЗРАБОТКЕ</div><div className="header-actions"><button className="login-trigger" onClick={() => setAuthOpen(true)}>ВОЙТИ ↗</button><button className="avatar" onClick={() => setActive("Профиль")}>R</button></div></header>
    {content}
    {authOpen && <AuthPanel close={() => setAuthOpen(false)} />}
    <nav aria-label="Основная навигация">{tabs.map((t, i) => <button key={t} aria-current={active === t ? "page" : undefined} className={active === t ? "active" : ""} onClick={() => setActive(t)}><strong>{["⌂", "♧", "+", "▤", "◉"][i]}</strong>{t}</button>)}</nav>
  </main>;
}