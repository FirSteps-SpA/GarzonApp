import { useRouter } from 'expo-router'
import { FormularioCategoria } from '@/components/FormularioCategoria'
import { useCartaStore, CategoriaPayload } from '@/stores/useCartaStore'

export default function NuevaCategoriaScreen() {
  const router = useRouter()
  const crearCategoria = useCartaStore((s) => s.crearCategoria)

  const onSubmit = async (payload: CategoriaPayload) => {
    await crearCategoria(payload)
    router.back()
  }

  return <FormularioCategoria textoBoton="Crear categoría" onSubmit={onSubmit} />
}
