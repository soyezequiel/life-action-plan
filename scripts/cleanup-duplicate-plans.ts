import { getDatabase } from '../src/lib/db/connection';
import { plans } from '../src/lib/db/schema';
import { isNull, sql, and, ne } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Carga manual de .env.local para el script
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) process.env[key.trim()] = value.trim();
    });
  }
} catch (e) {
  console.warn('No se pudo cargar .env.local:', e);
}

async function cleanup() {
  const db = getDatabase();
  console.log('--- LAP Data Cleanup ---');
  
  try {
    // Obtener todos los planes activos ordenados por fecha de creación descendente
    const rows = await db.select().from(plans).where(isNull(plans.deletedAt)).orderBy(sql`${plans.createdAt} DESC`);
    
    if (rows.length <= 1) {
      console.log('No se encontraron planes duplicados activos. El sistema está limpio.');
      return;
    }
    
    const latestPlan = rows[0];
    const obsoletePlanCount = rows.length - 1;
    const timestamp = new Date().toISOString();
    
    console.log(`Se detectaron ${rows.length} planes activos simultáneamente.`);
    console.log(`Preservando el plan más reciente: "${latestPlan.nombre}" (ID: ${latestPlan.id})`);
    
    // Marcar todos los demás como eliminados
    await db.update(plans)
      .set({ deletedAt: timestamp, updatedAt: timestamp })
      .where(and(
        isNull(plans.deletedAt),
        ne(plans.id, latestPlan.id)
      ));
      
    console.log(`Éxito: ${obsoletePlanCount} planes antiguos han sido marcados como eliminados.`);
    console.log('Ahora el Dashboard debería mostrar correctamente solo el plan más nuevo.');
  } catch (error) {
    console.error('Error durante la limpieza:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

cleanup().catch(console.error);
