import { useRouter } from 'expo-router'
import { FormularioItem } from '@/components/FormularioItem'
import { useCartaStore, ItemPayload } from '@/stores/useCartaStore'

export default function NuevoItemScreen() {
  const router = useRouter()
  const crearItem = useCartaStore((s) => s.crearItem)

  const onSubmit = async (payload: ItemPayload) => {
    await crearItem(payload)
    router.back()
  }

  return <FormularioItem textoBoton="Crear ítem" onSubmit={onSubmit} />
}
