import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useUsuariosStore } from '@/stores/useUsuariosStore'
import { garzonSchema } from '@/lib/validaciones'

export default function NuevoUsuarioScreen() {
  const router = useRouter()
  const crearGarzon = useUsuariosStore((s) => s.crearGarzon)

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [codigoGarzon, setCodigoGarzon] = useState('')
  const [password, setPassword] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    const parsed = garzonSchema.safeParse({ nombre, email, codigoGarzon, password })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const i of parsed.error.issues) errs[i.path[0] as string] = i.message
      setErrores(errs)
      return
    }
    setErrores({})
    setGuardando(true)
    try {
      await crearGarzon(parsed.data)
      Alert.alert('Listo', 'Garzón creado correctamente.')
      router.back()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear el garzón')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Campo label="Nombre" error={errores.nombre}>
        <TextInput style={styles.input} value={nombre} onChangeText={setNombre} placeholder="Nombre del garzón" />
      </Campo>
      <Campo label="Email" error={errores.email}>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="garzon@ejemplo.com" autoCapitalize="none" keyboardType="email-address" />
      </Campo>
      <Campo label="Código (2 dígitos)" error={errores.codigoGarzon}>
        <TextInput style={styles.input} value={codigoGarzon} onChangeText={setCodigoGarzon} placeholder="07" keyboardType="numeric" maxLength={2} />
      </Campo>
      <Campo label="Contraseña inicial" error={errores.password}>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" secureTextEntry />
      </Campo>

      <Text style={styles.nota}>
        La contraseña es temporal: compartila con el garzón para su primer ingreso.
      </Text>

      <TouchableOpacity style={styles.boton} onPress={guardar} disabled={guardando}>
        {guardando ? <ActivityIndicator color="#fff" /> : <Text style={styles.botonTexto}>Crear garzón</Text>}
      </TouchableOpacity>
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
  errorTexto: { color: '#c62828', fontSize: 12, marginTop: 4 },
  nota: { fontSize: 12, color: '#888', marginBottom: 20 },
  boton: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 16, alignItems: 'center' },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
