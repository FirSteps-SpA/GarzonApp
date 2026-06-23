import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/useAuthStore'
import type { Categoria, Item } from '@/constants/carta'

const TTL_CACHE = 24 * 60 * 60 * 1000 // 24 horas en ms

export type TipoRegla = 'horario' | 'temporada' | 'manual'

export interface ReglaDisponibilidad {
  id: string
  itemId: string | null // objetivo ítem
  categoriaId: string | null // objetivo categoría (aplica a sus descendientes)
  disponible: boolean
  tipo: TipoRegla
  horaInicio: string | null // 'HH:MM:SS'
  horaFin: string | null
  fechaInicio: string | null // 'YYYY-MM-DD'
  fechaFin: string | null
  motivo: string | null
  activa: boolean
}

export interface ReglaPayload {
  itemId?: string | null
  categoriaId?: string | null
  disponible: boolean
  tipo: TipoRegla
  horaInicio?: string | null
  horaFin?: string | null
  fechaInicio?: string | null
  fechaFin?: string | null
  motivo?: string | null
}

interface CartaState {
  categorias: Categoria[]
  items: Item[]
  reglas: ReglaDisponibilidad[]
  cargando: boolean
  error: string | null
  ultimaActualizacion: number | null
}

interface CartaActions {
  cargarCarta: (forzar?: boolean) => Promise<void>
  getCategoriaById: (id: string) => Categoria | undefined
  getSubcategorias: (parentId: string | null) => Categoria[]
  getItemsByCategoria: (categoriaId: string) => Item[]
  getItemById: (id: string) => Item | undefined
  // Devuelve true si la categoría tiene subcategorías hijas (nodo intermedio).
  tieneSubcategorias: (categoriaId: string) => boolean
  // Ancestros desde la raíz hasta la categoría dada (para breadcrumb).
  getAncestros: (categoriaId: string) => Categoria[]
  // Fase 3: evalúa el campo estático `disponible`. Fase 5: reglas de Supabase.
  isItemDisponible: (itemId: string) => boolean
  // Categorías hoja (sin subcategorías) con su ruta completa, para selectores.
  getCategoriasHoja: () => { id: string; ruta: string }[]
  // Todas las categorías con su ruta completa (para elegir padre / admin).
  getCategoriasConRuta: () => { id: string; ruta: string; activa: boolean }[]
  // IDs de la categoría dada y todos sus descendientes (para evitar ciclos).
  getDescendientes: (categoriaId: string) => string[]
  // ── Admin (Fase 6) ──
  crearItem: (payload: ItemPayload) => Promise<void>
  actualizarItem: (id: string, payload: ItemPayload) => Promise<void>
  setItemDisponible: (id: string, disponible: boolean) => Promise<void>
  eliminarItem: (id: string) => Promise<void>
  crearCategoria: (payload: CategoriaPayload) => Promise<void>
  actualizarCategoria: (id: string, payload: CategoriaPayload) => Promise<void>
  eliminarCategoria: (id: string) => Promise<void>
  setCategoriaActiva: (id: string, activa: boolean) => Promise<void>
  // Realtime (Fase 7): refresca la carta ante cambios del admin. Devuelve cleanup.
  suscribirRealtime: () => () => void
  // ── Disponibilidad (Fase 6 · sub-checkpoint B) ──
  getReglasByItem: (itemId: string) => ReglaDisponibilidad[]
  getReglasByCategoria: (categoriaId: string) => ReglaDisponibilidad[]
  crearRegla: (payload: ReglaPayload) => Promise<void>
  actualizarRegla: (id: string, payload: ReglaPayload) => Promise<void>
  eliminarRegla: (id: string) => Promise<void>
}

export interface ItemPayload {
  nombre: string
  descripcion?: string
  categoriaId: string
  precio: number
  fotoUrl?: string
  disponible: boolean
}

export interface CategoriaPayload {
  nombre: string
  parentId: string | null
  orden: number
}

export const useCartaStore = create<CartaState & CartaActions>()(
  persist(
    (set, get) => ({
  categorias: [],
  items: [],
  reglas: [],
  cargando: false,
  error: null,
  ultimaActualizacion: null,

  cargarCarta: async (forzar = false) => {
    const { categorias, ultimaActualizacion } = get()
    // Si hay caché fresca (<24h) y no se fuerza, no recargamos.
    if (
      !forzar &&
      categorias.length > 0 &&
      ultimaActualizacion &&
      Date.now() - ultimaActualizacion < TTL_CACHE
    ) {
      return
    }
    set({ cargando: true, error: null })
    try {
      const [{ data: cats, error: e1 }, { data: its, error: e2 }, { data: regs, error: e3 }] =
        await Promise.all([
          // Cargamos TODAS (incluidas inactivas): el admin las gestiona y los
          // getters del garzón filtran por `activa`.
          supabase
            .from('categorias_carta')
            .select('id, nombre, parent_id, orden, activa'),
          supabase
            .from('items_carta')
            .select('id, nombre, descripcion, categoria_id, precio, foto_url, disponible, orden'),
          supabase
            .from('disponibilidad_items')
            .select('id, item_id, categoria_id, disponible, tipo, hora_inicio, hora_fin, fecha_inicio, fecha_fin, motivo, activa')
            .eq('activa', true),
        ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3

      const categorias: Categoria[] = (cats ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        parentId: c.parent_id,
        orden: c.orden,
        activa: c.activa,
      }))
      const items: Item[] = (its ?? []).map((i) => ({
        id: i.id,
        nombre: i.nombre,
        descripcion: i.descripcion,
        categoriaId: i.categoria_id,
        precio: Number(i.precio),
        fotoUrl: i.foto_url,
        disponible: i.disponible,
        orden: i.orden,
      }))

      const reglas: ReglaDisponibilidad[] = (regs ?? []).map((r) => ({
        id: r.id,
        itemId: r.item_id,
        categoriaId: r.categoria_id,
        disponible: r.disponible,
        tipo: r.tipo as TipoRegla,
        horaInicio: r.hora_inicio,
        horaFin: r.hora_fin,
        fechaInicio: r.fecha_inicio,
        fechaFin: r.fecha_fin,
        motivo: r.motivo,
        activa: r.activa,
      }))

      set({ categorias, items, reglas, cargando: false, ultimaActualizacion: Date.now() })
    } catch (err) {
      // Ante error de red, conservamos la caché previa si existe.
      set({
        cargando: false,
        error: err instanceof Error ? err.message : 'Error cargando la carta',
      })
    }
  },

  getCategoriaById: (id) => get().categorias.find((c) => c.id === id),

  // Vista del garzón: solo subcategorías activas.
  getSubcategorias: (parentId) =>
    get()
      .categorias.filter((c) => c.parentId === parentId && c.activa)
      .sort((a, b) => a.orden - b.orden),

  getItemsByCategoria: (categoriaId) =>
    get()
      .items.filter((i) => i.categoriaId === categoriaId)
      .sort((a, b) => a.orden - b.orden),

  getItemById: (id) => get().items.find((i) => i.id === id),

  tieneSubcategorias: (categoriaId) =>
    get().categorias.some((c) => c.parentId === categoriaId && c.activa),

  getAncestros: (categoriaId) => {
    const { categorias } = get()
    const ancestros: Categoria[] = []
    let actual = categorias.find((c) => c.id === categoriaId)
    while (actual) {
      ancestros.unshift(actual)
      actual = actual.parentId
        ? categorias.find((c) => c.id === actual!.parentId)
        : undefined
    }
    return ancestros
  },

  isItemDisponible: (itemId) => {
    const item = get().items.find((i) => i.id === itemId)
    if (!item) return false
    // Capa 1: disponibilidad base. Si está apagada, no hay vuelta.
    if (!item.disponible) return false

    // Capas 2–4: reglas activas que estén "en efecto" ahora.
    const ahora = new Date()
    const horaActual = ahora.toTimeString().slice(0, 8) // 'HH:MM:SS'
    const fechaActual = ahora.toISOString().slice(0, 10) // 'YYYY-MM-DD'

    // Reglas aplicables: las del ítem + las de cualquier categoría ancestro
    // (la categoría del ítem y todas las de arriba).
    const ancestros = new Set(get().getAncestros(item.categoriaId).map((c) => c.id))
    const reglas = get().reglas.filter(
      (r) =>
        r.activa &&
        ((r.itemId && r.itemId === itemId) ||
          (r.categoriaId && ancestros.has(r.categoriaId)))
    )
    for (const r of reglas) {
      let enEfecto = false
      if (r.tipo === 'manual') {
        enEfecto = true
      } else if (r.tipo === 'horario' && r.horaInicio && r.horaFin) {
        enEfecto = horaActual >= r.horaInicio && horaActual <= r.horaFin
      } else if (r.tipo === 'temporada' && r.fechaInicio && r.fechaFin) {
        enEfecto = fechaActual >= r.fechaInicio && fechaActual <= r.fechaFin
      }
      // Una regla en efecto que marca no disponible gana.
      if (enEfecto && !r.disponible) return false
    }
    return true
  },

  getCategoriasHoja: () => {
    const { categorias } = get()
    const tienenHijos = new Set(categorias.map((c) => c.parentId).filter(Boolean))
    const rutaDe = (id: string): string => {
      const cat = categorias.find((c) => c.id === id)
      if (!cat) return ''
      return cat.parentId ? `${rutaDe(cat.parentId)} › ${cat.nombre}` : cat.nombre
    }
    return categorias
      .filter((c) => !tienenHijos.has(c.id))
      .map((c) => ({ id: c.id, ruta: rutaDe(c.id) }))
      .sort((a, b) => a.ruta.localeCompare(b.ruta))
  },

  getCategoriasConRuta: () => {
    const { categorias } = get()
    const rutaDe = (id: string): string => {
      const cat = categorias.find((c) => c.id === id)
      if (!cat) return ''
      return cat.parentId ? `${rutaDe(cat.parentId)} › ${cat.nombre}` : cat.nombre
    }
    return categorias
      .map((c) => ({ id: c.id, ruta: rutaDe(c.id), activa: c.activa }))
      .sort((a, b) => a.ruta.localeCompare(b.ruta))
  },

  getDescendientes: (categoriaId) => {
    const { categorias } = get()
    const resultado: string[] = [categoriaId]
    const agregarHijos = (padreId: string) => {
      for (const c of categorias) {
        if (c.parentId === padreId) {
          resultado.push(c.id)
          agregarHijos(c.id)
        }
      }
    }
    agregarHijos(categoriaId)
    return resultado
  },

  crearItem: async (payload) => {
    const { error } = await supabase.from('items_carta').insert({
      nombre: payload.nombre,
      descripcion: payload.descripcion || null,
      categoria_id: payload.categoriaId,
      precio: payload.precio,
      foto_url: payload.fotoUrl || null,
      disponible: payload.disponible,
    })
    if (error) throw error
    await get().cargarCarta(true)
  },

  actualizarItem: async (id, payload) => {
    const { error } = await supabase
      .from('items_carta')
      .update({
        nombre: payload.nombre,
        descripcion: payload.descripcion || null,
        categoria_id: payload.categoriaId,
        precio: payload.precio,
        foto_url: payload.fotoUrl || null,
        disponible: payload.disponible,
      })
      .eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },

  setItemDisponible: async (id, disponible) => {
    const { error } = await supabase
      .from('items_carta')
      .update({ disponible })
      .eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },

  eliminarItem: async (id) => {
    const { error } = await supabase.from('items_carta').delete().eq('id', id)
    if (error) {
      // Código 23503 = violación de FK (el ítem está referenciado en pedidos).
      if (error.code === '23503') {
        throw new Error(
          'Este ítem está en pedidos existentes. Desactivalo en vez de eliminarlo.'
        )
      }
      throw error
    }
    await get().cargarCarta(true)
  },

  crearCategoria: async (payload) => {
    const { error } = await supabase.from('categorias_carta').insert({
      nombre: payload.nombre,
      parent_id: payload.parentId,
      orden: payload.orden,
    })
    if (error) throw error
    await get().cargarCarta(true)
  },

  actualizarCategoria: async (id, payload) => {
    const { error } = await supabase
      .from('categorias_carta')
      .update({ nombre: payload.nombre, parent_id: payload.parentId, orden: payload.orden })
      .eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },

  eliminarCategoria: async (id) => {
    const { error } = await supabase.from('categorias_carta').delete().eq('id', id)
    if (error) {
      // FK: la categoría tiene subcategorías o ítems asociados.
      if (error.code === '23503') {
        throw new Error(
          'La categoría tiene subcategorías o ítems. Vaciala o reasignalos antes de eliminar.'
        )
      }
      throw error
    }
    await get().cargarCarta(true)
  },

  setCategoriaActiva: async (id, activa) => {
    const { error } = await supabase
      .from('categorias_carta')
      .update({ activa })
      .eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },

  suscribirRealtime: () => {
    // Cualquier cambio en carta/categorías/reglas refetchea (con debounce simple).
    let timer: ReturnType<typeof setTimeout> | null = null
    const refrescar = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => get().cargarCarta(true), 400)
    }
    const channel = supabase
      .channel('carta')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items_carta' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_carta' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disponibilidad_items' }, refrescar)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  },

  getReglasByItem: (itemId) => get().reglas.filter((r) => r.itemId === itemId),
  getReglasByCategoria: (categoriaId) => get().reglas.filter((r) => r.categoriaId === categoriaId),

  crearRegla: async (payload) => {
    const createdBy = useAuthStore.getState().usuario?.id
    if (!createdBy) throw new Error('Sin usuario autenticado')
    const { error } = await supabase.from('disponibilidad_items').insert({
      item_id: payload.itemId ?? null,
      categoria_id: payload.categoriaId ?? null,
      disponible: payload.disponible,
      tipo: payload.tipo,
      hora_inicio: payload.horaInicio ?? null,
      hora_fin: payload.horaFin ?? null,
      fecha_inicio: payload.fechaInicio ?? null,
      fecha_fin: payload.fechaFin ?? null,
      motivo: payload.motivo ?? null,
      created_by: createdBy,
    })
    if (error) throw error
    await get().cargarCarta(true)
  },

  actualizarRegla: async (id, payload) => {
    const { error } = await supabase
      .from('disponibilidad_items')
      .update({
        disponible: payload.disponible,
        tipo: payload.tipo,
        hora_inicio: payload.horaInicio ?? null,
        hora_fin: payload.horaFin ?? null,
        fecha_inicio: payload.fechaInicio ?? null,
        fecha_fin: payload.fechaFin ?? null,
        motivo: payload.motivo ?? null,
      })
      .eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },

  eliminarRegla: async (id) => {
    const { error } = await supabase.from('disponibilidad_items').delete().eq('id', id)
    if (error) throw error
    await get().cargarCarta(true)
  },
    }),
    {
      name: 'carta_cache',
      storage: createJSONStorage(() => AsyncStorage),
      // v3: reglas de disponibilidad por categoría (nuevo campo categoria_id).
      version: 3,
      // Descarta cache anterior; cargarCarta() re-hidrata de Supabase.
      migrate: () => ({ categorias: [], items: [], reglas: [], ultimaActualizacion: null }),
      partialize: (state) => ({
        categorias: state.categorias,
        items: state.items,
        reglas: state.reglas,
        ultimaActualizacion: state.ultimaActualizacion,
      }),
    }
  )
)
