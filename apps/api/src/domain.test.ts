import test from "node:test";
import assert from "node:assert/strict";
import {
  START_ELO,
  MAX_HOURS_DIFFERENCE,
  getHoursPrefix,
  getRank,
  isHoursRangeCompatible,
  MAX_PLAYER_HOURS,
  normalizeNickname,
  normalizeStandoff2Id,
  parsePlayerHours
} from "../../../packages/shared/src/index.js";

test("новый игрок начинает с 751 ELO и получает уровень 3", () => {
  assert.equal(START_ELO, 751);
  assert.equal(getRank(START_ELO), "3");
});

test("границы уровней ELO соответствуют правилам RATEIT", () => {
  const cases: Array<[number, string]> = [
    [99, "Без уровня"],
    [100, "1"],
    [500, "1"],
    [501, "2"],
    [750, "2"],
    [751, "3"],
    [899, "3"],
    [900, "4"],
    [1049, "4"],
    [1050, "5"],
    [1199, "5"],
    [1200, "6"],
    [1349, "6"],
    [1350, "7"],
    [1529, "7"],
    [1530, "8"],
    [1749, "8"],
    [1750, "9"],
    [1999, "9"],
    [2000, "10"],
    [2500, "10"]
  ];

  for (const [elo, expected] of cases) {
    assert.equal(getRank(elo), expected, `ELO ${elo}`);
  }
});

test("часы отображаются с округлением вниз до десятков", () => {
  assert.equal(getHoursPrefix(178), "170+");
  assert.equal(getHoursPrefix(187), "180+");
  assert.equal(getHoursPrefix(193), "190+");
  assert.equal(getHoursPrefix(205), "200+");
  assert.equal(getHoursPrefix(0), "0+");
});

test("некорректные часы отклоняются", () => {
  assert.throws(() => getHoursPrefix(-1), /Некорректное количество часов/);
  assert.throws(() => getHoursPrefix(Number.NaN), /Некорректное количество часов/);
  assert.throws(() => getHoursPrefix(Number.POSITIVE_INFINITY), /Некорректное количество часов/);
});

test("разница часов 50 включительно допускается, 51 — нет", () => {
  assert.equal(MAX_HOURS_DIFFERENCE, 50);
  assert.equal(isHoursRangeCompatible(100, 150), true);
  assert.equal(isHoursRangeCompatible(150, 100), true);
  assert.equal(isHoursRangeCompatible(100, 151), false);
  assert.equal(isHoursRangeCompatible(100, 100), true);
});


test("ник нормализуется и ограничивается 24 символами", () => {
  assert.equal(normalizeNickname("  Player   One  "), "Player One");
  assert.equal(normalizeNickname(""), null);
  assert.equal(normalizeNickname("x".repeat(25)), null);
  assert.equal(normalizeNickname("Player\\nAdmin"), null);
  assert.equal(normalizeNickname(123), null);
});

test("Standoff 2 ID проверяется без предположений о его формате", () => {
  assert.equal(normalizeStandoff2Id("  12345-abc  "), "12345-abc");
  assert.equal(normalizeStandoff2Id(""), null);
  assert.equal(normalizeStandoff2Id("x".repeat(65)), null);
  assert.equal(normalizeStandoff2Id("abc\\u0000def"), null);
  assert.equal(normalizeStandoff2Id(12345), null);
});

test("часы профиля принимают целые значения от 0 до 100000", () => {
  assert.equal(MAX_PLAYER_HOURS, 100000);
  assert.equal(parsePlayerHours("187"), 187);
  assert.equal(parsePlayerHours(0), 0);
  assert.equal(parsePlayerHours(""), null);
  assert.equal(parsePlayerHours(undefined), null);
  assert.equal(parsePlayerHours("-1"), null);
  assert.equal(parsePlayerHours("1.5"), null);
  assert.equal(parsePlayerHours("100001"), null);
  assert.equal(parsePlayerHours("abc"), null);
});
