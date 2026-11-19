// Ситжес — РАСКЛАДКА: проезжая часть под точкой (после углов, js/maps/sitges/corners.js). Запросы для следующих
// этапов: обрезка тротуаров (walks.js), фасады к улице (houses.js), покрытие под колёсами, разметка, ограды (постройка).
//   C.carriageAt(x, z, skip, m) — { st, i, t, d, corner }: улица и место на ней (d — от оси), corner — асфальт
//     скруглённого угла; skip — эту улицу не считать, m — запас, м. Вызывается очень часто: индексные циклы, без
//     лишних объектов (поэтому проекция на отрезок здесь своя, не sitgesSeg).
//   C.carriageNear(x0, x1, z0, z1, skip) — отрезки проезжей части других улиц у прямоугольника: [[st, i], …].
// Определяет: sitgesPlanCarriage.
// Использует: clamp (js/core.js); sitgesCells (js/maps/sitges/geom.js); sitgesInFillet (js/maps/sitges/corners.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function sitgesPlanCarriage(C) {
  const { streets, cornersAt } = C;
  // отрезки проезжих и пешеходных улиц по клеткам 16 м (с запасом полуширины)
  const carr = sitgesCells(16);
  for (const st of streets) {
    if (!st.drive && st.cls !== 'pedestrian') continue;
    st.v.forEach((a, i) => {
      if (i === st.v.length - 1) return;
      const b = st.v[i + 1], m = Math.max(a.hw, b.hw);
      carr.add(Math.min(a.x, b.x) - m, Math.max(a.x, b.x) + m, Math.min(a.z, b.z) - m, Math.max(a.z, b.z) + m, [st, i]);
    });
  }
  const carriageAt = (x, z, skip = null, m = 0) => {
    const list = carr.at(x, z);
    if (list.length) {
      let best = null, bk = Infinity;
      for (let n = 0; n < list.length; n++) {
        const st = list[n][0], i = list[n][1];
        if (st === skip) continue;
        const a = st.v[i], b = st.v[i + 1], dx = b.x - a.x, dz = b.z - a.z, LL = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / LL, 0, 1), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
        const hw = a.hw + (b.hw - a.hw) * t + m;
        if (d < hw && d / hw < bk) { bk = d / hw; best = { st, i, t, d, corner: null }; }
      }
      if (best) return best;
    }
    // асфальт скруглённого угла
    const cs = cornersAt(x, z);
    for (let n = 0; n < cs.length; n++) {
      const c = cs[n];
      if (c.a.st !== skip && c.b.st !== skip && sitgesInFillet(c, x, z)) return { st: c.a.st, i: Math.min(c.a.i, c.a.st.v.length - 2), t: 0, d: 0, corner: c };
    }
    return null;
  };

  const carriageNear = (minX, maxX, minZ, maxZ, skip = null) => {
    const out = [], got = new Set();
    carr.each(minX, maxX, minZ, maxZ, list => {
      for (const e of list) {
        const [st, i] = e;
        if (st === skip || got.has(e)) continue;
        got.add(e);
        const a = st.v[i], b = st.v[i + 1], m = Math.max(a.hw, b.hw);
        if (Math.min(a.x, b.x) - m > maxX || Math.max(a.x, b.x) + m < minX || Math.min(a.z, b.z) - m > maxZ || Math.max(a.z, b.z) + m < minZ) continue;
        out.push(e);
      }
    });
    return out;
  };
  Object.assign(C, { carriageAt, carriageNear });
}
