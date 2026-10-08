// test/render/forms.browser.test.js — user playtest #5 item 1 in headless Chrome: a 掠海漂移体 hovering down act2 m01's
// lower lane is stunned, drops to 爬行模式 for good (sim content/enemies.js kitSyufo: a ground unit from then on, blocked
// and hit by 山), and its view follows — the real sim runs in the page (the client runner's loadBrowserSim) and feeds the
// render demo's field view: before the drop the hover clips (*_01), on the drop 'Change', then the crawl clips (*_02)
// while 山 blocks it (render/app.js fx 'phase' → render/units.js setForm / FORMS). It used to keep hovering.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/forms.browser.test.js
// Chrome path: $CHROME_PATH or the macOS default. Screenshot → test/e2e/out/forms-syufo-crawl.png.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBattleSpec } from '../../server/sim/spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and downloaded assets)';

// 山 on (9,8) facing the gate; one tanky, harmless 掠海漂移体 walking the lower lane (9,10) → (9,2)
const SPEC = buildBattleSpec({
  battleId: 'e2e.forms', fieldId: 'n:P1', kind: 'normal', seed: 5, modeId: 'mode_multi_hard', round: 12, stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: 'chess_char_5_17_a', row: 9, col: 8, dir: 'RIGHT' }], bonds: {}, playerEffects: [] }],
  spawns: [{ time: 0, enemyKey: 'enemy_2025_syufo', routeIndex: 0, count: 1, mods: { hpMul: 50, atkMul: 0.01 } }],
  routes: [{ motion: 'WALK', start: [9, 10], end: [9, 2], checkpoints: [] }], flags: {},
});

const BONE_SPEC = buildBattleSpec({
  battleId: 'e2e.forms.bone', fieldId: 'n:P1', kind: 'normal', seed: 7, modeId: 'mode_multi_hard', round: 12,
  stageId: 'act2autochess_m01', timeLimit: 400,
  players: [{ playerId: 'P1', seat: 0, side: 'L', colOffset: 0,
    units: [[9, 8], [10, 8], [9, 7], [10, 7]].map(([row, col], i) => ({ uid: i + 1, kind: 'chess', chessId: 'chess_char_5_17_a', row, col, dir: 'RIGHT' })),
    bonds: {}, playerEffects: [] }],
  spawns: [{ time: 0.1, enemyKey: 'enemy_9008_acbunn', routeIndex: 0, count: 1, mods: { hpMul: 50, atkMul: 0.1, speedMul: 0 } }],
  routes: [{ motion: 'WALK', start: [9, 8], end: [9, 2], checkpoints: [] }], flags: {},
});

describe('掠海漂移体 drops to 爬行模式: its model crawls (headless Chrome, real sim)', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('hover clips before the stun, \'Change\' on the drop, then the crawl clips while 山 blocks and hits it', async () => {
    const page = await browser.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      const log = await page.evaluate(async (spec) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { data } = await import('/js/data.js');
        const { spec: S, ds } = await loadBrowserSim();
        const b = S.createBattleFromSpec(spec, ds, { quiet: true });
        const v = window.__demo.view;
        v.setStage(data.lookup('stages', spec.stageId));
        b.step();
        const meta = b.fieldMeta();
        v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true });
        v.setLocalFeed({ on: true, speed: 2 });
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
        const out = [];
        let stunAt = null;
        for (let i = 0; i < 30 * 14; i++) {
          b.step();
          const e = b.enemies.find((x) => x.defId === 'enemy_2025_syufo');
          if (stunAt == null && e && b.time >= 6) { stunAt = b.time; b.applyStatus(e, 'stun', { duration: 1, source: null }); }
          if (i % 3 === 2) {
            const ev = b.drainEvents();
            if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
            v.pushSnapshot(b.snapshot());
            await raf();
            // Compare the real model with this simulation sample only after the render clock reaches it.
            while (v.stats().renderT < b.time) await raf();
            if (i === 30 * 3) await new Promise((r) => setTimeout(r, 2000));   // the Spine models load
            const view = e && v.debug.views.get(e.id);
            if (e && i % 6 === 5) out.push({ t: +b.time.toFixed(2), flying: e.isFlying, blocked: !!e.blockedBy, clip: view?.actor?.current ?? null, form: view?.form ?? null, spine: !!view?.spineReady });
          }
        }
        return { out, stunAt };
      }, SPEC);
      await page.screenshot({ path: path.join(OUT, 'forms-syufo-crawl.png') });
      const before = log.out.filter((x) => x.spine && x.t < log.stunAt);
      assert.ok(before.length > 0, 'the model loaded before the stun');
      assert.ok(before.every((x) => x.flying && /_01$/.test(x.clip)), `hovering: the *_01 clips (${[...new Set(before.map((x) => x.clip))]})`);
      const after = log.out.filter((x) => x.t > log.stunAt);
      assert.ok(after.some((x) => x.clip === 'Change'), `the drop plays 'Change' (${[...new Set(after.map((x) => x.clip))]})`);
      const late = after.filter((x) => x.t > log.stunAt + 3);
      assert.ok(late.length > 0 && late.every((x) => !x.flying && x.form === 'crawl' && /_02$/.test(x.clip)), `crawling: the *_02 clips (${[...new Set(late.map((x) => x.clip))]})`);
      assert.ok(late.some((x) => x.blocked), '山 blocks it once it crawls');
      assert.deepEqual(problems, []);
    } finally {
      await page.close();
    }
  });
});

describe('骨刺 effective stealth: real sim and Spine in Chrome', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('骨刺: A → blocked B → A → revealed B → A; real hits, attack alignment and frozen attachments', { timeout: 60000 }, async () => {
    const page = await browser.newPage();
    const screenshot = async (name) => {
      // Hide the overlapping blocker models in these evidence images so the snake / turret is fully visible.
      await page.evaluate(() => {
        for (const u of window.__bone.v.debug.views.values()) if (!u.isEnemy) {
          for (const d of [u.root, u.shadow, u.hud]) if (d) d.renderable = false;
        }
      });
      try { await page.screenshot({ path: path.join(OUT, name) }); }
      finally {
        await page.evaluate(() => {
          for (const u of window.__bone.v.debug.views.values()) if (!u.isEnemy) {
            for (const d of [u.root, u.shadow, u.hud]) if (d) d.renderable = true;
          }
        });
      }
    };
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });
    try {
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&paused=1&panel=0`);
      await page.waitForFunction('window.__demo && (window.__demo.ready || window.__demo.error)', { timeout: 30000 });
      await page.evaluate(async (spec) => {
        const { loadBrowserSim } = await import('/js/battle/runner.js');
        const { data } = await import('/js/data.js');
        const { assets } = await import('/js/assets.js');
        const { Battle } = await import('/sim/Battle.js');
        const enemies = await import('/sim/content/enemies.js');
        const { enemyStealthed } = await import('/sim/targeting.js');
        const { flagsOf } = await import('/sim/snapshot.js');
        const { UF } = await import('/shared/constants.js');
        const { spec: S, ds } = await loadBrowserSim();
        class BoneBattle extends Battle {
          constructor(o) { super({ ...o, content: 'generic', extraContent: [enemies], autoFinish: false,
            kits: { chess_char_5_17_a: () => ({ trait: { noAttack: true }, skill: null }) } }); }
        }
        const entry = assets.spineEntry('enemy_9008_acbunn');
        await assets.spine.acquire(entry); assets.spine.release(entry);
        const b = S.createBattleFromSpec(spec, ds, { BattleClass: BoneBattle, quiet: true });
        b.step();
        for (const u of b.allyUnits) {
          b.addBuff(u, { key: 'test:wall', persist: true, mods: { hpMul: 100, resFlat: -u.s.res }, flags: { disarm: true } });
          b.addBuff(u, { key: 'test:noBlock', persist: true, flags: { noBlock: true } });
          u.hp = u.s.maxHp;
        }
        while (!b.enemies.length) b.step();
        const e = b.enemies[0], wall = b.allyUnits.find((u) => u.uid === 1);
        b.addBuff(e, { key: 'test:warmup', flags: { disarm: true } });
        const attacks = [], damage = [], timings = [], switches = [], states = [];
        b.on('attack', (c) => { if (c.attacker === e) attacks.push({ t: b.time, hidden: enemyStealthed(e), targets: c.targets.map((u) => u.id) }); });
        b.on('damaged', (c) => { if (c.source === e && c.dmg.isAttack) damage.push({ t: b.time, id: c.dmg.attackId, target: c.target.id, type: c.type, amount: c.amount }); });
        const v = window.__demo.view, meta = b.fieldMeta();
        v.setStage(data.lookup('stages', spec.stageId)); v.enterBattle(meta);
        v.setCamera('normal', { rect: meta.rect, side: 'L', instant: true }); v.setLocalFeed({ on: true, speed: 2 });
        const raf = () => new Promise((r) => requestAnimationFrame(r));
        const feed = () => {
          const ev = b.drainEvents();
          if (ev.length) v.pushEvents({ t: 'b.ev', fieldId: meta.fieldId, gt: b.time, ev });
          v.pushSnapshot(b.snapshot());
        };
        const advance = async (ticks) => {
          const start = performance.now();
          for (let i = 0; i < ticks; i++) {
            // Chrome's RAF may run above 60 Hz: keep the simulated feed at the declared 2× game speed.
            do { await raf(); } while (performance.now() < start + (i + 1) * 1000 / 60);
            b.step(); feed();
          }
        };
        const until = async (pred, seconds = 8) => {
          const end = b.time + seconds;
          while (!pred() && b.time < end) await advance(2);
          if (!pred()) throw new Error(`bone checkpoint timed out at ${b.time}`);
        };
        const caughtUp = async (at) => {
          const end = performance.now() + 10000;
          while (v.stats().renderT < at || !v.debug.views.get(e.id)?.spineReady) {
            if (performance.now() > end) throw new Error(`bone render clock did not reach ${at}`);
            await raf();
          }
          await raf();
        };
        feed(); await caughtUp(b.time);
        const uv = v.debug.views.get(e.id), a = uv.actor;
        let frameDt = 1 / 30;
        const update = a.update.bind(a);
        a.update = (dt) => { frameDt = dt; return update(dt); };
        const onAttack = uv.onAttack.bind(uv);
        uv.onAttack = (target, now, kind) => {
          const before = { clip: a.current, time: a.spine.state.tracks[0].trackTime, windUntil: a.windUntil, clock: a.clock, wound: a.wound };
          onAttack(target, now, kind);
          timings.push({ renderT: now, clock: a.clock, clip: a.current, trackTime: a.spine.state.tracks[0].trackTime,
            hit: a._hitTime(a.current, a.dur(a.current)), timeScale: a.spine.state.tracks[0].timeScale, frameDt, before });
        };
        const syncPose = a.syncFormPose.bind(a);
        a.syncFormPose = () => {
          const old = { mode: a.mode, clip: a.current, time: a.spine.state.tracks[0].trackTime,
            hit: a._hitTime(a.current, a.dur(a.current)), windUntil: a.windUntil, lastAtk: uv.lastAtk, interval: uv.atkInterval };
          syncPose();
          switches.push({ renderT: v.stats().renderT, old, clip: a.current, time: a.spine.state.tracks[0].trackTime,
            hit: a._hitTime(a.current, a.dur(a.current)), windUntil: a.windUntil, lastAtk: uv.lastAtk, interval: uv.atkInterval });
        };
        const state = async (label) => {
          const at = b.time;
          await advance(4); await caughtUp(at);
          const track = a.spine.state.tracks[0];
          const rec = { label, t: b.time, renderT: v.stats().renderT, blockedBy: e.blockedBy?.id ?? null,
            hidden: enemyStealthed(e), snapHidden: !!(flagsOf(e) & UF.STEALTH), viewHidden: !!(uv.flags & UF.STEALTH),
            form: uv.form, clip: a.current, alpha: uv.root.alpha, frozen: a.frozen,
            track: track.animation.name, trackTime: track.trackTime, windUntil: a.windUntil,
            attachments: a.spine.skeleton.slots.filter((s) => {
              const m = s.bone.matrix || s.bone;
              return s.attachment && s.color.a > 0 && Math.abs(m.a * m.d - m.b * m.c) > 1e-6;
            })
              .map((s) => ({ slot: s.data.name, attachment: s.attachment.name })) };
          states.push(rec); return rec;
        };
        window.__bone = { b, e, wall, v, uv, UF, attacks, damage, timings, switches, states, advance, until, state };
        await advance(30); await caughtUp(b.time);
        await state('initial A');
        b.removeBuff(e, 'test:warmup');
      }, BONE_SPEC);
      await screenshot('forms-bone-spike-a.png');
      await page.evaluate(async () => {
        const x = window.__bone;
        await x.until(() => x.attacks.length >= 1);
        // Change during the actual attack clip, while its already-fired shots still settle normally.
        x.b.removeBuff(x.wall, 'test:noBlock'); await x.advance(2);
        if (x.e.blockedBy !== x.wall) throw new Error('bone spike was not actually blocked');
        await x.state('blocked B');
      });
      await screenshot('forms-bone-spike-b.png');
      await page.evaluate(async () => {
        const x = window.__bone;
        await x.until(() => x.attacks.length >= 2);
        x.b.applyStatus(x.wall, 'stun', { duration: 30, force: true }); await x.advance(2);
        if (x.e.blockedBy) throw new Error('stunned blocker did not release bone spike');
        await x.state('released A');
        await x.until(() => x.attacks.length >= 3);
        x.b.addBuff(x.e, { key: 'test:reveal', duration: 6, flags: { reveal: true } });
        await x.advance(2); await x.state('revealed B');
        await x.until(() => x.attacks.length >= 4);
        await x.advance(18); // all projectiles have landed
        x.b.applyStatus(x.e, 'freeze', { duration: 10, force: true });
        await x.advance(2); await x.state('frozen B');
      });
      await screenshot('forms-bone-spike-frozen-b.png');
      const log = await page.evaluate(async () => {
        const x = window.__bone;
        await x.until(() => !x.e.findBuff('test:reveal'));
        await x.state('frozen A after reveal expiry');
        return { states: x.states, attacks: x.attacks, damage: x.damage, timings: x.timings, switches: x.switches, atk: x.e.s.atk };
      });
      await screenshot('forms-bone-spike-frozen-a.png');
      writeFileSync(path.join(OUT, 'forms-bone-spike.json'), JSON.stringify(log, null, 2) + '\n');
      for (const [i, s] of log.states.entries()) {
        const hidden = [0, 2, 5].includes(i);
        assert.equal(s.hidden, hidden, s.label); assert.equal(s.snapHidden, hidden, s.label); assert.equal(s.viewHidden, hidden, s.label);
        assert.equal(s.form, hidden ? null : 'revealed', s.label);
        assert.match(s.clip, hidden ? /_A$/ : /_B$/, s.label);
        assert.ok(Math.abs(s.alpha - (hidden ? 0.45 : 1)) < 1e-6, s.label);
        assert.ok(s.renderT >= s.t - 0.2, 'rendering caught up to the stable snapshot');
        assert.ok(s.attachments.length > 0, 'real attachments are present');
        const snake = s.attachments.filter((a) => /^C_Snake_/.test(a.slot));
        const turret = s.attachments.filter((a) => /^C_L_\d+$/.test(a.slot));
        assert.equal(snake.length, hidden ? 3 : 0, `${s.label}: snake attachments`);
        assert.equal(turret.length > 0, !hidden, `${s.label}: turret attachments`);
        if (i >= 4) assert.equal(s.frozen, true, s.label);
      }
      assert.equal(log.states[1].blockedBy != null, true);
      assert.equal(log.states[2].blockedBy, null);
      assert.equal(log.attacks.length, 4);
      assert.deepEqual(log.attacks.map((a) => a.targets.length), [3, 1, 3, 1]);
      const groups = [...new Set(log.damage.map((d) => d.id))].map((id) => log.damage.filter((d) => d.id === id));
      assert.equal(groups.length, 4);
      for (const [i, hits] of groups.entries()) {
        assert.deepEqual(hits.map((d) => d.target).sort((a, b) => a - b), [...log.attacks[i].targets].sort((a, b) => a - b));
        assert.equal(new Set(hits.map((d) => d.target)).size, hits.length);
        for (const hit of hits) { assert.equal(hit.type, 'arts'); assert.ok(Math.abs(hit.amount - log.atk) < 1e-6); }
      }
      const bTimings = log.timings.filter((t) => t.clip === 'Attack_B');
      assert.ok(bTimings.length > 0, 'B has a real attack-event timing sample');
      for (const t of bTimings) {
        const tolerance = 1 / 30 + 2 * t.frameDt;
        assert.ok(Math.abs(t.trackTime - t.hit) <= tolerance + 1e-6, `B strike alignment: ${JSON.stringify(t)}`);
      }
      const attackSwitches = log.switches.filter((s) => s.old.mode === 'attack');
      assert.ok(attackSwitches.some((s) => s.old.clip === 'Attack_A' && s.clip === 'Attack_B'));
      assert.ok(attackSwitches.some((s) => s.old.clip === 'Attack_B' && s.clip === 'Attack_A'));
      for (const s of attackSwitches) {
        assert.ok(Math.abs(s.time - Math.min(1.5, Math.max(0, s.old.time + s.hit - s.old.hit))) < 1e-6);
        assert.equal(s.windUntil, s.old.windUntil); assert.equal(s.lastAtk, s.old.lastAtk); assert.equal(s.interval, s.old.interval);
      }
      assert.deepEqual(problems, []);
    } finally { await page.close(); }
  });
});
