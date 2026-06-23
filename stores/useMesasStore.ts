import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import type { Mesa, Zona } from '@/constants/mesas'

export type EstadoMesaTipo =
  | 'libre'
  | 'ocupada'
  | 'esperando_cierre'
  | 'reservada'

export interface EstadoMesa {
  mesaId: string
  estado: EstadoMesaTipo
  garzonId: string | null
  updatedAt?: string | null
}

interface MesasState {
  mesas: Mesa[]
  zonas: Zona[]
  estadosMesa: Record<string, EstadoMesa>
  mesaSeleccionada: string | null
  cargando: boolean
  error: string | null
}

interface MesasActions {
  cargarMesas: () => Promise<void>
  seleccionarMesa: (mesaId: string | null) => void
  // Devuelve false si hubo conflicto (la mesa ya fue tomada por otro).
  actualizarEstadoMesa: (mesaId: string, estado: EstadoMesaTipo) => Promise<boolean>
  aplicarEstadoRemoto: (estado: EstadoMesa) => void
  getMesaById: (id: string) => Mesa | undefined
  getMesaByNumero: (numero: number) => Mesa | undefined
  getMesasPorZona: (zonaId: string) => Mesa[]
  getMesasVirtuales: () => Mesa[]
  getEstadoMesa: (mesaId: string) => EstadoMesa | undefined
  getZonaById: (id: string) => Zona | undefined
  // Reinicia todos los estados a 'libre' (fin de turno / logout).
  reiniciarEstados: () => void
  // Placeholder para Fase 7 (Realtime). Hoy es un no-op.
  suscribirRealtime: () => () => void
}

// Inicializa todas las mesas en estado 'libre'.
function estadosIniciales(mesas: Mesa[]): Record<string, EstadoMesa> {
  const estados: Record<string, EstadoMesa> = {}
  for (const mesa of mesas) {
    estados[mesa.id] = { mesaId: mesa.id, estado: 'libre', garzonId: null }
  }
  return estados
}

export const useMesasStore = create<MesasState & MesasActions>((set, get) => ({
  mesas: [],
  zonas: [],
  estadosMesa: {},
  mesaSeleccionada: null,
  cargando: false,
  error: null,

  cargarMesas: async () => {
    set({ cargando: true, error: null })
    try {
      const [{ data: zonas, error: ez }, { data: mesas, error: em }, { data: estados, error: ee }] =
        await Promise.all([
          supabase.from('zonas').select('id, nombre, descripcion, orden').order('orden'),
          supabase
            .from('mesas')
            .select('id, numero, zona_id, es_virtual, mesa_real_id, pos_x, pos_y, activa')
            .eq('activa', true),
          supabase.from('estados_mesa').select('mesa_id, estado, garzon_id, updated_at'),
        ])
      if (ez) throw ez
      if (em) throw em
      if (ee) throw ee

      const zonasMap: Zona[] = (zonas ?? []).map((z) => ({
        id: z.id,
        nombre: z.nombre,
        descripcion: z.descripcion,
        orden: z.orden,
      }))
      const mesasMap: Mesa[] = (mesas ?? []).map((m) => ({
        id: m.id,
        numero: m.numero,
        zonaId: m.zona_id,
        esVirtual: m.es_virtual,
        mesaRealId: m.mesa_real_id,
        posX: Number(m.pos_x),
        posY: Number(m.pos_y),
        activa: m.activa,
      }))
      const estadosMesa: Record<string, EstadoMesa> = {}
      for (const m of mesasMap) {
        estadosMesa[m.id] = { mesaId: m.id, estado: 'libre', garzonId: null }
      }
      for (const e of estados ?? []) {
        estadosMesa[e.mesa_id] = {
          mesaId: e.mesa_id,
          estado: e.estado as EstadoMesaTipo,
          garzonId: e.garzon_id,
          updatedAt: e.updated_at,
        }
      }

      set({ mesas: mesasMap, zonas: zonasMap, estadosMesa, cargando: false })
    } catch (err) {
      set({
        cargando: false,
        error: err instanceof Error ? err.message : 'Error cargando las mesas',
      })
    }
  },

  seleccionarMesa: (mesaId) => set({ mesaSeleccionada: mesaId }),

  actualizarEstadoMesa: async (mesaId, estado) => {
    const prev = get().estadosMesa[mesaId]
    const garzonId =
      estado === 'libre' ? null : useAuthStore.getState().usuario?.id ?? null
    const nowIso = new Date().toISOString()

    // Optimista: actualizamos local primero.
    set((state) => ({
      estadosMesa: {
        ...state.estadosMesa,
        [mesaId]: { mesaId, estado, garzonId, updatedAt: nowIso },
      },
    }))

    // Optimistic lock: ocupar una mesa solo se permite si SIGUE libre.
    // Evita que dos garzones tomen la misma mesa a la vez.
    const usarLock = estado === 'ocupada' && prev?.estado === 'libre'
    let q = supabase
      .from('estados_mesa')
      .update({ estado, garzon_id: garzonId, updated_at: nowIso })
      .eq('mesa_id', mesaId)
    if (usarLock) q = q.eq('estado', 'libre')

    const { data, error } = await q.select()
    if (error) {
      console.warn('No se pudo actualizar estado_mesa', mesaId, error.message)
      return false
    }
    if (usarLock && (!data || data.length === 0)) {
      // Conflicto: otro garzón la tomó primero. Traemos el estado real.
      const { data: actual } = await supabase
        .from('estados_mesa')
        .select('mesa_id, estado, garzon_id, updated_at')
        .eq('mesa_id', mesaId)
        .single()
      if (actual) {
        get().aplicarEstadoRemoto({
          mesaId: actual.mesa_id,
          estado: actual.estado as EstadoMesaTipo,
          garzonId: actual.garzon_id,
          updatedAt: actual.updated_at,
        })
      }
      return false
    }
    return true
  },

  // Aplica un estado recibido de Realtime (o de una reconciliación).
  aplicarEstadoRemoto: (estado) =>
    set((state) => ({
      estadosMesa: { ...state.estadosMesa, [estado.mesaId]: estado },
    })),

  getMesaById: (id) => get().mesas.find((m) => m.id === id),
  getMesaByNumero: (numero) => get().mesas.find((m) => m.numero === numero),
  getMesasPorZona: (zonaId) =>
    get().mesas.filter((m) => m.zonaId === zonaId && !m.esVirtual && m.activa),
  getMesasVirtuales: () => get().mesas.filter((m) => m.esVirtual && m.activa),
  getEstadoMesa: (mesaId) => get().estadosMesa[mesaId],
  getZonaById: (id) => get().zonas.find((z) => z.id === id),

  reiniciarEstados: () => set({ estadosMesa: estadosIniciales(get().mesas) }),

  suscribirRealtime: () => {
    const channel = supabase
      .channel('estados-mesa')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'estados_mesa' },
        (payload) => {
          const row = payload.new as Record<string, any> | null
          if (!row?.mesa_id) return
          get().aplicarEstadoRemoto({
            mesaId: row.mesa_id,
            estado: row.estado as EstadoMesaTipo,
            garzonId: row.garzon_id,
            updatedAt: row.updated_at,
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  },
}))
