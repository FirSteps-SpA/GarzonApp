import { useEffect, useState } from 'react'
import NetInfo from '@react-native-community/netinfo'

// Devuelve true cuando hay conexión. `isInternetReachable` puede ser null al
// inicio: lo tratamos como online para no mostrar un falso "sin conexión".
export function useConexion(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false)
    })
    return unsub
  }, [])

  return online
}
