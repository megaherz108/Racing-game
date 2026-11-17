// Ситжес — ПОСТРОЙКА: материал зданий с фасадом по этажам. Окна рисуются в шейдере по атрибуту aFac каждой вершины:
//   x — номер оконной оси вдоль стены (на ребре их целое число — окна не режутся углом), y — уровень первого этажа
//   (крыша − высота по этажам: первый этаж SITGES_FLOOR.ground, выше — по SITGES_FLOOR.h), z — земля у стены
//   (ниже неё окон нет: на склоне нижние этажи уходят в землю), w — вид стены (SITGES_WALL, js/maps/sitges/houses.js):
//   двор — окна; глухая — без окон; к улице — первый этаж с витринами и дверями (у магазинов — сплошь витрины); крыша.
// Этап 3 — один стиль на весь город (балконные двери в простенках); стили районов, ставни, цвет — этап 4.
// Ночью горит часть окон и витрины (NIGHT_U, js/sky.js).
// Определяет: SITGES_FAC, sitgesFacadeMat.
// Использует: NIGHT_U (js/world.js); SITGES_FLOOR (js/maps/sitges/plan.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

// окно в оконной оси: доля ширины оси и высота над полом этажа, м; витрина — от земли
const SITGES_FAC = { win: [0.31, 0.69], winY: [0.75, 2.5], shop: [0.12, 0.88], shopY: [0.4, 2.8], door: [0.34, 0.66], doorY: [0.05, 2.5],
  shopP: 0.3,       // у жилого дома к улице: доля осей первого этажа с витриной; ещё 0,25 — двери, остальное — окна
  avg: 0.2 };       // средняя доля стекла на стене — так фасад выглядит издали

function sitgesFacadeMat() {
  const F = SITGES_FLOOR, A = SITGES_FAC, f = v => v.toFixed(3);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, metalness: 0.0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = NIGHT_U;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFac;
        varying vec4 vFac;
        varying float vWy;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFac = aFac;
        vWy = (modelMatrix * vec4(transformed, 1.0)).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFac;
        varying float vWy;
        uniform float uNight;
        float fWin = 0.0, fShop = 0.0, fDoor = 0.0, fH = 0.0;
        float fHash(float n) { return fract(sin(n) * 43758.5453); }
        void fWindows() {
          // производные — до ветвлений (в неоднородном потоке управления они не определены)
          float fw = max(fwidth(vFac.x), fwidth(vWy) * 0.33);
          float kind = vFac.w;
          if (abs(kind - 1.0) < 0.5 || kind > 3.5) return;           // глухая стена, крыша
          float y = vWy - vFac.y, above = vWy - vFac.z;               // над уровнем первого этажа, над землёй
          float col = floor(vFac.x), cx = fract(vFac.x), id;
          if (y > ${f(F.ground)}) {                                  // верхние этажи
            float fl = (y - ${f(F.ground)}) / ${f(F.h)}, fy = fract(fl) * ${f(F.h)};
            fWin = step(${f(A.win[0])}, cx) * step(cx, ${f(A.win[1])}) * step(${f(A.winY[0])}, fy) * step(fy, ${f(A.winY[1])});
            id = col * 7.13 + floor(fl) * 3.71;
          } else if (kind > 1.5) {                                    // первый этаж к улице: витрины и двери
            float h = fHash(col * 1.37 + vFac.y * 0.71);
            if (kind > 2.5 || h < ${f(A.shopP)}) {
              fShop = step(${f(A.shop[0])}, cx) * step(cx, ${f(A.shop[1])}) * step(${f(A.shopY[0])}, above) * step(above, ${f(A.shopY[1])})
                * step(y, ${f(F.ground - 0.5)});
            } else if (h < ${f(A.shopP + 0.25)}) {                    // подъезд или ворота
              fDoor = step(${f(A.door[0])}, cx) * step(cx, ${f(A.door[1])}) * step(${f(A.doorY[0])}, above) * step(above, ${f(A.doorY[1])});
            } else {
              fWin = step(${f(A.win[0])}, cx) * step(cx, ${f(A.win[1])}) * step(1.0, y) * step(y, 2.7);
            }
            id = col * 7.13 - 5.0;
          } else {                                                    // первый этаж во двор
            fWin = step(${f(A.win[0])}, cx) * step(cx, ${f(A.win[1])}) * step(1.0, y) * step(y, 2.7);
            id = col * 7.13 - 5.0;
          }
          fWin = max(max(fWin, fShop), fDoor) * step(0.3, above);
          fH = fHash(id + vFac.y * 0.37);
          // вдали оконная ось уже нескольких пикселей — вместо ряби средний тон (доля стекла на стене)
          float fade = smoothstep(0.12, 0.35, fw);
          fWin = mix(fWin, ${f(A.avg)} * step(0.3, above), fade);
          fShop *= 1.0 - fade; fDoor *= 1.0 - fade;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        fWindows();
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
