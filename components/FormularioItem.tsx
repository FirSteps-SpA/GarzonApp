import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Switch,
  Modal, FlatList, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useCartaStore, ItemPayload } from '@/stores/useCartaStore'
import { itemSchema } from '@/lib/validaciones'

interface Props {
  inicial?: Partial<ItemPayload>
  textoBoton: string
  onSubmit: (payload: ItemPayload) => Promise<void>
  onEliminar?: () => void // solo en modo edición
}

export function FormularioItem({ inicial, textoBoton, onSubmit, onEliminar }: Props) {
  // Seleccionamos la función (referencia estable) y la llamamos en el render,
  // en vez de devolver el array desde el selector (causaría loop en Zustand v5).
  const getCategoriasHoja = useCartaStore((s) => s.getCategoriasHoja)
  const categoriasHoja = getCategoriasHoja()

  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '')
  const [precio, setPrecio] = useState(inicial?.precio != null ? String(inicial.precio) : '')
  const [categoriaId, setCategoriaId] = useState(inicial?.categoriaId ?? '')
  const [fotoUrl, setFotoUrl] = useState(inicial?.fotoUrl ?? '')
  const [disponible, setDisponible] = useState(inicial?.disponible ?? true)

  const [errores, setErrores] = useState<Record<string, string>>({})
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const categoriaSeleccionada = categoriasHoja.find((c) => c.id === categoriaId)

  const guardar = async () => {
    const parsed = itemSchema.safeParse({
      nombre, descripcion, categoriaId, precio, fotoUrl, disponible,
    })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[issue.path[0] as string] = issue.message
      setErrores(errs)
      return
    }
    setErrores({})
    setGuardando(true)
    try {
      await onSubmit({
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        categoriaId: parsed.data.categoriaId,
        precio: parsed.data.precio,
        fotoUrl: parsed.data.fotoUrl || undefined,
        disponible: parsed.data.disponible,
      })
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Campo label="Nombre" error={errores.nombre}>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Ej: Pisco Sour" />
      </Campo>

      <Campo label="Precio" error={errores.precio}>
        <TextInput
          style={styles.input} value={precio} onChangeText={setPrecio}
          keyboardType="numeric" placeholder="3990"
        />
      </Campo>

      <Campo label="Categoría" error={errores.categoriaId}>
        <TouchableOpacity style={styles.selector} onPress={() => setPickerAbierto(true)}>
          <Text style={categoriaSeleccionada ? styles.selectorTexto : styles.selectorPlaceholder}>
            {categoriaSeleccionada?.ruta ?? 'Elegí una categoría'}
          </Text>
        </TouchableOpacity>
      </Campo>

      <Campo label="Descripción (opcional)">
        <TextInput
          style={[styles.input, styles.multiline]} value={descripcion} onChangeText={setDescripcion}
          multiline placeholder="Descripción del ítem"
        />
      </Campo>

      <Campo label="URL de foto (opcional)" error={errores.fotoUrl}>
        <TextInput
          style={styles.input} value={fotoUrl} onChangeText={setFotoUrl}
          autoCapitalize="none" placeholder="https://..."
        />
      </Campo>

      <View style={styles.switchFila}>
        <Text style={styles.label}>Disponible</Text>
        <Switch value={disponible} onValueChange={setDisponible} />
      </View>

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>{textoBoton}</Text>}
      </TouchableOpacity>

      {onEliminar && (
        <TouchableOpacity style={styles.botonEliminar} onPress={onEliminar} disabled={guardando}>
          <Text style={styles.botonEliminarTexto}>Eliminar ítem</Text>
        </TouchableOpacity>
      )}

      {/* Selector de categoría */}
      <Modal visible={pickerAbierto} animationType="slide" transparent>
        <View style={styles.modalFondo}>
          <View style={styles.modalCaja}>
            <Text style={styles.modalTitulo}>Categoría</Text>
            <FlatList
              data={categoriasHoja}
              keyExtractor={(c) => c.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.opcion}
                  onPress={() => { setCategoriaId(item.id); setPickerAbierto(false) }}
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

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error && <Text style={styles.errorTexto}>{error}</Text>}
    </View>
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
  multiline: { height: 80, textAlignVertical: 'top' },
  selector: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  selectorTexto: { fontSize: 15, color: '#1a1a1a' },
  selectorPlaceholder: { fontSize: 15, color: '#aaa' },
  switchFila: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, paddingVertical: 4,
  },
  boton: {
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 16, alignItems: 'center',
  },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
  botonEliminar: {
    borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: '#c62828',
  },
  botonEliminarTexto: { color: '#c62828', fontSize: 15, fontWeight: '600' },
  errorTexto: { color: '#c62828', fontSize: 12, marginTop: 4 },
  modalFondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCaja: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  modalTitulo: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  opcion: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  opcionTexto: { fontSize: 15, color: '#1a1a1a' },
  cerrar: { padding: 14, alignItems: 'center', marginTop: 8 },
  cerrarTexto: { fontSize: 15, color: '#666', fontWeight: '600' },
})
