const fs = require('fs');

const checks = [
  {
    file: 'index.html',
    pattern: /https:\/\/unpkg\.com\/leaflet/i,
    message: 'Leaflet should be loaded from the local package, not a CDN.',
  },
  {
    file: 'index.html',
    pattern: /localStorage\.setItem\(SETTINGS_KEY/i,
    message: 'Provider API keys must not be persisted in renderer localStorage.',
  },
  {
    file: 'index.html',
    pattern: /fetch\('https:\/\/api\.(openai|anthropic)\.com/i,
    message: 'AI provider calls should be brokered by the Electron main process.',
  },
];

const failures = checks.filter((check) => {
  const text = fs.existsSync(check.file) ? fs.readFileSync(check.file, 'utf8') : '';
  return check.pattern.test(text);
});

const main = fs.existsSync('main.js') ? fs.readFileSync('main.js', 'utf8') : '';
if (!/function\s+isAllowedExternalUrl/.test(main) || !/isAllowedExternalUrl\(url\)[\s\S]{0,80}shell\.openExternal\(url\)/.test(main)) {
  failures.push({ message: 'main.js must validate URLs before shell.openExternal(url).' });
}

if (failures.length) {
  console.error('Security audit failed:');
  for (const failure of failures) {
    console.error(`- ${failure.message}`);
  }
  process.exit(1);
}

console.log('Security audit passed.');
