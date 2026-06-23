import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native'
import { useMesasStore } from '@/stores/useMesasStore'
import { ESTILOS_ESTADO } from '@/constants/estadosMesa'

interface Props {
  onSeleccionarMesa: (mesaId: string) => void
}

export function PanelMesasVirtuales({ onSeleccionarMesa }: Props) {
  const [abierto, setAbierto] = useState(false)
  const mesas = useMesasStore((s) => s.mesas)
  const getMesaById = useMesasStore((s) => s.getMesaById)
  const getEstadoMesa = useMesasStore((s) => s.getEstadoMesa)

  const virtuales = mesas.filter((m) => m.esVirtual && m.activa)

  if (virtuales.length === 0) return null

  const seleccionar = (mesaId: string) => {
    setAbierto(false)
    onSeleccionarMesa(mesaId)
  }

  return (
    <>
      {/* Botón fijo: no empuja el mapa */}
      <TouchableOpacity style={styles.boton} onPress={() => setAbierto(true)} activeOpacity={0.8}>
        <Text style={styles.botonTexto}>Mesas adicionales ({virtuales.length})</Text>
        <Text style={styles.chevron}>▲</Text>
      </TouchableOpacity>

      {/* Popup */}
      <Modal visible={abierto} animationType="slide" transparent onRequestClose={() => setAbierto(false)}>
        <TouchableOpacity style={styles.fondo} activeOpacity={1} onPress={() => setAbierto(false)}>
          <TouchableOpacity style={styles.caja} activeOpacity={1}>
            <View style={styles.cajaHeader}>
              <Text style={styles.cajaTitulo}>Mesas adicionales</Text>
              <TouchableOpacity onPress={() => setAbierto(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.cerrar}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={virtuales}
              keyExtractor={(m) => m.id}
              renderItem={({ item: mesa }) => {
                const estado = getEstadoMesa(mesa.id)?.estado ?? 'libre'
                const real = mesa.mesaRealId ? getMesaById(mesa.mesaRealId) : undefined
                return (
                  <TouchableOpacity style={styles.fila} onPress={() => seleccionar(mesa.id)} activeOpacity={0.7}>
                    <Text style={styles.numero}>[{mesa.numero}]</Text>
                    <View style={styles.filaInfo}>
                      <Text style={styles.filaTitulo}>Mesa temporal</Text>
                      {real && <Text style={styles.filaSub}>corresponde a mesa {real.numero}</Text>}
                    </View>
                    <View style={[styles.badge, { backgroundColor: ESTILOS_ESTADO[estado].color }]}>
                      <Text style={[styles.badgeTexto, { color: ESTILOS_ESTADO[estado].texto }]}>
                        {ESTILOS_ESTADO[estado].label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  botonTexto: { fontSize: 15, fontWeight: '600', color: '#444' },
  chevron: { fontSize: 12, color: '#888' },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  caja: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  cajaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cajaTitulo: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  cerrar: { fontSize: 16, color: '#999', fontWeight: '700' },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  numero: { fontSize: 16, fontWeight: '700', color: '#666', width: 48 },
  filaInfo: { flex: 1 },
  filaTitulo: { fontSize: 14, color: '#1a1a1a' },
  filaSub: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
})
