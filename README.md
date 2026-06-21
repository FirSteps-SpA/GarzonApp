# GarzonApp
**GarzonApp** es una app móvil complementaria para garzones de restaurante, construida en React Native + Expo.

El problema que resuelve es concreto: en períodos de alto tráfico, el sistema de PCs del restaurante se convierte en un cuello de botella. Los garzones hacen cola para registrar pedidos, cometen errores de número de mesa y no tienen forma rápida de consultar qué ítems están disponibles en el momento.

La app no reemplaza el sistema existente — los pedidos siguen ingresándose en el PC. Lo que hace es darle al garzón una herramienta en su propio dispositivo para: visualizar un mapa de mesas con estado en tiempo real, construir y consultar el resumen de un pedido mientras atiende la mesa, y navegar la carta completa con disponibilidad actualizada. Cuando llega al PC, transcribe lo que ya tiene listo en pantalla en lugar de hacerlo de memoria.

El stack es Supabase para auth y base de datos, Zustand para estado local con persistencia en AsyncStorage, y Expo Router para navegación. La Fase 1 funciona completamente offline por dispositivo; las fases siguientes agregan sincronización en tiempo real entre dispositivos vía Supabase Realtime.
