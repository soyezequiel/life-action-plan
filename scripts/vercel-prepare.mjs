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

// 1. Ejecutar Doctor
run('node', ['scripts/deploy-doctor.mjs']);

// 2. Ejecutar Build
run('npm', ['run', 'build']);

// 3. Ejecutar Migraciones
run('npm', ['run', 'db:push']);

console.log('[Vercel-Prepare] ¡Todo listo para el despliegue!');
