import { useEffect } from 'react'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/useAuthStore'

export default function AdminLayout() {
  const { isGarzon } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // Defensa en profundidad: un garzón nunca debe entrar a /(admin)
    if (isGarzon()) {
      router.replace('/(app)/mesas')
    }
  }, [])

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Administración' }} />
      <Stack.Screen name="items/index" options={{ title: 'Gestión de carta' }} />
      <Stack.Screen name="items/nuevo-item" options={{ title: 'Nuevo ítem', presentation: 'modal' }} />
      <Stack.Screen name="items/[itemId]" options={{ title: 'Editar ítem', presentation: 'modal' }} />
      <Stack.Screen name="categorias/index" options={{ title: 'Categorías' }} />
      <Stack.Screen name="categorias/nueva-categoria" options={{ title: 'Nueva categoría', presentation: 'modal' }} />
      <Stack.Screen name="categorias/[categoriaId]" options={{ title: 'Editar categoría', presentation: 'modal' }} />
      <Stack.Screen name="disponibilidad/index" options={{ title: 'Disponibilidad' }} />
      <Stack.Screen name="disponibilidad/[itemId]" options={{ title: 'Disponibilidad del ítem' }} />
      <Stack.Screen name="disponibilidad/categoria/[categoriaId]" options={{ title: 'Disponibilidad de categoría' }} />
      <Stack.Screen name="usuarios/index" options={{ title: 'Garzones' }} />
      <Stack.Screen name="usuarios/nuevo-usuario" options={{ title: 'Nuevo garzón', presentation: 'modal' }} />
    </Stack>
  )
}
