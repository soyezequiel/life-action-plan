import { spawnSync } from 'node:child_process';

console.log('[Vercel-Prepare] Iniciando orquestación de despliegue...');

function run(command, args) {
  const fullCommand = `${command} ${args.join(' ')}`;
  console.log(`[Vercel-Prepare] PROXIMO PASO: ${fullCommand}`);
  
  const startTime = Date.now();
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.status !== 0) {
    console.error(`[Vercel-Prepare] ❌ FALLO: ${fullCommand} (Estatuto: ${result.status}, Tiempo: ${duration}s)`);
    process.exit(result.status || 1);
  }
  console.log(`[Vercel-Prepare] ✅ COMPLETADO: ${fullCommand} (${duration}s)`);
}

const isPrecheck = process.argv.includes('--precheck-only');
const isPostbuild = process.argv.includes('--postbuild');

if (isPrecheck) {
  // 1. Solo ejecutar Doctor
  run('node', ['scripts/deploy-doctor.mjs']);
} else if (isPostbuild) {
  // 2. Solo ejecutar Migraciones post-build
  run('npm', ['run', 'db:push']);
} else {
  // 3. Ejecución completa (fallback)
  run('node', ['scripts/deploy-doctor.mjs']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'db:push']);
}

console.log('[Vercel-Prepare] ¡Paso finalizado con éxito!');
