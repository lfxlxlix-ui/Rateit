import { useState } from "react";

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
  const [searching, setSearching] = useState(false);
  return <section className="page">
    <small>МАТЧМЕЙКИНГ</small><h1 className="page-title">НАЙДИ СВОЮ <em>ИГРУ</em></h1>
    <article className="card"><h2>Выбери режим</h2><p>Режимы доступны для предварительного просмотра. Финальный список ещё утверждается.</p>
      <div className="modes">{(["5×5", "2×2"] as const).map(x => <button key={x} className={mode === x ? "chosen" : ""} onClick={() => { setMode(x); setSearching(false); }}>{x}</button>)}</div>
      <div className="queue-info"><span>Режим</span><b>{mode}</b><span>Стартовый ELO</span><b>751</b><span>Ограничение по часам</span><b>±50 часов</b></div>
      <button className="primary wide" onClick={() => setSearching(!searching)}>{searching ? "ОТМЕНИТЬ ПОИСК" : "НАЧАТЬ ПОИСК　↗"}</button>
      {searching && <p className="notice">Демонстрация: подключение к реальной очереди матчмейкинга ещё не настроено.</p>}
    </article>
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