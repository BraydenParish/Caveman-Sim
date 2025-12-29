const assert = require('assert');
const sim = require('../sim');

module.exports = [
  {
    name: 'Seeded RNG produces reproducible sequences',
    fn: () => {
      const a = new sim.SeededRNG(123);
      const b = new sim.SeededRNG(123);
      const seqA = [a.next(), a.next(), a.next(), a.next(), a.next()];
      const seqB = [b.next(), b.next(), b.next(), b.next(), b.next()];
      assert.deepStrictEqual(seqA, seqB);
      // Ensure values are in [0,1)
      seqA.forEach(v => {
        assert.ok(v >= 0 && v < 1, 'value out of range');
      });
    }
  },
  {
    name: 'Clamping keeps values between 0 and 100',
    fn: () => {
      assert.strictEqual(sim.clampStat(-10), 0);
      assert.strictEqual(sim.clampStat(50), 50);
      assert.strictEqual(sim.clampStat(150), 100);
    }
  },
  {
    name: 'World step keeps needs in bounds (invariant)',
    fn: () => {
      const world = new sim.World({seed: 99, width: 30, height: 20, humanCount: 3});
      // Should create some humans to validate behavior
      assert.ok(world.entities.some(e => e.type === 'human'), 'expected humans in world');
      for (let i = 0; i < 20; i++) {
        world.step();
      }
      world.entities.forEach(e => {
        if (!e.needs) return;
        ['health', 'hunger', 'thirst', 'energy'].forEach(key => {
          const val = e.needs[key];
          assert.ok(val >= 0 && val <= 100, `${key} out of bounds`);
        });
      });
    }
  }
];
