/**
 * Removes .next with Windows-friendly retries (EPERM on .next/trace when dev server is running).
 * Stop `npm run dev` first; if it still fails, end Node processes from Task Manager.
 */
const fs = require('fs');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');

if (!fs.existsSync(nextDir)) {
  console.log('.next yok; zaten temiz.');
  process.exit(0);
}

const opts = { recursive: true, force: true, maxRetries: 20, retryDelay: 250 };

try {
  fs.rmSync(nextDir, opts);
  console.log('.next silindi.');
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
