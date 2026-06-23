import { useEffect, useMemo } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useCartaStore } from '@/stores/useCartaStore'

export default function CategoriasScreen() {
  const router = useRouter()
  const { categorias, cargarCarta } = useCartaStore()
  const getCategoriasConRuta = useCartaStore((s) => s.getCategoriasConRuta)
  const setCategoriaActiva = useCartaStore((s) => s.setCategoriaActiva)

  useEffect(() => {
    if (categorias.length === 0) cargarCarta()
  }, [])

  const lista = useMemo(() => getCategoriasConRuta(), [categorias])

  const onToggle = async (id: string, activa: boolean) => {
    try {
      await setCategoriaActiva(id, activa)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(app)/(admin)/categorias/nueva-categoria')}>
              <Text style={styles.nuevo}>+ Nueva</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <FlatList
        data={lista}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <TouchableOpacity
              style={styles.filaInfo}
              onPress={() => router.push(`/(app)/(admin)/categorias/${item.id}`)}
            >
              <Text style={[styles.ruta, !item.activa && styles.atenuado]}>{item.ruta}</Text>
            </TouchableOpacity>
            <Switch value={item.activa} onValueChange={(v) => onToggle(item.id, v)} />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  nuevo: { color: '#1565c0', fontSize: 15, fontWeight: '600' },
  lista: { padding: 12 },
  fila: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  filaInfo: { flex: 1 },
  ruta: { fontSize: 15, color: '#1a1a1a' },
  atenuado: { color: '#bbb' },
})

