import { spawnSync } from 'node:child_process';

console.log('[Vercel-Prepare] Iniciando orquestación de despliegue...');

function run(command, args) {
  console.log(`[Vercel-Prepare] Ejecutando: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`[Vercel-Prepare] Error en comando: ${command}`);
    process.exit(result.status || 1);
  }
}

// 1. Ejecutar Doctor
run('node', ['scripts/deploy-doctor.mjs']);

// 2. Ejecutar Build
run('npm', ['run', 'build']);

// 3. Ejecutar Migraciones
run('npm', ['run', 'db:push']);

console.log('[Vercel-Prepare] ¡Todo listo para el despliegue!');
