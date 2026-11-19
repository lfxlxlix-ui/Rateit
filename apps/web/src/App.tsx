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
  </>;
}

function Play() {
  const [mode, setMode] = useState<"5×5" | "2×2">("5×5");
  const [stage, setStage] = useState<"setup" | "searching" | "found" | "banning" | "finished">("setup");
  const [banned, setBanned] = useState<string[]>([]);
  const [botTurn, setBotTurn] = useState(false);
  const maps = ["Sandstone", "Province", "Rust", "Zone 9", "Breeze", "Dune", "Sakura"];
  const remaining = maps.filter((map) => !banned.includes(map));

  useEffect(() => {
    if (stage !== "searching") return;
    const timer = window.setTimeout(() => setStage("found"), 1400);
    return () => window.clearTimeout(timer);
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
      <div className="found-label">✓ МАТЧ НАЙДЕН</div><h2>Все игроки готовы?</h2><p>Тестовое лобби {mode}. Боты уже автоматически подтвердили участие.</p>
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
      <button className="primary wide" onClick={startSearch}>СЫГРАТЬ ЕЩЁ РАЗ ↗</button>
      <button className="secondary wide" onClick={cancel}>ВЕРНУТЬСЯ</button>
    </article>}
  </section>;
}
function Friends() {
  return <section className="page"><small>СООБЩЕСТВО</small><h1 className="page-title">ТВОИ <em>ДРУЗЬЯ</em></h1><article className="card empty"><div className="empty-icon">♧</div><h2>Здесь будет твоя команда</h2><p>Добавляй игроков, следи за их рейтингом и собирай группу для совместных матчей.</p><button className="secondary" disabled>ДОБАВИТЬ ДРУГА · СКОРО</button></article></section>;
}

function History() {
  return <section className="page"><small>ТВОИ РЕЗУЛЬТАТЫ</small><h1 className="page-title">ИСТОРИЯ <em>МАТЧЕЙ</em></h1><article className="card"><div className="history-summary"><div><strong>3</strong><span>матча</span></div><div><strong>2</strong><span>победы</span></div><div><strong>67%</strong><span>винрейт</span></div></div>{demoMatches.map((m, i) => <div className="match-row" key={i}><div><b>{m.map}</b><small>{m.mode} · {m.date}</small></div><span className={m.result === "Победа" ? "win" : "loss"}>{m.result}</span><b>{m.score}</b><strong className={m.result === "Победа" ? "win" : "loss"}>{m.elo}</strong></div>)}<p className="hint">Пример интерфейса. Реальные результаты появятся после подключения матчей RATEIT.</p></article></section>;
}

function Profile() {
  return <section className="page"><small>АККАУНТ И СТАТИСТИКА</small><h1 className="page-title">ТВОЙ <em>ПРОФИЛЬ</em></h1><article className="card profile-card"><div className="profile-head"><div className="profile-avatar">R</div><div><h2>Игрок RATEIT</h2><p>Standoff 2 ID: не указан</p><p>Игровые часы: не подтверждены</p></div><b className="level-badge">3</b></div><div className="elo">751 <span>ELO · УРОВЕНЬ 3</span></div><div className="bar"><i /></div><p className="between">Следующий уровень <b>900 ELO</b></p><div className="stats-grid"><div><b>—</b><span>K/D</span></div><div><b>—</b><span>Победы</span></div><div><b>—</b><span>Матчи</span></div><div><b>—</b><span>Винрейт</span></div></div><p className="notice">Это демонстрационный профиль. Регистрация и привязка Standoff 2 ID будут добавлены отдельно.</p></article></section>;
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