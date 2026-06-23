import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface UsuarioAdmin {
  id: string
  nombre: string
  rol: 'dev' | 'admin' | 'garzon'
  codigoGarzon: string | null
  activo: boolean
}

export interface CrearGarzonPayload {
  nombre: string
  email: string
  codigoGarzon: string
  password: string
}

interface UsuariosState {
  usuarios: UsuarioAdmin[]
  cargando: boolean
  error: string | null
}

interface UsuariosActions {
  cargarUsuarios: () => Promise<void>
  toggleActivo: (id: string, activo: boolean) => Promise<void>
  crearGarzon: (payload: CrearGarzonPayload) => Promise<void>
}

export const useUsuariosStore = create<UsuariosState & UsuariosActions>((set, get) => ({
  usuarios: [],
  cargando: false,
  error: null,

  cargarUsuarios: async () => {
    set({ cargando: true, error: null })
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, codigo_garzon, activo')
      .order('nombre')
    if (error) {
      set({ cargando: false, error: error.message })
      return
    }
    set({
      usuarios: (data ?? []).map((u) => ({
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        codigoGarzon: u.codigo_garzon,
        activo: u.activo,
      })),
      cargando: false,
    })
  },

  toggleActivo: async (id, activo) => {
    // Optimista local.
    set((state) => ({
      usuarios: state.usuarios.map((u) => (u.id === id ? { ...u, activo } : u)),
    }))
    const { error } = await supabase.from('usuarios').update({ activo }).eq('id', id)
    if (error) {
      // Revertir si falla.
      set((state) => ({
        usuarios: state.usuarios.map((u) => (u.id === id ? { ...u, activo: !activo } : u)),
      }))
      throw error
    }
  },

  crearGarzon: async (payload) => {
    const { data, error } = await supabase.functions.invoke('crear-garzon', {
      body: payload,
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    await get().cargarUsuarios()
  },
}))
