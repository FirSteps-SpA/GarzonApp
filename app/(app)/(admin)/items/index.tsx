import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, Alert,
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useCartaStore } from '@/stores/useCartaStore'
import { BuscadorConClear } from '@/components/BuscadorConClear'

export default function AdminCartaScreen() {
  const router = useRouter()
  const { items, categorias, cargarCarta, getCategoriaById, setItemDisponible } = useCartaStore()
  const [busqueda, setBusqueda] = useState('')
  const [refrescando, setRefrescando] = useState(false)

  useEffect(() => {
    if (items.length === 0) cargarCarta()
  }, [])

  const refrescar = async () => {
    setRefrescando(true)
    await cargarCarta(true) // fuerza fetch a Supabase (ignora TTL)
    setRefrescando(false)
  }

  const rutaCategoria = (categoriaId: string): string => {
    const cat = getCategoriaById(categoriaId)
    if (!cat) return ''
    return cat.parentId ? `${rutaCategoria(cat.parentId)} › ${cat.nombre}` : cat.nombre
  }

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = q ? items.filter((i) => i.nombre.toLowerCase().includes(q)) : items
    return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [items, busqueda])

  const toggleDisponible = async (id: string, valor: boolean) => {
    try {
      await setItemDisponible(id, valor)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(app)/(admin)/items/nuevo-item')}>
              <Text style={styles.nuevo}>+ Nuevo</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <BuscadorConClear value={busqueda} onChangeText={setBusqueda} placeholder="Buscar ítem..." />

      <FlatList
        data={itemsFiltrados}
        keyExtractor={(i) => i.id}
        refreshing={refrescando}
        onRefresh={refrescar}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <TouchableOpacity
              style={styles.filaInfo}
              onPress={() => router.push(`/(app)/(admin)/items/${item.id}`)}
            >
              <Text style={[styles.nombre, !item.disponible && styles.atenuado]}>
                {item.nombre}
              </Text>
              <Text style={styles.ruta}>{rutaCategoria(item.categoriaId)}</Text>
              <Text style={styles.precio}>${item.precio.toLocaleString('es-CL')}</Text>
            </TouchableOpacity>
            <Switch
              value={item.disponible}
              onValueChange={(v) => toggleDisponible(item.id, v)}
            />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  nuevo: { color: '#1565c0', fontSize: 15, fontWeight: '600' },
  lista: { paddingHorizontal: 12, paddingBottom: 24 },
  fila: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  filaInfo: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  atenuado: { color: '#bbb', textDecorationLine: 'line-through' },
  ruta: { fontSize: 12, color: '#999', marginTop: 2 },
  precio: { fontSize: 14, color: '#2e7d32', marginTop: 4, fontWeight: '600' },
})
