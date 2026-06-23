import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, FlatList,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useCartaStore, CategoriaPayload } from '@/stores/useCartaStore'
import { categoriaSchema } from '@/lib/validaciones'

interface Props {
  inicial?: Partial<CategoriaPayload>
  textoBoton: string
  idEditando?: string // para excluirse a sí misma y sus descendientes del picker de padre
  onSubmit: (payload: CategoriaPayload) => Promise<void>
  onEliminar?: () => void
}

const RAIZ = { id: '__raiz__', ruta: '(Raíz · sin categoría padre)' }

export function FormularioCategoria({ inicial, textoBoton, idEditando, onSubmit, onEliminar }: Props) {
  const getCategoriasConRuta = useCartaStore((s) => s.getCategoriasConRuta)
  const getDescendientes = useCartaStore((s) => s.getDescendientes)

  const excluidos = idEditando ? new Set(getDescendientes(idEditando)) : new Set<string>()
  const opcionesPadre = [RAIZ, ...getCategoriasConRuta().filter((c) => !excluidos.has(c.id))]

  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [parentId, setParentId] = useState<string | null>(inicial?.parentId ?? null)
  const [orden, setOrden] = useState(inicial?.orden != null ? String(inicial.orden) : '0')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const padreLabel = parentId
    ? opcionesPadre.find((c) => c.id === parentId)?.ruta ?? '(desconocido)'
    : RAIZ.ruta

  const guardar = async () => {
    const parsed = categoriaSchema.safeParse({ nombre, parentId, orden })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const i of parsed.error.issues) errs[i.path[0] as string] = i.message
      setErrores(errs)
      return
    }
    setErrores({})
    setGuardando(true)
    try {
      await onSubmit(parsed.data)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <View style={styles.campo}>
        <Text style={styles.label}>Nombre</Text>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Postres" />
        {errores.nombre && <Text style={styles.errorTexto}>{errores.nombre}</Text>}
      </View>

      <View style={styles.campo}>
        <Text style={styles.label}>Categoría padre</Text>
        <TouchableOpacity style={styles.selector} onPress={() => setPickerAbierto(true)}>
          <Text style={styles.selectorTexto}>{padreLabel}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.campo}>
        <Text style={styles.label}>Orden</Text>
        <TextInput style={styles.input} value={orden} onChangeText={setOrden} keyboardType="numeric" placeholder="0" />
        {errores.orden && <Text style={styles.errorTexto}>{errores.orden}</Text>}
      </View>

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>{textoBoton}</Text>}
      </TouchableOpacity>

      {onEliminar && (
        <TouchableOpacity style={styles.botonEliminar} onPress={onEliminar} disabled={guardando}>
          <Text style={styles.botonEliminarTexto}>Eliminar categoría</Text>
        </TouchableOpacity>
      )}

      <Modal visible={pickerAbierto} animationType="slide" transparent>
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>Categoría padre</Text>
            <FlatList
              data={opcionesPadre}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.opcion}
                  onPress={() => {
                    setParentId(item.id === RAIZ.id ? null : item.id)
                    setPickerAbierto(false)
                  }}
                >
                  <Text style={styles.opcionTexto}>{item.ruta}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.cerrar} onPress={() => setPickerAbierto(false)}>
              <Text style={styles.cerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  contenido: { padding: 16 },
  campo: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 15,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  selector: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  selectorTexto: { fontSize: 15, color: '#1a1a1a' },
  errorTexto: { color: '#c62828', fontSize: 12, marginTop: 4 },
  boton: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 16, alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
  botonEliminar: {
    borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: '#c62828',
  },
  botonEliminarTexto: { color: '#c62828', fontSize: 15, fontWeight: '600' },
  modalFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitulo: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  opcion: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  opcionTexto: { fontSize: 15, color: '#1a1a1a' },
  cerrar: { padding: 14, alignItems: 'center', marginTop: 8 },
  cerrarTexto: { fontSize: 15, color: '#666', fontWeight: '600' },
})
