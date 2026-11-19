import { useEffect, useState } from "react";

type Tab = "Главная" | "Друзья" | "Играть" | "История" | "Профиль";
const tabs: Tab[] = ["Главная", "Друзья", "Играть", "История", "Профиль"];

const demoMatches = [
  { map: "Sandstone", mode: "5×5", result: "Победа", score: "13 : 9", elo: "+24", date: "Сегодня" },
  { map: "Rust", mode: "2×2", result: "Поражение", score: "8 : 13", elo: "−17", date: "Вчера" },
  { map: "Province", mode: "5×5", result: "Победа", score: "13 : 6", elo: "+21", date: "18 ноя" }
];

function Home({ go }: { go: (tab: Tab) => void }) {
  return <>
    <section className="hero">
      <small>СОРЕВНОВАТЕЛЬНАЯ ПЛАТФОРМА · STANDOFF 2</small>
      <h1>ИГРАЙ.<br /><em>ПОДНИМАЙСЯ.</em></h1>
      <p>Твой рейтинг. Твои матчи. Твой путь на вершину.</p>
      <button className="primary" onClick={() => go("Играть")}>НАЙТИ МАТЧ　↗</button>
      <button className="secondary" onClick={() => go("Профиль")}>МОЙ ПРОФИЛЬ</button>
      <b className="watermark">R</b>
    </section>
    <section className="grid">
      <article className="card"><small>МАТЧМЕЙКИНГ</small><h2>Готов к игре?</h2><p>Выбери режим и найди игроков с близким рейтингом и игровым опытом.</p><button className="primary wide" onClick={() => go("Играть")}>ПЕРЕЙТИ К ПОДБОРУ　→</button><small className="hint">Подбор пока работает в демонстрационном режиме.</small></article>
      <article className="card"><small>ТВОЙ ПРОГРЕСС</small><div className="rank"><b>3</b><div><h2>Уровень 3</h2><p>Стартовый рейтинг</p></div></div><div className="elo">751 <span>ELO</span></div><div className="bar"><i /></div><p className="between">До следующего уровня <b>900 ELO</b></p></article>
    </section>
    <section className="features"><div><b>ЧЕСТНЫЙ ПОДБОР</b><span>Учитываем рейтинг и игровой опыт</span></div><div><b>ЕДИНЫЙ АККАУНТ</b><span>Android и Telegram в одном профиле</span></div><div><b>ТВОЯ СТАТИСТИКА</b><span>История матчей и прогресс ELO</span></div></section>
    <section className="home-extras"><article className="card"><small>СЕЗОННЫЙ РЕЙТИНГ</small><h2>Таблица лидеров</h2><div className="leader-row"><b>#1</b><span>ProAim</span><strong>2480 ELO</strong></div><div className="leader-row"><b>#2</b><span>Vortex</span><strong>2315 ELO</strong></div><div className="leader-row"><b>#3</b><span>Raven</span><strong>2190 ELO</strong></div><p className="hint">Демонстрационные игроки. Реальный рейтинг появится после запуска аккаунтов и матчей.</p></article><article className="card"><small>СЕЗОН 01 · ПЛАНИРУЕТСЯ</small><h2>Соревнуйся за место в топе</h2><p>Сезонные таблицы, турниры, награды и отдельная статистика каждого сезона — часть дорожной карты RATEIT.</p><button className="secondary wide" onClick={()=>go("Играть")}>ТРЕНИРОВАТЬСЯ С БОТАМИ ↗</button></article></section>
  </>;
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
    <h1 className="page-title">НАЙДИ СВОЮ <em>ИГРУ</em></h1>
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
type Friend = { nickname: string; elo: number; status: "В сети" | "Не в сети" };
const defaultFriends: Friend[] = [{nickname:"Shadow",elo:1240,status:"В сети"},{nickname:"K1ller",elo:980,status:"Не в сети"},{nickname:"Nexus",elo:1560,status:"В сети"}];
function Friends() {
 const [friends,setFriends]=useState<Friend[]>(()=>{try{const s=localStorage.getItem("rateit-demo-friends");return s?JSON.parse(s) as Friend[]:defaultFriends}catch{return defaultFriends}});
 const [nickname,setNickname]=useState("");const [message,setMessage]=useState("");
 useEffect(()=>{localStorage.setItem("rateit-demo-friends",JSON.stringify(friends))},[friends]);
 const add=()=>{const name=nickname.trim().replace(/\s+/g," ").slice(0,24);if(!name){setMessage("Введи ник игрока.");return}if(friends.some(x=>x.nickname.toLowerCase()===name.toLowerCase())){setMessage("Такой игрок уже есть в списке.");return}setFriends(x=>[...x,{nickname:name,elo:751,status:"Не в сети"}]);setNickname("");setMessage("Игрок добавлен в демо-список друзей.")};
 return <section className="page"><small>СООБЩЕСТВО</small><h1 className="page-title">ТВОИ <em>ДРУЗЬЯ</em></h1><article className="card friend-add"><h2>Добавить игрока</h2><p>Введи ник, чтобы проверить интерфейс списка друзей.</p><div className="friend-add-row"><input aria-label="Ник игрока" maxLength={24} value={nickname} onChange={e=>setNickname(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add()}} placeholder="Например, Player123"/><button className="primary" onClick={add}>ДОБАВИТЬ +</button></div>{message&&<p className="hint" role="status">{message}</p>}</article><article className="card friend-list-card"><div className="friend-list-title"><h2>Мой список</h2><span>{friends.length} игроков</span></div>{friends.length===0?<div className="empty"><div className="empty-icon">♧</div><p>Пока никого нет. Добавь первого друга выше.</p></div>:friends.map(friend=><div className="friend-row" key={friend.nickname}><div className="friend-avatar">{friend.nickname.slice(0,1).toUpperCase()}</div><div className="friend-details"><b>{friend.nickname}</b><small>{friend.status} · {friend.elo} ELO</small></div><button className="secondary invite-btn" onClick={()=>setMessage(`Приглашение для ${friend.nickname} показано в демо-режиме.`)}>В ПАТИ</button><button className="remove-friend" aria-label={`Удалить ${friend.nickname}`} onClick={()=>setFriends(items=>items.filter(x=>x.nickname!==friend.nickname))}>×</button></div>)}<p className="hint">Список хранится только в этом браузере. Приглашения пока не отправляются другим игрокам.</p></article></section>;
}

function History() {
 const [filter,setFilter]=useState<"Все"|"Победы"|"Поражения">("Все");
 const visible=demoMatches.filter(m=>filter==="Все"||(filter==="Победы"?m.result==="Победа":m.result==="Поражение"));
 return <section className="page"><small>ТВОИ РЕЗУЛЬТАТЫ</small><h1 className="page-title">ИСТОРИЯ <em>МАТЧЕЙ</em></h1><article className="card"><div className="history-summary"><div><strong>3</strong><span>матча · демо</span></div><div><strong>2</strong><span>победы</span></div><div><strong>67%</strong><span>винрейт</span></div></div><div className="history-filters">{(["Все","Победы","Поражения"] as const).map(item=><button key={item} className={filter===item?"chosen":""} onClick={()=>setFilter(item)}>{item}</button>)}</div>{visible.map((m,i)=><div className="match-row" key={i}><div><b>{m.map}</b><small>{m.mode} · {m.date}</small></div><span className={m.result==="Победа"?"win":"loss"}>{m.result}</span><b>{m.score}</b><strong className={m.result==="Победа"?"win":"loss"}>{m.elo}</strong></div>)}{visible.length===0&&<p className="hint">В этой категории пока нет матчей.</p>}<p className="hint">Пока это примеры для проверки интерфейса, а не реальные результаты аккаунта.</p></article></section>;
}

type PlayerProfile={nickname:string;playerId:string;hours:string};
const emptyProfile:PlayerProfile={nickname:"Игрок RATEIT",playerId:"",hours:""};
function Profile() {
 const [profile,setProfile]=useState<PlayerProfile>(()=>{try{const s=localStorage.getItem("rateit-demo-profile");return s?{...emptyProfile,...JSON.parse(s) as Partial<PlayerProfile>}:emptyProfile}catch{return emptyProfile}});
 const [editing,setEditing]=useState(false);const [draft,setDraft]=useState(profile);const [message,setMessage]=useState("");
 useEffect(()=>{localStorage.setItem("rateit-demo-profile",JSON.stringify(profile))},[profile]);
 const save=()=>{const hours=draft.hours.trim();if(hours&&(!/^\d+$/.test(hours)||Number(hours)>100000)){setMessage("Укажи корректное количество часов.");return}setProfile({nickname:draft.nickname.trim().slice(0,24)||"Игрок RATEIT",playerId:draft.playerId.trim().slice(0,64),hours});setEditing(false);setMessage("Данные сохранены в этом браузере.")};
 const shownHours=profile.hours?`${Math.floor(Number(profile.hours)/10)*10}+`:"не подтверждены";
 return <section className="page"><small>АККАУНТ И СТАТИСТИКА</small><h1 className="page-title">ТВОЙ <em>ПРОФИЛЬ</em></h1><article className="card profile-card"><div className="profile-head"><div className="profile-avatar">{profile.nickname.slice(0,1).toUpperCase()}</div><div><h2>{profile.nickname}</h2><p>Standoff 2 ID: {profile.playerId||"не указан"}</p><p>Игровые часы: {shownHours}</p></div><b className="level-badge">3</b></div>{editing?<div className="profile-editor"><label>Игровой ник<input maxLength={24} value={draft.nickname} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label><label>Standoff 2 ID<input maxLength={64} value={draft.playerId} onChange={e=>setDraft({...draft,playerId:e.target.value})} placeholder="Введи свой ID"/></label><label>Игровые часы<input inputMode="numeric" value={draft.hours} onChange={e=>setDraft({...draft,hours:e.target.value})} placeholder="Например, 187"/></label><div className="editor-actions"><button className="primary" onClick={save}>СОХРАНИТЬ</button><button className="secondary" onClick={()=>{setDraft(profile);setEditing(false);setMessage("")}}>ОТМЕНА</button></div></div>:<button className="secondary edit-profile" onClick={()=>{setDraft(profile);setEditing(true)}}>РЕДАКТИРОВАТЬ ПРОФИЛЬ ✎</button>}{message&&<p className="hint" role="status">{message}</p>}<div className="elo">751 <span>ELO · УРОВЕНЬ 3</span></div><div className="bar"><i/></div><p className="between">Следующий уровень <b>900 ELO</b></p><div className="stats-grid"><div><b>—</b><span>K/D</span></div><div><b>—</b><span>Победы</span></div><div><b>—</b><span>Матчи</span></div><div><b>—</b><span>Винрейт</span></div></div><p className="notice">Это демо-профиль. Данные сохраняются в этом браузере, но пока не отправляются на сервер и не проверяются по Standoff 2.</p></article></section>;
}

export default function App() {
  const [active, setActive] = useState<Tab>("Главная");
  const content = active === "Главная" ? <Home go={setActive} /> : active === "Играть" ? <Play /> : active === "Друзья" ? <Friends /> : active === "История" ? <History /> : <Profile />;
  return <main className="app">
    <header><a className="logo" onClick={() => setActive("Главная")}>RATE<span>IT</span></a><div className="online">● ПРОЕКТ В РАЗРАБОТКЕ</div><button className="avatar" onClick={() => setActive("Профиль")}>R</button></header>
    {content}
    <nav>{tabs.map((t, i) => <button key={t} className={active === t ? "active" : ""} onClick={() => setActive(t)}><strong>{["⌂", "♧", "+", "▤", "◉"][i]}</strong>{t}</button>)}</nav>
  </main>;
}