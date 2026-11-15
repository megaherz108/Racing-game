// Город — ПОСТРОЙКА: здания и сооружения.
// cityBuildBuildings — корпуса (шейдер фасадов makeBuildingMaterial), скошенные крыши, купола, пирамиды, баки,
//   вертолётные площадки, неон, бассейны, контейнеры, настилы мостов и трамплинов (Decks → K.decks).
// cityBuildStructures — уникальные объекты (buildCityLandmarks, js/maps/city/landmarks.js), опоры эстакады,
//   ограждение и стенки канала и гавани.
// Порядок этапов — в buildCity() (js/maps/city/build.js).
// Определяет: cityBuildBuildings, cityBuildStructures.
// Использует: makeBuildingMaterial, instChunks, stdMat, setInst, Decks (js/world.js); Weather (js/weather.js);
//   ribTexture, hazardTexture (js/maps/city/textures.js); helipadTexture, buildCityLandmarks
//   (js/maps/city/landmarks.js).
// Обычный (не модульный) скрипт: все файлы делят общую глобальную область видимости.
// Порядок загрузки задаётся в index.html.

function cityBuildBuildings(K) {
  const { D, group, grid, box1, colorBox, xzOf } = K;
  /* ---------- здания ---------- */
  const bMat = makeBuildingMaterial();
  const facade = o => o.st || 0;
  instChunks(group, box1, bMat, D.towers, xzOf, colorBox, true, facade);
  const slantGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  { const p = slantGeo.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9 && p.getX(i) > 0) p.setY(i, 0.02); slantGeo.computeVertexNormals(); }
  instChunks(group, slantGeo, bMat, D.slants, xzOf, colorBox, true, facade);
  // купола, пирамидальные и вальмовые крыши, баки для воды, вертолётные площадки
  instChunks(group, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(0x6fae95, { metalness: 0.45, roughness: 0.5 }), D.domes, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, o.r * 0.9, o.r));
  instChunks(group, new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), stdMat(0xffffff, { roughness: 0.6, flatShading: true }), D.pyramids, xzOf, colorBox);
  const tankGeo = mergeGeometries([
    ...[[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].map(([a, b]) => new THREE.BoxGeometry(0.16, 2, 0.16).translate(a, 1, b)),
    new THREE.CylinderGeometry(1.45, 1.45, 2.6, 14).translate(0, 3.3, 0), new THREE.ConeGeometry(1.55, 0.9, 14).translate(0, 5.05, 0)]);
  instChunks(group, tankGeo, stdMat(0x7a5a3c, { roughness: 0.85 }), D.rtanks, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.s, o.s, o.s, o.x));
  instChunks(group, new THREE.CylinderGeometry(1, 1, 0.15, 32).translate(0, 0.075, 0), new THREE.MeshStandardMaterial({ map: helipadTexture(), roughness: 0.8 }), D.helipads, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, 1, o.r), false);
  instChunks(group, box1, stdMat(0x5b6068, { roughness: 0.8 }), D.caps, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d));
  instChunks(group, box1, stdMat(0x9aa0a6, { roughness: 0.6, metalness: 0.3 }), D.units, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h, o.d));
  instChunks(group, new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0), stdMat(0xc9ced4, { metalness: 0.8, roughness: 0.3 }), D.spires, xzOf,
    (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.r, o.h, o.r));
  instChunks(group, box1, stdMat(0xffffff, { roughness: 0.8 }), D.plain, xzOf, colorBox);
  const prismGeo = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.5, 0).scale(1 / Math.sqrt(3), 1 / 1.5, 1);
  instChunks(group, prismGeo, stdMat(0xffffff, { roughness: 0.75, flatShading: true }), D.roofs, xzOf, colorBox);
  instChunks(group, box1, new THREE.MeshBasicMaterial({ color: 0xffffff }), D.neon, xzOf, colorBox, false);
  instChunks(group, box1, stdMat(0x3fb7e8, { roughness: 0.05, metalness: 0.1 }), D.pools, xzOf, (m, i, o) => setInst(m, i, o.x, o.y, o.z, o.w, o.h + 0.05, o.d), false);
  for (const s of D.solids) grid.addBox(s.minX, s.maxX, s.minZ, s.maxZ, s.h);

  /* ---------- контейнеры ---------- */
  const contGeo = new THREE.BoxGeometry(12.2, 2.6, 2.44).translate(0, 1.3, 0);
  instChunks(group, contGeo, stdMat(0xffffff, { map: ribTexture(), roughness: 0.7, metalness: 0.2 }), D.containers, xzOf,
    (m, i, o) => { setInst(m, i, o.x, o.y, o.z, 1, 1, 1); m.setColorAt(i, _col.setHex(o.color)); });

  /* ---------- мосты, трамплины ---------- */
  const decks = new Decks();
  for (const p of D.deckPlan) {
    const o = { walk: p.walk, mat: p.mat, hidden: p.hidden };
    let p0 = p.p0, p1 = p.p1;
    if (p.ext) {      // удлинить плиту по оси на ext с каждого конца (стыки дуг)
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2], L = Math.hypot(dx, dz), k = p.ext / L;
      p0 = [p0[0] - dx * k, p0[1] - dy * k, p0[2] - dz * k]; p1 = [p1[0] + dx * k, p1[1] + dy * k, p1[2] + dz * k];
    }
    if (p.kind === 'wedge') decks.wedge(p0, p1, p.w, p.base, o); else decks.slab(p0, p1, p.w, p.t, o);
  }
  const haz = hazardTexture(); haz.repeat.set(4, 1);
  decks.build(group, {
    deck: Weather.wet(stdMat(0x45494f, { roughness: 0.9 })), rail: stdMat(0xd8dde3, { metalness: 0.5, roughness: 0.4 }), steel: stdMat(0x5a7184, { metalness: 0.6, roughness: 0.5 }),
    hazard: stdMat(0xffffff, { map: haz, roughness: 0.6 }), tower: stdMat(0x8d8f93, { roughness: 0.85 }), wedge: stdMat(0xc96a2b, { roughness: 0.7 }), plate: Weather.wet(stdMat(0x4a4d50, { metalness: 0.55, roughness: 0.45 }), 0.6),
    ramp: Weather.wet(stdMat(0x9a978f, { roughness: 0.9 })), pier: Weather.wet(stdMat(0x9b7b56, { roughness: 0.9 }), 0.7), ovdeck: Weather.wet(stdMat(0xa29f97, { roughness: 0.9, emissive: 0x3a3833 })),   // снизу на настил почти не падает свет — подсвечиваем
  });
  Object.assign(K, { decks });
}

function cityBuildStructures(K) {
  const { D, group, grid, box1, xzOf, decks } = K;
  /* ---------- уникальные объекты (js/maps/city-landmarks.js) ---------- */
  const marks = buildCityLandmarks(D.landmarks, { group, grid, decks, D });

  /* ---------- опоры эстакады ---------- */
  const OVH = D.OV.H - 1.2;
  instChunks(group, new THREE.CylinderGeometry(0.85, 1.0, 1, 12).translate(0, 0.5, 0), stdMat(0xa3a19a, { roughness: 0.9 }), D.ovPillars, xzOf,
    (m, i, o) => setInst(m, i, o.x, 0, o.z, 1, OVH, 1));
  // ригель поперёк настила
  instChunks(group, box1, stdMat(0x9c9a93, { roughness: 0.9 }), D.ovPillars, xzOf,
    (m, i, o) => setInst(m, i, o.x, OVH - 1.1, o.z, D.OV.W - 2, 1.1, 2.2, o.along === 'z' ? 0 : o.along === 'x' ? Math.PI / 2 : Math.PI / 4));
  for (const p of D.ovPillars) grid.addCircle(p.x, p.z, 1.0, OVH - 0.3);

  /* ---------- ограждение канала ---------- */
  const railItems = D.rails.map(([x, z]) => ({ x, y: 0, z }));
  instChunks(group, box1, stdMat(0xd8dde3, { metalness: 0.5, roughness: 0.4 }), railItems, xzOf, (m, i, o) => setInst(m, i, o.x, 0.75, o.z, 20, 0.14, 0.14));
  instChunks(group, box1, stdMat(0x7f858c, { metalness: 0.4, roughness: 0.5 }), railItems, xzOf, (m, i, o) => setInst(m, i, o.x, 0, o.z, 20, 0.12, 0.3));
  for (const [x, z] of D.rails) grid.addBox(x - 10, x + 10, z - 0.25, z + 0.25, 1.0);
  // стенки набережной канала и гавани
  const walls = [];
  for (const s of [1, -1]) for (let x = -1000; x < 1000; x += 40) if (D.coastD(x + 20, s * D.CANAL) > 0) walls.push({ x: x + 20, z: s * (D.CANAL - 0.5), w: 40, d: 1 });
  const B = D.BASIN;
  for (let x = -1000; x < B.x1; x += 40) for (const z of [B.z0 - 0.5, B.z1 + 0.5]) { const xx = Math.min(x + 20, B.x1 - 20); if (D.coastD(xx, z) > 0) walls.push({ x: xx, z: z + (z < B.z0 ? 1 : -1), w: 40, d: 1 }); }
  walls.push({ x: B.x1 - 0.5, z: (B.z0 + B.z1) / 2, w: 1, d: B.z1 - B.z0 });
  instChunks(group, box1, stdMat(0x8b877d, { roughness: 0.95 }), walls, xzOf, (m, i, o) => setInst(m, i, o.x, -6.5, o.z, o.w, 6.5, o.d), false);
  Object.assign(K, { marks });
}
