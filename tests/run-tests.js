const tests = require('./sim.test');

async function run() {
  let passed = 0;
  for (const t of tests) {
    try {
      const result = t.fn();
      if (result instanceof Promise) {
        await result;
      }
      console.log(`PASS: ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${t.name}`);
      console.error(err);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`\n${passed}/${tests.length} tests passed`);
}

run();
