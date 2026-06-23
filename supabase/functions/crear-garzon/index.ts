// Edge Function: crear-garzon
// Crea un usuario de Auth + completa su perfil en `usuarios` como garzón.
// Usa service_role (omite RLS) pero PRIMERO verifica que quien llama sea admin/dev.
//
// Deploy:  supabase functions deploy crear-garzon
// (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY se inyectan solos.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No autorizado' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Identificar a quien llama con su propio JWT.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: ue } = await caller.auth.getUser()
    if (ue || !user) return json({ error: 'Sesión inválida' }, 401)

    // 2. Verificar que sea admin/dev (con service_role, omitiendo RLS).
    const admin = createClient(url, serviceKey)
    const { data: perfil } = await admin
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()
    if (!perfil || !['admin', 'dev'].includes(perfil.rol)) {
      return json({ error: 'Permiso denegado' }, 403)
    }

    // 3. Validar payload.
    const { nombre, email, codigoGarzon, password } = await req.json()
    if (!nombre || !email || !codigoGarzon || !password) {
      return json({ error: 'Datos incompletos' }, 400)
    }

    // 4. Crear el usuario en Auth (el trigger handle_new_user crea su fila
    //    en `usuarios` con rol 'garzon').
    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (ce || !created.user) {
      return json({ error: ce?.message ?? 'No se pudo crear el usuario' }, 400)
    }

    // 5. Completar el perfil (nombre y código de garzón).
    const { error: upe } = await admin
      .from('usuarios')
      .update({ nombre, codigo_garzon: codigoGarzon, rol: 'garzon', activo: true })
      .eq('id', created.user.id)
    if (upe) {
      // Rollback: si falla el perfil, borramos el usuario de Auth.
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: upe.message }, 400)
    }

    return json({ ok: true, id: created.user.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
