import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native'
import { useLocalSearchParams, Stack } from 'expo-router'
import { useCartaStore } from '@/stores/useCartaStore'
import { GestorReglas, DatosRegla } from '@/components/GestorReglas'

export default function DisponibilidadItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const item = useCartaStore((s) => s.getItemById(itemId))
  const getReglasByItem = useCartaStore((s) => s.getReglasByItem)
  const setItemDisponible = useCartaStore((s) => s.setItemDisponible)
  const crearRegla = useCartaStore((s) => s.crearRegla)
  const eliminarRegla = useCartaStore((s) => s.eliminarRegla)
  useCartaStore((s) => s.reglas) // suscripción para re-render al crear/eliminar

  if (!item) {
    return <View style={styles.center}><Text style={styles.error}>Ítem no encontrado.</Text></View>
  }

  const onCrear = (datos: DatosRegla) => crearRegla({ itemId: item.id, ...datos })
  const actualizarRegla = useCartaStore((s) => s.actualizarRegla)
  const onActualizar = (id: string, datos: DatosRegla) => actualizarRegla(id, datos)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: item.nombre }} />

      <View style={styles.card}>
        <View style={styles.switchFila}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Disponibilidad base</Text>
            <Text style={styles.hint}>Si la apagás, el ítem queda no disponible siempre.</Text>
          </View>
          <Switch value={item.disponible} onValueChange={(v) => setItemDisponible(item.id, v)} />
        </View>
      </View>

      <GestorReglas
        reglas={getReglasByItem(item.id)}
        onCrear={onCrear}
        onActualizar={onActualizar}
        onEliminar={eliminarRegla}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contenido: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 16, color: '#c62828' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#444' },
  hint: { fontSize: 12, color: '#999', marginTop: 2 },
  switchFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
