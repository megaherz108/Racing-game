// Ситжес — ПОСТРОЙКА: материал зданий с фасадом по этажам. Окна рисуются в шейдере по атрибуту aFac каждой вершины:
//   x — номер оконной оси вдоль стены (на ребре их целое число — окна не режутся углом), y — уровень первого этажа
//   (крыша − высота по этажам: первый этаж SITGES_FLOOR.ground, выше — по SITGES_FLOOR.h), z — земля у стены
//   (ниже неё окон нет: на склоне нижние этажи уходят в землю), w — вид стены (SITGES_WALL, js/maps/sitges/houses.js):
//   двор — окна; глухая — без окон, серее и в пятнах (брандмауэр); к улице — первый этаж с витринами и дверями
//   (у магазинов — сплошь витрины); плоская крыша; черепица (x, z — координаты вдоль карниза и вниз по скату,
//   js/maps/sitges/roofs3d.js).
// Стиль фасада (этап 4) — атрибут aSty: x — номер стиля SITGES_STYLES (js/maps/sitges/styles.js): размер окон, ставни
//   (створки по бокам или роллет сверху, часть закрыта), цоколь, балконы; y — цвет ставен SITGES_SHUTTERS;
//   z — номер здания (правило балконов sitgesBalcony — то же, что у плит балконов в раскладке: там окно — дверь).
// Ночью горит часть окон и витрины (NIGHT_U, js/sky.js).
// Определяет: SITGES_FAC, sitgesFacadeMat.
// Использует: NIGHT_U (js/world.js); SITGES_FLOOR (js/maps/sitges/plan.js); SITGES_STYLES, SITGES_SHUTTERS
//   (js/maps/sitges/styles.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// витрина и дверь первого этажа: доля ширины оси и высота над землёй, м
const SITGES_FAC = { shop: [0.12, 0.88], shopY: [0.4, 2.8], door: [0.34, 0.66], doorY: [0.05, 2.5],
  shopP: 0.3,       // у жилого дома к улице: доля осей первого этажа с витриной; ещё 0,25 — двери, остальное — окна
  avg: 0.2,         // средняя доля стекла на стене — так фасад выглядит издали
  closed: 0.3,      // доля окон с закрытыми ставнями
  near: 0.12, far: 0.35, // окна растворяются в средний тон, когда ось окна (3,1 м) уже 1/near … 1/far пикселей; дальше far
                    // шейдер окна не считает вовсе (дорого на встроенной видеокарте)
  tileW: 0.24, tileL: 0.36 };  // черепица (вид SITGES_WALL.tile): шаг рядов вдоль карниза и вниз по скату, м

function sitgesFacadeMat() {
  const F = SITGES_FLOOR, A = SITGES_FAC, f = v => v.toFixed(3), N = SITGES_STYLES.length;
  const lin = hex => { const c = new THREE.Color(hex); return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`; };
  // таблицы стилей для шейдера: окно (x0, x1, y0, y1), (тип ставен, —, цоколь, балконы), доля осей с балконом
  const stWin = SITGES_STYLES.map(s => `vec4(${f(s.win[0])}, ${f(s.win[1])}, ${f(s.winY[0])}, ${f(s.winY[1])})`).join(', ');
  const stP = SITGES_STYLES.map(s => `vec4(${f(s.shutType)}, ${f(s.frame)}, ${f(s.plinth)}, ${f(s.bal)})`).join(', ');
  const stK = SITGES_STYLES.map(s => f(s.balK)).join(', ');
  const shut = SITGES_SHUTTERS.map(lin).join(', ');
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFac;
        attribute vec3 aSty;
        varying vec4 vFac;
        varying float vWy;
        // параметры стиля — выборкой из таблиц здесь, по вершине (во фрагментном шейдере индексы по таблицам дороги)
        varying vec4 vWin;     // окно в оси: x0, x1 (доли), y0, y1 над полом этажа, м
        varying vec4 vSP;      // тип ставен, —, высота цоколя, балконы
        varying vec3 vShC;     // цвет ставен
        varying vec2 vBal;     // доля осей с балконом (из 5), номер здания
        const vec4 ST_WIN[${N}] = vec4[${N}](${stWin});
        const vec4 ST_P[${N}] = vec4[${N}](${stP});
        const float ST_K[${N}] = float[${N}](${stK});
        const vec3 SH_COL[${SITGES_SHUTTERS.length}] = vec3[${SITGES_SHUTTERS.length}](${shut});`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFac = aFac;
        vWy = (modelMatrix * vec4(transformed, 1.0)).y;
        int si = int(aSty.x + 0.5);
        vWin = ST_WIN[si]; vSP = ST_P[si]; vShC = SH_COL[int(aSty.y + 0.5)]; vBal = vec2(ST_K[si], aSty.z);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac;
        varying float vWy;
        varying vec4 vWin;
        varying vec4 vSP;
        varying vec3 vShC;
        varying vec2 vBal;
        uniform float uNight;
        // доли пикселя: стекло, витрина, дверь, ставни (и их полосы), цоколь; fH — случайное окна
        float fWin = 0.0, fShop = 0.0, fDoor = 0.0, fSh = 0.0, fShL = 1.0, fPl = 0.0, fH = 0.0;
        // хэш без sin (Hoskins hash11): sin с большим аргументом на встроенных видеокартах дорог
        float fHash(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
        // прямоугольник [x0, x1] × [y0, y1]
        float fBox(float x, float y, float x0, float x1, float y0, float y1) { return step(x0, x) * step(x, x1) * step(y0, y) * step(y, y1); }
        void fWindows() {
          // производные — до ветвлений (в неоднородном потоке управления они не определены)
          float fw = max(fwidth(vFac.x), fwidth(vWy) * 0.33);
          float kind = vFac.w;
          if (kind > 3.5) return;                                      // крыши
          vec4 WN = vWin, SP = vSP;
          float above = vWy - vFac.z;                                  // над землёй у стены
          fPl = step(above, SP.z) * step(0.0, above);
          if (abs(kind - 1.0) < 0.5) return;                           // глухая стена
          // вдали (ось окна в паре пикселей) — сразу средний тон: окна и ставни всё равно растворены
          if (fw > ${f(A.far)}) { fWin = ${f(A.avg)} * step(0.3, above); fH = fHash(floor(vFac.x) * 7.13 + floor(vWy / ${f(F.h)}) * 3.71 + vFac.y * 0.37); return; }
          float y = vWy - vFac.y;                                      // над уровнем первого этажа
          float col = floor(vFac.x), cx = fract(vFac.x), id;
          vec4 R = vec4(0.0);                                          // окно этого пикселя (x0, x1, y0, y1) в его этаже
          float fy = 0.0;
          if (y > ${f(F.ground)}) {                                    // верхние этажи
            float fl = (y - ${f(F.ground)}) / ${f(F.h)}, j = floor(fl);
            fy = fract(fl) * ${f(F.h)};
            R = WN;
            // балкон (как sitgesBalcony): окно — дверь до пола
            bool street = kind > 1.5;
            float bal = SP.w;
            bool hasBal = street && (bal > 2.5 || (bal > 1.5 && j < 0.5) || (bal > 0.5 && bal < 1.5 && mod(col * 7.0 + vBal.y, 5.0) < vBal.x));
            if (hasBal) R = vec4(WN.x, WN.y, 0.05, max(WN.w, 2.3));
            id = col * 7.13 + j * 3.71;
          } else if (kind > 1.5) {                                     // первый этаж к улице: витрины и двери
            float h = fHash(col * 1.37 + vFac.y * 0.71);
            fy = y;
            if (kind > 2.5 || h < ${f(A.shopP)}) {
              fShop = fBox(cx, above, ${f(A.shop[0])}, ${f(A.shop[1])}, ${f(A.shopY[0])}, ${f(A.shopY[1])}) * step(y, ${f(F.ground - 0.5)});
            } else if (h < ${f(A.shopP + 0.25)}) {                     // подъезд или ворота
              fDoor = fBox(cx, above, ${f(A.door[0])}, ${f(A.door[1])}, ${f(A.doorY[0])}, ${f(A.doorY[1])});
            } else R = vec4(WN.x, WN.y, max(WN.z, 1.0), min(WN.w, 2.7));
            id = col * 7.13 - 5.0;
          } else {                                                     // первый этаж во двор
            fy = y;
            R = vec4(WN.x, WN.y, max(WN.z, 1.0), min(WN.w, 2.7));
            id = col * 7.13 - 5.0;
          }
          fH = fHash(id + vFac.y * 0.37);
          if (R.y > R.x) {
            float inWin = fBox(cx, fy, R.x, R.y, R.z, R.w);
            // ставни: 1 — створки по бокам (жалюзи), часть окон закрыта; 2 — роллет сверху, опущен на долю окна
            float closed = step(1.0 - ${f(A.closed)}, fract(fH * 7.7));
            if (SP.x > 0.5 && SP.x < 1.5) {
              float lw = (R.y - R.x) * 0.5;
              float side = fBox(cx, fy, R.x - lw, R.x, R.z, R.w) + fBox(cx, fy, R.y, R.y + lw, R.z, R.w);
              fSh = mix(side, inWin, closed);
              fShL = 0.78 + 0.22 * step(0.45, fract(fy / 0.07));
            } else if (SP.x > 1.5) {
              float down = (R.w - R.z) * (0.1 + 0.75 * fract(fH * 3.3) * fract(fH * 3.3));
              fSh = inWin * step(R.w - down, fy);
              fShL = 0.84 + 0.16 * step(0.4, fract(fy / 0.05));
            }
            fWin = inWin * (1.0 - fSh);
          }
          float ok = step(0.3, above);
          fWin = max(max(fWin, fShop), fDoor) * ok;
          fSh *= ok;
          // вдали оконная ось уже нескольких пикселей — вместо ряби средний тон (доля стекла на стене)
          float fade = smoothstep(${f(A.near)}, ${f(A.far)}, fw);
          fWin = mix(fWin, ${f(A.avg)} * ok, fade);
          fShop *= 1.0 - fade; fDoor *= 1.0 - fade; fSh *= 1.0 - fade;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFac.w > 4.5) {
          // черепица: x — вдоль карниза, z — вниз по скату, м. Желобки между рядами «труб» и ступеньки рядов;
          // вдали — ровный средний тон
          vec2 tu = vec2(vFac.x / ${f(A.tileW)}, vFac.z / ${f(A.tileL)});
          float tw = max(fwidth(tu.x), fwidth(tu.y)), tf = smoothstep(0.25, 0.6, tw);
          float ch = fract(tu.x), crs = fract(tu.y + 0.5 * step(0.5, fract(floor(tu.x) * 0.5)));
          float sh = (0.78 + 0.88 * ch * (1.0 - ch)) * (0.86 + 0.14 * smoothstep(0.0, 0.3, crs));
          diffuseColor.rgb *= mix(sh, 0.9, tf);
        }
        if (abs(vFac.w - 1.0) < 0.5) {
          // брандмауэр: серее, пятна сырости и штукатурки крупными кусками
          float bl = fHash(floor(vFac.x * 0.8) * 5.1 + floor(vWy * 0.4) * 13.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))), 0.45) * (0.8 + 0.12 * bl);
        }
        fWindows();
        // цоколь темнее (камень, плитка), ставни — цвет стиля с полосами жалюзи
        diffuseColor.rgb *= 1.0 - 0.22 * fPl;
        diffuseColor.rgb = mix(diffuseColor.rgb, vShC * fShL, fSh);
        // стекло: тёмное с лёгким отражением неба; витрины — светлее (за стеклом свет магазина); двери — дерево
        vec3 fGlass = mix(mix(vec3(0.07, 0.10, 0.14), vec3(0.24, 0.24, 0.22), fShop), vec3(0.26, 0.17, 0.10), fDoor);
        diffuseColor.rgb = mix(diffuseColor.rgb, fGlass, fWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.001) {
          float on = step(0.62 - uNight * 0.2, fH);
          vec3 lamp = mix(vec3(1.0, 0.72, 0.42), vec3(0.62, 0.78, 1.0), step(0.82, fract(fH * 17.3)));
          totalEmissiveRadiance += uNight * (fWin * lamp * on * (0.38 + fract(fH * 5.1) * 0.5) * (1.0 - fShop - fDoor) + vec3(1.0, 0.86, 0.62) * fShop * 1.1);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, mix(0.12, 0.7, fDoor), fWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.5 * (1.0 - fDoor), fWin);`);
  };
  return m;
}
