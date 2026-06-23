import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useLocalSearchParams, Stack } from 'expo-router'
import { useCartaStore } from '@/stores/useCartaStore'
import { GestorReglas, DatosRegla } from '@/components/GestorReglas'

export default function DisponibilidadCategoriaScreen() {
  const { categoriaId } = useLocalSearchParams<{ categoriaId: string }>()
  const categoria = useCartaStore((s) => s.getCategoriaById(categoriaId))
  const getReglasByCategoria = useCartaStore((s) => s.getReglasByCategoria)
  const crearRegla = useCartaStore((s) => s.crearRegla)
  const eliminarRegla = useCartaStore((s) => s.eliminarRegla)
  useCartaStore((s) => s.reglas) // suscripción para re-render

  if (!categoria) {
    return <View style={styles.center}><Text style={styles.error}>Categoría no encontrada.</Text></View>
  }

  const onCrear = (datos: DatosRegla) => crearRegla({ categoriaId: categoria.id, ...datos })
  const actualizarRegla = useCartaStore((s) => s.actualizarRegla)
  const onActualizar = (id: string, datos: DatosRegla) => actualizarRegla(id, datos)

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Stack.Screen options={{ title: categoria.nombre }} />

      <View style={styles.aviso}>
        <Text style={styles.avisoTexto}>
          Las reglas de esta categoría aplican a todos sus ítems y subcategorías.
        </Text>
      </View>

      <GestorReglas
        reglas={getReglasByCategoria(categoria.id)}
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
  aviso: { backgroundColor: '#e3f2fd', borderRadius: 8, padding: 12, marginBottom: 16 },
  avisoTexto: { color: '#1565c0', fontSize: 13 },
})
