import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/useAuthStore'

export default function AdminScreen() {
  const router = useRouter()
  const usuario = useAuthStore((s) => s.usuario)

  return (
    <View style={styles.container}>
      <Text style={styles.saludo}>Hola, {usuario?.nombre ?? 'admin'}</Text>

      <Opcion
        titulo="Gestión de carta"
        descripcion="Crear, editar y activar/desactivar ítems"
        onPress={() => router.push('/(app)/(admin)/items')}
      />
      <Opcion
        titulo="Categorías"
        descripcion="Crear, editar y reordenar categorías de la carta"
        onPress={() => router.push('/(app)/(admin)/categorias')}
      />
      <Opcion
        titulo="Disponibilidad"
        descripcion="Reglas por horario, temporada o manuales"
        onPress={() => router.push('/(app)/(admin)/disponibilidad')}
      />
      <Opcion
        titulo="Garzones"
        descripcion="Crear y activar/desactivar usuarios"
        onPress={() => router.push('/(app)/(admin)/usuarios')}
      />
    </View>
  )
}

function Opcion({ titulo, descripcion, onPress }: { titulo: string; descripcion: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.cardTitulo}>{titulo}</Text>
      <Text style={styles.cardDesc}>{descripcion}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  saludo: { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginVertical: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
  },
  cardTitulo: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardDesc: { fontSize: 13, color: '#888', marginTop: 4 },
})
