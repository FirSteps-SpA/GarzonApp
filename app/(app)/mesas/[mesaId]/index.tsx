import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { useMesasStore } from '@/stores/useMesasStore'
import { usePedidosStore } from '@/stores/usePedidosStore'
import { ESTILOS_ESTADO } from '@/constants/estadosMesa'
import { ResumenPedido } from '@/components/ResumenPedido'

export default function DetalleMesaScreen() {
  const { mesaId } = useLocalSearchParams<{ mesaId: string }>()
  const router = useRouter()
  const { getMesaById, getEstadoMesa, actualizarEstadoMesa } = useMesasStore()
  const pedido = usePedidosStore((s) => s.pedidosPorMesa[mesaId])
  const iniciarPedido = usePedidosStore((s) => s.iniciarPedido)
  const marcarComoEnviado = usePedidosStore((s) => s.marcarComoEnviado)
  const syncError = usePedidosStore((s) => s.syncErrores[mesaId])
  const reintentarSync = usePedidosStore((s) => s.reintentarSync)

  const mesa = getMesaById(mesaId)

  if (!mesa) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Mesa no encontrada.</Text>
      </View>
    )
  }

  const estado = getEstadoMesa(mesa.id)?.estado ?? 'libre'
  const estilo = ESTILOS_ESTADO[estado]

  const handleIniciar = async () => {
    // Intentamos ocupar primero (con optimistic lock). Si otro garzón la tomó,
    // no creamos el pedido y avisamos.
    const ok = await actualizarEstadoMesa(mesa.id, 'ocupada')
    if (!ok) {
      Alert.alert(
        'Mesa ya tomada',
        'Otro garzón ocupó esta mesa. El mapa se actualizó.'
      )
      return
    }
    iniciarPedido(mesa.id, mesa.numero)
  }

  const irACarta = () => {
    router.push(`/(app)/mesas/${mesa.id}/carta`)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Stack.Screen
        options={{ title: `Mesa ${mesa.esVirtual ? `[${mesa.numero}]` : mesa.numero}` }}
      />

      {/* Cabecera de estado */}
      <View style={styles.cabecera}>
        <View style={[styles.badge, { backgroundColor: estilo.color }]}>
          <Text style={[styles.badgeTexto, { color: estilo.texto }]}>
            {estilo.label}
          </Text>
        </View>
        {pedido && (
          <View
            style={[
              styles.badge,
              { backgroundColor: pedido.estado === 'enviado' ? '#e8f5e9' : '#fff8e1' },
            ]}
          >
            <Text
              style={[
                styles.badgeTexto,
                { color: pedido.estado === 'enviado' ? '#2e7d32' : '#ef6c00' },
              ]}
            >
              {pedido.estado === 'enviado' ? 'Enviado al PC' : 'Borrador'}
            </Text>
          </View>
        )}
      </View>

      {syncError && (
        <TouchableOpacity style={styles.syncError} onPress={() => reintentarSync(mesaId)}>
          <Text style={styles.syncErrorTexto}>
            ⚠ No se pudo sincronizar con el servidor. Tocá para reintentar.
          </Text>
        </TouchableOpacity>
      )}

      {!pedido ? (
        <View style={styles.sinPedido}>
          <Text style={styles.sinPedidoTexto}>Sin pedido activo</Text>
          <TouchableOpacity style={styles.botonPrimario} onPress={handleIniciar}>
            <Text style={styles.botonPrimarioTexto}>Iniciar pedido</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ResumenPedido mesaId={mesa.id} />

          <TouchableOpacity style={styles.botonPrimario} onPress={irACarta}>
            <Text style={styles.botonPrimarioTexto}>Agregar ítems</Text>
          </TouchableOpacity>

          {pedido.estado === 'borrador' && pedido.items.length > 0 && (
            <TouchableOpacity
              style={styles.botonSecundario}
              onPress={() => marcarComoEnviado(mesa.id)}
            >
              <Text style={styles.botonSecundarioTexto}>Marcar como enviado</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contenido: { padding: 16 },
  cabecera: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  badgeTexto: { fontSize: 13, fontWeight: '600' },
  sinPedido: { alignItems: 'center', paddingVertical: 40 },
  sinPedidoTexto: { fontSize: 15, color: '#888', marginBottom: 20 },
  botonPrimario: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'stretch',
  },
  botonPrimarioTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
  botonSecundario: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  botonSecundarioTexto: { color: '#2e7d32', fontSize: 16, fontWeight: '600' },
  error: { fontSize: 16, color: '#c62828', textAlign: 'center', marginTop: 40 },
  syncError: {
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  syncErrorTexto: { color: '#e65100', fontSize: 13, fontWeight: '500' },
})
