/**
 * Removes .next with Windows-friendly retries (EPERM on .next/trace when dev server is running).
 * Stop `npm run dev` first; if it still fails, end Node processes from Task Manager.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const nextDir = path.join(repoRoot, '.next');
const turboDir = path.join(repoRoot, '.turbo');
const nodeCacheDir = path.join(repoRoot, 'node_modules', '.cache');

const opts = { recursive: true, force: true, maxRetries: 20, retryDelay: 250 };

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, opts);
    console.log('.next silindi.');
  } else {
    console.log('.next yok; zaten temiz.');
  }

  // Optional caches that can keep stale dependency snapshots on Windows.
  if (fs.existsSync(turboDir)) {
    fs.rmSync(turboDir, opts);
    console.log('.turbo silindi.');
  }

  if (fs.existsSync(nodeCacheDir)) {
    fs.rmSync(nodeCacheDir, opts);
    console.log('node_modules/.cache silindi.');
  }

  process.exit(0);
} catch (err) {
  console.error('\n.next silinemedi — genelde dosya kilitli (trace).');
  console.error('Yapmanız gerekenler:');
  console.error('  1) next dev çalışan TÜM terminallerde Ctrl+C');
  console.error('  2) Hâlâ olmazsa Görev Yöneticisi → Node.js süreçlerini Sonlandır');
  console.error('  3) Cursor/VS Code bu projede .next içinde bir dosyayı açık tutuyorsa kapatın\n');
  console.error('Hata:', err.message);
  process.exit(1);
}
