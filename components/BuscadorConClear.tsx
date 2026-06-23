import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native'

interface Props {
  value: string
  onChangeText: (texto: string) => void
  placeholder?: string
}

export function BuscadorConClear({ value, onChangeText, placeholder }: Props) {
  return (
    <View style={styles.fila}>
      <TextInput
        style={styles.input}
        placeholder={placeholder ?? 'Buscar...'}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity
          style={styles.limpiar}
          onPress={() => onChangeText('')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.limpiarTexto}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', margin: 12 },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12, paddingRight: 44,
    fontSize: 15, borderWidth: 1, borderColor: '#e0e0e0',
  },
  limpiar: {
    position: 'absolute', right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#bbb',
    justifyContent: 'center', alignItems: 'center',
  },
  limpiarTexto: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 15 },
})
