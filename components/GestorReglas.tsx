import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Alert, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { TipoRegla, ReglaDisponibilidad } from '@/stores/useCartaStore'

type CampoFecha = 'horaInicio' | 'horaFin' | 'fechaInicio' | 'fechaFin'

const pad = (n: number) => String(n).padStart(2, '0')
const fmtHora = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const fmtFecha = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Parseo inverso para cargar una regla existente en el formulario.
const parseHora = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}
const parseFecha = (s: string) => {
  const [y, mo, da] = s.split('-').map(Number)
  return new Date(y, mo - 1, da)
}

export interface DatosRegla {
  tipo: TipoRegla
  disponible: boolean
  motivo?: string | null
  horaInicio?: string | null
  horaFin?: string | null
  fechaInicio?: string | null
  fechaFin?: string | null
}

interface Props {
  reglas: ReglaDisponibilidad[]
  onCrear: (datos: DatosRegla) => Promise<void>
  onActualizar: (id: string, datos: DatosRegla) => Promise<void>
  onEliminar: (id: string) => void
}

export function GestorReglas({ reglas, onCrear, onActualizar, onEliminar }: Props) {
  const [tipo, setTipo] = useState<TipoRegla>('manual')
  const [disponible, setDisponible] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [horaInicio, setHoraInicio] = useState<Date | null>(null)
  const [horaFin, setHoraFin] = useState<Date | null>(null)
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null)
  const [fechaFin, setFechaFin] = useState<Date | null>(null)
  const [picker, setPicker] = useState<CampoFecha | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  const resetForm = () => {
    setEditandoId(null); setTipo('manual'); setDisponible(false); setMotivo('')
    setHoraInicio(null); setHoraFin(null); setFechaInicio(null); setFechaFin(null)
    setPicker(null)
  }

  const cargarRegla = (r: ReglaDisponibilidad) => {
    setEditandoId(r.id)
    setTipo(r.tipo)
    setDisponible(r.disponible)
    setMotivo(r.motivo ?? '')
    setHoraInicio(r.horaInicio ? parseHora(r.horaInicio) : null)
    setHoraFin(r.horaFin ? parseHora(r.horaFin) : null)
    setFechaInicio(r.fechaInicio ? parseFecha(r.fechaInicio) : null)
    setFechaFin(r.fechaFin ? parseFecha(r.fechaFin) : null)
    setPicker(null)
  }

  const valores: Record<CampoFecha, Date | null> = { horaInicio, horaFin, fechaInicio, fechaFin }
  const setters: Record<CampoFecha, (d: Date) => void> = {
    horaInicio: setHoraInicio, horaFin: setHoraFin, fechaInicio: setFechaInicio, fechaFin: setFechaFin,
  }

  const onChangePicker = (event: { type: string }, date?: Date) => {
    if (Platform.OS === 'android') setPicker(null)
    if (event.type === 'dismissed' || !date || !picker) return
    setters[picker](date)
  }

  const guardar = async () => {
    if (tipo === 'horario' && (!horaInicio || !horaFin)) {
      return Alert.alert('Horario incompleto', 'Elegí hora de inicio y fin.')
    }
    if (tipo === 'temporada' && (!fechaInicio || !fechaFin)) {
      return Alert.alert('Fechas incompletas', 'Elegí fecha de inicio y fin.')
    }
    const datos: DatosRegla = {
      tipo,
      disponible,
      motivo: tipo === 'manual' ? motivo || 'Agotado' : null,
      horaInicio: tipo === 'horario' && horaInicio ? `${fmtHora(horaInicio)}:00` : null,
      horaFin: tipo === 'horario' && horaFin ? `${fmtHora(horaFin)}:00` : null,
      fechaInicio: tipo === 'temporada' && fechaInicio ? fmtFecha(fechaInicio) : null,
      fechaFin: tipo === 'temporada' && fechaFin ? fmtFecha(fechaFin) : null,
    }
    setGuardando(true)
    try {
      if (editandoId) await onActualizar(editandoId, datos)
      else await onCrear(datos)
      resetForm()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar la regla')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = (id: string) => {
    Alert.alert('Eliminar regla', '¿Seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => onEliminar(id) },
    ])
  }

  return (
    <View>
      <Text style={styles.seccion}>Reglas activas</Text>
      {reglas.length === 0 ? (
        <Text style={styles.vacio}>Sin reglas.</Text>
      ) : (
        reglas.map((r) => (
          <View key={r.id} style={[styles.regla, editandoId === r.id && styles.reglaEditando]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => cargarRegla(r)}>
              <Text style={styles.reglaTexto}>{descripcionRegla(r)}</Text>
              <Text style={styles.reglaEditar}>Tocar para editar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => borrar(r.id)}>
              <Text style={styles.borrar}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <Text style={styles.seccion}>{editandoId ? 'Editar regla' : 'Nueva regla'}</Text>
      <View style={styles.card}>
        <View style={styles.tipos}>
          {(['manual', 'horario', 'temporada'] as TipoRegla[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tipoBtn, tipo === t && styles.tipoBtnActivo]}
              onPress={() => setTipo(t)}
            >
              <Text style={[styles.tipoTexto, tipo === t && styles.tipoTextoActivo]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.switchFila}>
          <Text style={styles.label}>Disponible durante la regla</Text>
          <Switch value={disponible} onValueChange={setDisponible} />
        </View>

        {tipo === 'manual' && (
          <TextInput style={styles.input} value={motivo} onChangeText={setMotivo} placeholder="Motivo (ej: Agotado hoy)" />
        )}
        {tipo === 'horario' && (
          <View style={styles.fila2}>
            <SelectorFecha style={styles.medio} label="Inicio" valor={horaInicio ? fmtHora(horaInicio) : null} onPress={() => setPicker('horaInicio')} />
            <SelectorFecha style={styles.medio} label="Fin" valor={horaFin ? fmtHora(horaFin) : null} onPress={() => setPicker('horaFin')} />
          </View>
        )}
        {tipo === 'temporada' && (
          <View style={styles.fila2}>
            <SelectorFecha style={styles.medio} label="Desde" valor={fechaInicio ? fmtFecha(fechaInicio) : null} onPress={() => setPicker('fechaInicio')} />
            <SelectorFecha style={styles.medio} label="Hasta" valor={fechaFin ? fmtFecha(fechaFin) : null} onPress={() => setPicker('fechaFin')} />
          </View>
        )}

        {picker && (
          <>
            <DateTimePicker
              value={valores[picker] ?? new Date()}
              mode={picker.startsWith('hora') ? 'time' : 'date'}
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangePicker}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.listo} onPress={() => setPicker(null)}>
                <Text style={styles.listoTexto}>Listo</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
          <Text style={styles.botonTexto}>
            {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Agregar regla'}
          </Text>
        </TouchableOpacity>

        {editandoId && (
          <TouchableOpacity style={styles.cancelar} onPress={resetForm} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Cancelar edición</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function SelectorFecha({
  label, valor, onPress, style,
}: { label: string; valor: string | null; onPress: () => void; style?: object }) {
  return (
    <TouchableOpacity style={[styles.selector, style]} onPress={onPress}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <Text style={valor ? styles.selectorValor : styles.selectorPlaceholder}>
        {valor ?? 'Elegir'}
      </Text>
    </TouchableOpacity>
  )
}

function descripcionRegla(r: ReglaDisponibilidad): string {
  const estado = r.disponible ? 'Disponible' : 'No disponible'
  if (r.tipo === 'manual') return `${estado} · manual${r.motivo ? ` (${r.motivo})` : ''}`
  if (r.tipo === 'horario') return `${estado} · horario ${r.horaInicio?.slice(0, 5)}–${r.horaFin?.slice(0, 5)}`
  return `${estado} · temporada ${r.fechaInicio} → ${r.fechaFin}`
}

const styles = StyleSheet.create({
  seccion: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  vacio: { fontSize: 14, color: '#aaa', marginBottom: 16 },
  regla: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  reglaEditando: { borderWidth: 1, borderColor: '#1565c0' },
  reglaTexto: { fontSize: 14, color: '#1a1a1a' },
  reglaEditar: { fontSize: 11, color: '#1565c0', marginTop: 2 },
  borrar: { color: '#c62828', fontSize: 13, fontWeight: '600', marginLeft: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#444' },
  switchFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  tipos: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tipoBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  tipoBtnActivo: { backgroundColor: '#1a1a1a' },
  tipoTexto: { fontSize: 13, color: '#666', textTransform: 'capitalize' },
  tipoTextoActivo: { color: '#fff', fontWeight: '600' },
  input: {
    backgroundColor: '#fafafa', borderRadius: 8, padding: 12, fontSize: 15,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 12,
  },
  fila2: { flexDirection: 'row', gap: 8 },
  medio: { flex: 1 },
  selector: {
    backgroundColor: '#fafafa', borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 12,
  },
  selectorLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  selectorValor: { fontSize: 15, color: '#1a1a1a' },
  selectorPlaceholder: { fontSize: 15, color: '#aaa' },
  listo: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  listoTexto: { color: '#1565c0', fontSize: 15, fontWeight: '600' },
  boton: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelar: { padding: 12, alignItems: 'center', marginTop: 8 },
  cancelarTexto: { color: '#666', fontSize: 14, fontWeight: '600' },
})
