import { View, Text, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FormularioCategoria } from '@/components/FormularioCategoria'
import { useCartaStore, CategoriaPayload } from '@/stores/useCartaStore'

export default function EditarCategoriaScreen() {
  const { categoriaId } = useLocalSearchParams<{ categoriaId: string }>()
  const router = useRouter()
  const categoria = useCartaStore((s) => s.getCategoriaById(categoriaId))
  const actualizarCategoria = useCartaStore((s) => s.actualizarCategoria)
  const eliminarCategoria = useCartaStore((s) => s.eliminarCategoria)

  if (!categoria) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Categoría no encontrada.</Text>
      </View>
    )
  }

  const onSubmit = async (payload: CategoriaPayload) => {
    await actualizarCategoria(categoria.id, payload)
    router.back()
  }

  const onEliminar = () => {
    Alert.alert('Eliminar categoría', `¿Eliminar "${categoria.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarCategoria(categoria.id)
            router.back()
          } catch (e) {
            Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : 'Error')
          }
        },
      },
    ])
  }

  return (
    <FormularioCategoria
      textoBoton="Guardar cambios"
      idEditando={categoria.id}
      onSubmit={onSubmit}
      onEliminar={onEliminar}
      inicial={{ nombre: categoria.nombre, parentId: categoria.parentId, orden: categoria.orden }}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 16, color: '#c62828' },
})
