import { View, Text, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FormularioItem } from '@/components/FormularioItem'
import { useCartaStore, ItemPayload } from '@/stores/useCartaStore'

export default function EditarItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const router = useRouter()
  const item = useCartaStore((s) => s.getItemById(itemId))
  const actualizarItem = useCartaStore((s) => s.actualizarItem)
  const eliminarItem = useCartaStore((s) => s.eliminarItem)

  if (!item) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Ítem no encontrado.</Text>
      </View>
    )
  }

  const onSubmit = async (payload: ItemPayload) => {
    await actualizarItem(item.id, payload)
    router.back()
  }

  const onEliminar = () => {
    Alert.alert('Eliminar ítem', `¿Eliminar "${item.nombre}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarItem(item.id)
            router.back()
          } catch (e) {
            Alert.alert('No se pudo eliminar', e instanceof Error ? e.message : 'Error')
          }
        },
      },
    ])
  }

  return (
    <FormularioItem
      textoBoton="Guardar cambios"
      onSubmit={onSubmit}
      onEliminar={onEliminar}
      inicial={{
        nombre: item.nombre,
        descripcion: item.descripcion ?? undefined,
        categoriaId: item.categoriaId,
        precio: item.precio,
        fotoUrl: item.fotoUrl ?? undefined,
        disponible: item.disponible,
      }}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: 16, color: '#c62828' },
})
