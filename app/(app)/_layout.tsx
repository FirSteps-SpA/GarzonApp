import { useEffect, useRef } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Tabs } from 'expo-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useMesasStore } from '@/stores/useMesasStore'
import { useCartaStore } from '@/stores/useCartaStore'
import { usePedidosStore } from '@/stores/usePedidosStore'
import { useHydration } from '@/hooks/useHydration'
import { useConexion } from '@/hooks/useConexion'

export default function AppLayout() {
  const { isGarzon } = useAuthStore()
  const soloGarzon = isGarzon()
  const hidratado = useHydration()
  const online = useConexion()
  const estabaOnline = useRef(true)

  // Suscripciones Realtime para toda la zona autenticada. Se limpian al salir.
  useEffect(() => {
    const unsubMesas = useMesasStore.getState().suscribirRealtime()
    const unsubCarta = useCartaStore.getState().suscribirRealtime()
    return () => {
      unsubMesas()
      unsubCarta()
    }
  }, [])

  // Al recuperar conexión, reconciliamos con el servidor.
  useEffect(() => {
    if (online && !estabaOnline.current) {
      useMesasStore.getState().cargarMesas()
      useCartaStore.getState().cargarCarta(true)
      usePedidosStore.getState().cargarPedidosActivos()
    }
    estabaOnline.current = online
  }, [online])

  // Mientras se leen pedidos/carta de AsyncStorage, mostramos un loader
  // para evitar el flash de estado vacío.
  if (!hidratado) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    )
  }

  return (
    <View style={styles.flex}>
      {!online && (
        <SafeAreaView edges={['top']} style={styles.offline}>
          <Text style={styles.offlineTexto}>Sin conexión · trabajando offline</Text>
        </SafeAreaView>
      )}
      <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen
        name="mesas"
        options={{ title: 'Mesas', headerShown: false }}
      />
      <Tabs.Screen
        name="carta"
        options={{ title: 'Carta', headerShown: false }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'Perfil' }}
      />
      <Tabs.Screen
        name="(admin)"
        options={{
          title: 'Admin',
          // Oculta el tab Admin para garzones
          href: soloGarzon ? null : '/(app)/(admin)',
          headerShown: false,
        }}
      />
      </Tabs>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  offline: { backgroundColor: '#c62828' },
  offlineTexto: {
    color: '#fff', fontSize: 12, fontWeight: '600',
    textAlign: 'center', paddingVertical: 4,
  },
})
