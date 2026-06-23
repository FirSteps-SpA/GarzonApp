import { useEffect, useMemo, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useCartaStore } from '@/stores/useCartaStore'
import { BuscadorConClear } from '@/components/BuscadorConClear'

type Modo = 'items' | 'categorias'

export default function DisponibilidadListaScreen() {
  const router = useRouter()
  const { items, reglas, cargarCarta, isItemDisponible } = useCartaStore()
  const getReglasByItem = useCartaStore((s) => s.getReglasByItem)
  const getReglasByCategoria = useCartaStore((s) => s.getReglasByCategoria)
  const getCategoriasConRuta = useCartaStore((s) => s.getCategoriasConRuta)
  const [busqueda, setBusqueda] = useState('')
  const [modo, setModo] = useState<Modo>('items')

  useEffect(() => {
    if (items.length === 0) cargarCarta()
  }, [])

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = q ? items.filter((i) => i.nombre.toLowerCase().includes(q)) : items
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [items, busqueda])

  const categoriasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = getCategoriasConRuta()
    return q ? lista.filter((c) => c.ruta.toLowerCase().includes(q)) : lista
  }, [reglas, busqueda, modo])

  return (
    <View style={styles.container}>
      {/* Selector Ítems / Categorías */}
      <View style={styles.tabs}>
        {(['items', 'categorias'] as Modo[]).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.tab, modo === m && styles.tabActiva]}
            onPress={() => setModo(m)}
          >
            <Text style={[styles.tabTexto, modo === m && styles.tabTextoActivo]}>
              {m === 'items' ? 'Ítems' : 'Categorías'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <BuscadorConClear
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder={modo === 'items' ? 'Buscar ítem...' : 'Buscar categoría...'}
      />

      {modo === 'items' ? (
        <FlatList
          data={itemsFiltrados}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.lista}
          extraData={reglas}
          renderItem={({ item }) => {
            const nReglas = getReglasByItem(item.id).length
            const disp = isItemDisponible(item.id)
            return (
              <TouchableOpacity
                style={styles.fila}
                onPress={() => router.push(`/(app)/(admin)/disponibilidad/${item.id}`)}
              >
                <View style={styles.filaInfo}>
                  <Text style={styles.nombre}>{item.nombre}</Text>
                  <Text style={styles.sub}>{nReglas === 0 ? 'Sin reglas' : `${nReglas} regla(s)`}</Text>
                </View>
                <View style={[styles.badge, disp ? styles.badgeOk : styles.badgeNo]}>
                  <Text style={[styles.badgeTexto, { color: disp ? '#2e7d32' : '#c62828' }]}>
                    {disp ? 'Disponible' : 'No disp.'}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      ) : (
        <FlatList
          data={categoriasFiltradas}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.lista}
          extraData={reglas}
          renderItem={({ item }) => {
            const nReglas = getReglasByCategoria(item.id).length
            return (
              <TouchableOpacity
                style={styles.fila}
                onPress={() => router.push(`/(app)/(admin)/disponibilidad/categoria/${item.id}`)}
              >
                <View style={styles.filaInfo}>
                  <Text style={styles.nombre}>{item.ruta}</Text>
                  <Text style={styles.sub}>{nReglas === 0 ? 'Sin reglas' : `${nReglas} regla(s)`}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  tabs: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  tabActiva: { backgroundColor: '#1a1a1a' },
  tabTexto: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextoActivo: { color: '#fff' },
  lista: { paddingHorizontal: 12, paddingBottom: 24 },
  fila: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  filaInfo: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  sub: { fontSize: 12, color: '#999', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeOk: { backgroundColor: '#e8f5e9' },
  badgeNo: { backgroundColor: '#ffebee' },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
})
