import { useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useUsuariosStore } from '@/stores/useUsuariosStore'

export default function UsuariosScreen() {
  const router = useRouter()
  const { usuarios, cargando, cargarUsuarios, toggleActivo } = useUsuariosStore()

  useEffect(() => {
    cargarUsuarios()
  }, [])

  const onToggle = async (id: string, activo: boolean) => {
    try {
      await toggleActivo(id, activo)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar')
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/(app)/(admin)/usuarios/nuevo-usuario')}>
              <Text style={styles.nuevo}>+ Nuevo</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={usuarios}
        keyExtractor={(u) => u.id}
        refreshing={cargando}
        onRefresh={cargarUsuarios}
        contentContainerStyle={styles.lista}
        ListEmptyComponent={
          !cargando ? <Text style={styles.vacio}>Sin usuarios.</Text> : null
        }
        renderItem={({ item }) => (
          <View style={styles.fila}>
            <View style={styles.filaInfo}>
              <Text style={[styles.nombre, !item.activo && styles.atenuado]}>{item.nombre}</Text>
              <Text style={styles.meta}>
                {item.rol}
                {item.codigoGarzon ? ` · código ${item.codigoGarzon}` : ''}
              </Text>
            </View>
            {/* Solo se puede activar/desactivar garzones, no admin/dev. */}
            {item.rol === 'garzon' ? (
              <Switch value={item.activo} onValueChange={(v) => onToggle(item.id, v)} />
            ) : (
              <Text style={styles.protegido}>—</Text>
            )}
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
  vacio: { textAlign: 'center', color: '#aaa', marginTop: 40 },
  fila: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
  },
  filaInfo: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  atenuado: { color: '#bbb' },
  meta: { fontSize: 12, color: '#999', marginTop: 2, textTransform: 'capitalize' },
  protegido: { color: '#ccc', fontSize: 18 },
})
