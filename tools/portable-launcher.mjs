import net from 'node:net';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT || 18080);
const url = `http://127.0.0.1:${port}/`;
const probe = net.createServer();
try {
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => probe.close(resolve));
} catch {
  console.error(`Port ${port} is already in use. Close the previous test window, then try again.`);
  process.exit(1);
}

process.env.PORT = String(port);
process.env.HOST = '127.0.0.1';
await import('./server.mjs');
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(url);
    if (response.ok) break;
  } catch {}
  if (attempt === 29) {
    console.error('The local service did not start. Please send this window to the developer.');
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
console.log(`\nOpen: ${url}\nKeep this window open while testing. Close it to stop the service.\n`);
if (!process.argv.includes('--no-open')) {
  const opener = spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' });
  opener.on('error', () => console.log(`Please open ${url} in your browser.`));
  opener.unref();
}
