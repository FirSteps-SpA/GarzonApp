# GarzonApp — Documento de Arquitectura y Planificación

> Versión 1.1 · Junio 2026
> Stack: React Native · Expo · TypeScript · Supabase · Zustand · NativeWind · Expo Router

---

## Índice

1. [Modelo de datos completo (Supabase / PostgreSQL)](#1-modelo-de-datos-completo)
2. [Modelo de estado local (Zustand)](#2-modelo-de-estado-local-zustand)
3. [Sistema de autenticación y roles](#3-sistema-de-autenticación-y-roles)
4. [Arquitectura de navegación (Expo Router)](#4-arquitectura-de-navegación)
5. [Diseño del mapa de mesas](#5-diseño-del-mapa-de-mesas)
6. [Diseño de la carta de ítems](#6-diseño-de-la-carta-de-ítems)
7. [Flujos de usuario principales](#7-flujos-de-usuario-principales)
8. [Estrategia de datos: estático vs dinámico vs Supabase](#8-estrategia-de-datos)
9. [Estrategia de sincronización futura](#9-estrategia-de-sincronización-futura)
10. [Fases de implementación](#10-fases-de-implementación)

---

## 1. Modelo de Datos Completo

### Principios de diseño

El esquema está diseñado con tres restricciones simultáneas: (a) soportar Fase 1 sin sobreingeniería, (b) no requerir refactoring disruptivo al activar Realtime, y (c) modelar los permisos con RLS desde el inicio para no lamentar omisiones en producción.

Todas las tablas usan `uuid` como PK primaria por defecto (`gen_random_uuid()`), excepto donde se indica. Los timestamps usan `timestamptz` para evitar ambigüedades de zona horaria.

---

### Tabla: `usuarios`

**Propósito:** Extiende `auth.users` de Supabase con metadatos de negocio (rol, nombre, código de garzón). Es el centro del sistema de permisos.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users.id` ON DELETE CASCADE | Mismo ID que Supabase Auth |
| `nombre` | `text` | NOT NULL | Nombre para mostrar en la app |
| `rol` | `text` | NOT NULL, CHECK IN ('dev','admin','garzon') | Rol de negocio |
| `codigo_garzon` | `char(2)` | UNIQUE, NULLABLE | Solo garzones; código de 2 dígitos para el PC |
| `activo` | `boolean` | NOT NULL DEFAULT true | Baja lógica sin eliminar |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | Actualizar con trigger |

**Índices:**
- `idx_usuarios_rol` en `(rol)` — filtrar por rol frecuentemente en RLS
- `idx_usuarios_codigo_garzon` en `(codigo_garzon)` WHERE `codigo_garzon IS NOT NULL`

**RLS:**

| Operación | Quién | Condición |
|---|---|---|
| SELECT | Todos autenticados | Solo su propio registro; admin/dev ven todos |
| INSERT | Solo Supabase (trigger/función) | Se crea automáticamente al registrar usuario en Auth |
| UPDATE | Admin, Dev | Cualquier usuario; garzón solo su `nombre` |
| DELETE | Dev | — |

**Relaciones:** Referenciada por `pedidos.garzon_id`.

---

### Tabla: `zonas`

**Propósito:** Define las zonas físicas del restaurante (interior, exterior). Dato estático pero modelado en DB para facilitar extensión futura (nueva terraza, salón privado).

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `nombre` | `text` | NOT NULL UNIQUE | ej: 'exterior', 'interior' |
| `descripcion` | `text` | NULLABLE | |
| `orden` | `smallint` | NOT NULL DEFAULT 0 | Orden de visualización |

**RLS:**

| Operación | Quién |
|---|---|
| SELECT | Todos autenticados |
| INSERT / UPDATE / DELETE | Solo dev |

---

### Tabla: `mesas`

**Propósito:** Representa cada mesa física del restaurante. Separa los datos de posición (estáticos) del estado operacional (dinámico), lo cual es clave para el Realtime futuro.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `numero` | `smallint` | NOT NULL UNIQUE | Número visible en la mesa física |
| `zona_id` | `uuid` | NOT NULL FK → `zonas.id` | Interior (40–67) o exterior (1–37) |
| `es_virtual` | `boolean` | NOT NULL DEFAULT false | True para mesas 68+ (parche del sistema actual) |
| `mesa_real_id` | `uuid` | NULLABLE FK → `mesas.id` | Solo para mesas virtuales: indica a qué mesa física real corresponde |
| `pos_x` | `numeric(5,2)` | NOT NULL DEFAULT 0 | Coordenada X en el mapa (porcentaje o unidad abstracta) |
| `pos_y` | `numeric(5,2)` | NOT NULL DEFAULT 0 | Coordenada Y en el mapa |
| `activa` | `boolean` | NOT NULL DEFAULT true | Baja lógica |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |

**Índices:**
- `idx_mesas_zona_id` en `(zona_id)`
- `idx_mesas_numero` en `(numero)` — ya único, pero explícito para claridad
- `idx_mesas_es_virtual` en `(es_virtual)` WHERE `es_virtual = true` — pocas filas, útil para filtrar rápido

**RLS:**

| Operación | Quién |
|---|---|
| SELECT | Todos autenticados |
| INSERT / UPDATE | Admin, Dev |
| DELETE | Dev |

**Constraint de integridad:** `mesa_real_id` solo debe estar presente cuando `es_virtual = true`. Se valida a nivel de aplicación; un CHECK constraint en DB sería `CHECK (es_virtual = true OR mesa_real_id IS NULL)`.

**Relaciones:** Referenciada por `pedidos.mesa_id`, `estados_mesa.mesa_id`. Autoreferencia en `mesa_real_id`.

---

### Tabla: `estados_mesa`

**Propósito:** Registro del estado operacional actual de cada mesa. Separado de `mesas` para facilitar Realtime (solo esta tabla emite eventos de cambio) y para no mezclar datos estáticos con datos dinámicos.

Decisión de diseño: una fila por mesa, upsert en cada cambio de estado. Alternativa descartada (log de eventos) aplaza complejidad para Fase 7.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `mesa_id` | `uuid` | PK, FK → `mesas.id` ON DELETE CASCADE | Una fila por mesa |
| `estado` | `text` | NOT NULL DEFAULT 'libre', CHECK IN ('libre','ocupada','esperando_cierre','reservada') | |
| `garzon_id` | `uuid` | NULLABLE FK → `usuarios.id` | Garzón asignado actualmente |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | Actualizado en cada cambio |
| `updated_by` | `uuid` | NULLABLE FK → `usuarios.id` | Para auditoría y resolución de conflictos |

**Estados posibles:**
- `libre` — sin ocupantes, disponible
- `ocupada` — con clientes y pedido activo
- `esperando_cierre` — cuenta pedida, esperando cierre en el sistema del PC
- `reservada` — reserva futura (fase posterior)

**Índices:**
- `idx_estados_mesa_estado` en `(estado)` — filtrar mesas libres/ocupadas frecuentemente
- `idx_estados_mesa_garzon_id` en `(garzon_id)` WHERE `garzon_id IS NOT NULL`

**RLS:**

| Operación | Quién | Condición |
|---|---|---|
| SELECT | Todos autenticados | — |
| UPDATE | Garzón | Solo si `garzon_id = auth.uid()` o `garzon_id IS NULL` |
| UPDATE | Admin, Dev | Sin restricción |
| INSERT | Sistema (trigger) | Generado automáticamente al crear una mesa |

**Realtime:** Esta tabla es la principal candidata para suscripciones Realtime en Fase 7. El esquema ya está listo.

---

### Tabla: `categorias_carta`

**Propósito:** Jerarquía de categorías de la carta. Estructura de árbol autorreferencial sin límite de profundidad en el esquema. La profundidad recomendada es 3–4 niveles por razones de UX, no por restricción de datos.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `nombre` | `text` | NOT NULL | ej: 'Bebidas', 'Calientes', 'Infusiones' |
| `parent_id` | `uuid` | NULLABLE FK → `categorias_carta.id` | NULL = categoría raíz |
| `orden` | `smallint` | NOT NULL DEFAULT 0 | Orden dentro del mismo nivel |
| `activa` | `boolean` | NOT NULL DEFAULT true | |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |

**Sin constraint de profundidad en DB:** La profundidad no se limita a nivel de esquema. El árbol se recorre con CTE recursiva. Si en el futuro se desea imponer un límite, se puede agregar un trigger que verifique la profundidad antes de INSERT.

**Índices:**
- `idx_categorias_parent_id` en `(parent_id)` — frecuente en queries de navegación

**RLS:**

| Operación | Quién |
|---|---|
| SELECT | Todos autenticados |
| INSERT / UPDATE / DELETE | Admin, Dev |

---

### Tabla: `items_carta`

**Propósito:** Ítems individuales del menú con toda su información operacional y de display.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `nombre` | `text` | NOT NULL | |
| `descripcion` | `text` | NULLABLE | |
| `categoria_id` | `uuid` | NOT NULL FK → `categorias_carta.id` | Siempre referencia a la hoja (subcategoría o categoría si es única) |
| `precio` | `numeric(10,2)` | NOT NULL CHECK (precio >= 0) | En la moneda local |
| `foto_url` | `text` | NULLABLE | URL de Supabase Storage |
| `disponible` | `boolean` | NOT NULL DEFAULT true | Disponibilidad base del ítem |
| `orden` | `smallint` | NOT NULL DEFAULT 0 | Orden dentro de la categoría |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | |

**Índices:**
- `idx_items_categoria_id` en `(categoria_id)` — query más frecuente
- `idx_items_disponible` en `(disponible)` WHERE `disponible = false` — filtrar no disponibles

**RLS:**

| Operación | Quién |
|---|---|
| SELECT | Todos autenticados |
| INSERT / UPDATE / DELETE | Admin, Dev |

---

### Tabla: `disponibilidad_items`

**Propósito:** Sobreescribe la disponibilidad base de un ítem para rangos horarios o temporadas. Permite modelar "el jugo de frutilla no está disponible en invierno" o "los postres solo disponibles después de las 13h" sin tocar el ítem base.

Decisión de diseño: tabla separada en lugar de columnas en `items_carta`, porque las reglas de disponibilidad tienen su propia complejidad y ciclo de vida.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `item_id` | `uuid` | NOT NULL FK → `items_carta.id` ON DELETE CASCADE | |
| `disponible` | `boolean` | NOT NULL | El estado durante este período |
| `tipo` | `text` | NOT NULL CHECK IN ('horario','temporada','manual') | Tipo de regla |
| `hora_inicio` | `time` | NULLABLE | Para tipo 'horario' |
| `hora_fin` | `time` | NULLABLE | Para tipo 'horario' |
| `fecha_inicio` | `date` | NULLABLE | Para tipo 'temporada' |
| `fecha_fin` | `date` | NULLABLE | Para tipo 'temporada' |
| `motivo` | `text` | NULLABLE | Para tipo 'manual'; ej: 'Agotado hoy' |
| `activa` | `boolean` | NOT NULL DEFAULT true | Permite desactivar sin borrar |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `created_by` | `uuid` | NOT NULL FK → `usuarios.id` | Auditoría |

**Índices:**
- `idx_disponibilidad_item_id` en `(item_id)` — join frecuente
- `idx_disponibilidad_activa_tipo` en `(activa, tipo)` WHERE `activa = true`

**RLS:**

| Operación | Quién |
|---|---|
| SELECT | Todos autenticados |
| INSERT / UPDATE / DELETE | Admin, Dev |

---

### Tabla: `pedidos`

**Propósito:** Agrupa un conjunto de ítems pedidos para una mesa en un momento dado. Representa una "sesión" de servicio de una mesa.

Decisión de diseño: `estado` del pedido vive aquí, separado del estado de la mesa. Una mesa puede estar `ocupada` con un pedido `borrador` (aún no enviado al PC) o con un pedido `enviado`.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `mesa_id` | `uuid` | NOT NULL FK → `mesas.id` | |
| `garzon_id` | `uuid` | NOT NULL FK → `usuarios.id` | Garzón que tomó el pedido |
| `estado` | `text` | NOT NULL DEFAULT 'borrador', CHECK IN ('borrador','enviado','cerrado','cancelado') | |
| `notas_generales` | `text` | NULLABLE | Notas de la mesa, no de ítems |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() | |
| `cerrado_at` | `timestamptz` | NULLABLE | Timestamp de cierre |

**Estados del pedido:**
- `borrador` — construyéndose en la app, aún no enviado al PC
- `enviado` — ya registrado en el PC del restaurante
- `cerrado` — mesa cerrada oficialmente en el sistema
- `cancelado` — pedido descartado

**Índices:**
- `idx_pedidos_mesa_id` en `(mesa_id)` — query más frecuente
- `idx_pedidos_garzon_id` en `(garzon_id)` — ver pedidos de un garzón
- `idx_pedidos_estado` en `(estado)` WHERE `estado IN ('borrador','enviado')` — solo activos

**RLS:**

| Operación | Quién | Condición |
|---|---|---|
| SELECT | Garzón | Solo sus propios pedidos (`garzon_id = auth.uid()`) |
| SELECT | Admin, Dev | Todos |
| INSERT | Garzón, Admin, Dev | — |
| UPDATE | Garzón | Solo sus pedidos en estado `borrador`; puede actualizar `mesa_id` para transferencias |
| UPDATE | Admin, Dev | Sin restricción |
| DELETE | Dev | — |

**Relaciones:** Referencia a `mesas` y `usuarios`. Referenciada por `pedido_items`.

---

### Tabla: `pedido_items`

**Propósito:** Líneas individuales de un pedido. Una fila por ítem–cantidad dentro de un pedido.

| Columna | Tipo | Constraints | Notas |
|---|---|---|---|
| `id` | `uuid` | PK DEFAULT gen_random_uuid() | |
| `pedido_id` | `uuid` | NOT NULL FK → `pedidos.id` ON DELETE CASCADE | |
| `item_id` | `uuid` | NOT NULL FK → `items_carta.id` | |
| `cantidad` | `smallint` | NOT NULL DEFAULT 1 CHECK (cantidad > 0) | |
| `precio_unitario` | `numeric(10,2)` | NOT NULL | Precio al momento de tomar el pedido (inmutable) |
| `notas` | `text` | NULLABLE | ej: 'sin hielo', 'término medio' |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | |

**Decisión de diseño:** `precio_unitario` se copia del ítem al momento de insertar y nunca se actualiza. Esto garantiza que el historial no se corrompa si el precio del ítem cambia.

**Índices:**
- `idx_pedido_items_pedido_id` en `(pedido_id)` — join crítico en cualquier vista de resumen

**RLS:** Hereda las restricciones del `pedido_id` correspondiente. Garzón puede INSERT/UPDATE solo en pedidos propios en borrador; Admin/Dev sin restricción.

---

### Diagrama de relaciones simplificado

```
auth.users ──────────────── usuarios (1:1)
                                │
                    ┌───────────┴───────────┐
                    │                       │
                  pedidos              estados_mesa
                    │  \                    │
              pedido_items  \            mesas
                    │        \              │
               items_carta    mesas      zonas
                    │
           categorias_carta (autorreferencial)
                    
items_carta ←── disponibilidad_items
```

---

### Funciones y triggers necesarios

**`handle_new_user()`** — trigger `AFTER INSERT ON auth.users`: crea fila en `usuarios` con rol `garzon` por defecto.

**`handle_updated_at()`** — trigger genérico `BEFORE UPDATE` en tablas con `updated_at`: actualiza el timestamp automáticamente.

**`init_estado_mesa()`** — trigger `AFTER INSERT ON mesas`: crea fila inicial en `estados_mesa` con estado `libre`.

---

## 2. Modelo de Estado Local (Zustand)

### Principios

En Fase 1, Zustand es la única fuente de verdad operacional. El diseño de los stores anticipa el momento en que Supabase tome ese rol: las acciones están nombradas como si fueran agnósticas a la fuente de datos, y la shape del estado es isomórfica con el esquema de DB.

---

### Store: `useCartaStore`

**Responsabilidad:** Mantiene la carta de ítems (categorías e ítems) disponibles. En Fase 1 se inicializa desde datos estáticos; en Fase 5 se hidrata desde Supabase.

```typescript
// Shape del estado
interface CartaState {
  categorias: Categoria[];          // Árbol completo (raíces con hijos anidados)
  items: Record<string, Item[]>;    // Clave: categoria_id → lista de ítems
  cargando: boolean;
  error: string | null;
  ultimaActualizacion: number | null; // timestamp epoch para caché
}

// Acciones
interface CartaActions {
  cargarCarta: () => Promise<void>;         // Fase 1: desde estáticos; Fase 5: desde Supabase
  getCategoriaById: (id: string) => Categoria | undefined;
  getItemsByCategoria: (categoriaId: string) => Item[];
  getItemById: (id: string) => Item | undefined;
  isItemDisponible: (itemId: string) => boolean; // Considera disponibilidad_items
}
```

**Persistencia:** `categorias` e `items` persisten en AsyncStorage (clave `carta_cache`). Se invalida si `ultimaActualizacion` tiene más de 24 horas.

**Evolución a Supabase:** `cargarCarta()` cambia su implementación para llamar a Supabase. El resto del código que consume el store no cambia. En Fase 7 se agrega una suscripción Realtime que llama `cargarCarta()` al recibir cambios en `items_carta`.

---

### Store: `usePedidosStore`

**Responsabilidad:** Es el store más crítico de la app. Mantiene todos los pedidos activos en curso, uno por mesa. Es la fuente de verdad operacional del garzón durante su turno.

```typescript
// Shape del estado
interface PedidosState {
  pedidosPorMesa: Record<string, PedidoLocal>; // Clave: mesa_id
}

interface PedidoLocal {
  mesaId: string;
  mesaNumero: number;
  items: LineaPedido[];
  notas: string;
  estado: 'borrador' | 'enviado';
  creadoAt: number;    // epoch ms
  modificadoAt: number;
  pedidoSupabaseId?: string; // Disponible tras sync con Supabase
}

interface LineaPedido {
  itemId: string;
  nombre: string;       // Desnormalizado para display offline
  precio: number;       // Desnormalizado, precio al momento de agregar
  cantidad: number;
  notas: string;
  agregadoAt: number;
}

// Acciones
interface PedidosActions {
  // CRUD del pedido
  iniciarPedido: (mesaId: string, mesaNumero: number) => void;
  cerrarPedido: (mesaId: string) => void;
  
  // CRUD de ítems en el pedido
  agregarItem: (mesaId: string, item: Item, notas?: string) => void;
  quitarItem: (mesaId: string, itemId: string) => void;
  actualizarCantidad: (mesaId: string, itemId: string, cantidad: number) => void;
  actualizarNotasItem: (mesaId: string, itemId: string, notas: string) => void;
  actualizarNotasMesa: (mesaId: string, notas: string) => void;
  
  // Estado del pedido
  marcarComoEnviado: (mesaId: string) => void;
  
  // Transferencia de mesa
  transferirMesa: (mesaOrigenId: string, mesaDestinoId: string) => void;
  // Mueve el pedido de mesaOrigen a mesaDest, actualiza estadosMesa de ambas
  // (mesaOrigen → libre, mesaDest → ocupada)
  
  // Queries
  getPedidoByMesa: (mesaId: string) => PedidoLocal | undefined;
  getTotalPedido: (mesaId: string) => number;
  getCantidadItems: (mesaId: string) => number;
  getMesasConPedidoActivo: () => string[];
}
```

**Persistencia:** `pedidosPorMesa` persiste completamente en AsyncStorage (clave `pedidos_activos`). Esto es crítico: si el garzón cierra la app accidentalmente, el pedido debe recuperarse.

**Evolución a Supabase:** En Fase 5, `iniciarPedido` también crea un registro en `pedidos` y obtiene el `pedidoSupabaseId`. Las acciones de agregar/quitar ítem hacen upsert en `pedido_items`. El estado local sigue siendo fuente de verdad para la UI (optimistic updates); Supabase es la persistencia remota.

---

### Store: `useMesasStore`

**Responsabilidad:** Mantiene el estado de las mesas (qué mesas están libres, ocupadas, etc.) y los metadatos necesarios para renderizar el mapa. En Fase 1, el estado se mantiene localmente. En Fase 7, se suscribe a Realtime.

```typescript
interface MesasState {
  mesas: Mesa[];
  estadosMesa: Record<string, EstadoMesa>; // Clave: mesa_id
  zonas: Zona[];
  mesaSeleccionada: string | null;
  cargando: boolean;
  error: string | null;
}

interface Mesa {
  id: string;
  numero: number;
  zonaId: string;
  esVirtual: boolean;
  posX: number;
  posY: number;
  activa: boolean;
}

interface EstadoMesa {
  mesaId: string;
  estado: 'libre' | 'ocupada' | 'esperando_cierre' | 'reservada';
  garzonId: string | null;
}

// Acciones
interface MesasActions {
  cargarMesas: () => Promise<void>;           // Fase 1: estáticos; Fase 5: Supabase
  seleccionarMesa: (mesaId: string | null) => void;
  actualizarEstadoMesa: (mesaId: string, estado: EstadoMesa['estado']) => void;
  getMesaById: (id: string) => Mesa | undefined;
  getMesaByNumero: (numero: number) => Mesa | undefined;
  getMesasPorZona: (zonaId: string) => Mesa[];
  getEstadoMesa: (mesaId: string) => EstadoMesa | undefined;
  
  // Realtime (Fase 7)
  suscribirRealtime: () => () => void;  // Retorna función de cleanup
}
```

**Persistencia:** `mesas` y `zonas` persisten en AsyncStorage (son datos casi estáticos). `estadosMesa` NO persiste — se regenera en cada sesión desde Supabase o desde estado libre por defecto.

**Evolución a Supabase:** `actualizarEstadoMesa` hará upsert en `estados_mesa`. `suscribirRealtime` activa el canal Supabase. La UI no cambia.

---

### Store: `useAuthStore`

**Responsabilidad:** Sesión del usuario actual, rol, y estado de autenticación. Es el único store que interactúa con Supabase Auth desde Fase 1.

```typescript
interface AuthState {
  session: Session | null;      // Supabase Session
  usuario: Usuario | null;      // Fila de nuestra tabla usuarios
  cargando: boolean;
  inicializado: boolean;        // true tras primera verificación de sesión
}

interface Usuario {
  id: string;
  nombre: string;
  rol: 'dev' | 'admin' | 'garzon';
  codigoGarzon: string | null;
}

interface AuthActions {
  inicializar: () => Promise<void>;    // Verifica sesión existente al arrancar
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: () => boolean;
  isGarzon: () => boolean;
  isDev: () => boolean;
}
```

**Persistencia:** La sesión de Supabase persiste automáticamente en AsyncStorage via el cliente de Supabase (usando `AsyncStorage` como storage adapter). `usuario` se reconstruye desde Supabase al arrancar.

**Evolución a Supabase:** Ya usa Supabase desde Fase 1. No requiere cambios de interfaz en fases futuras.

---

### Relación entre stores

```
useAuthStore
    │
    ├── Provee garzon_id a usePedidosStore (al crear pedidos)
    ├── Provee permisos a useMesasStore (qué operaciones están permitidas)
    └── Provee rol a la UI (qué tabs/acciones mostrar)

useMesasStore
    │
    └── Coordina con usePedidosStore: cuando se selecciona una mesa,
        la UI accede a getPedidoByMesa(mesaId)

useCartaStore
    │
    └── Provee ítems a usePedidosStore.agregarItem()
```

Los stores **no se referencian directamente entre sí**. La coordinación ocurre en los componentes y hooks de features, no a nivel de store. Esto mantiene los stores desacoplados y testables.

---

## 3. Sistema de Autenticación y Roles

### Flujo de autenticación

**Login con email + password** (Supabase Auth). No se usan magic links ni OAuth en Fase 1: el entorno de restaurante requiere acceso rápido y no depende de que el garzón tenga acceso a su email en el momento.

**Secuencia de arranque de la app:**

```
App inicia
  └── useAuthStore.inicializar()
        ├── Consulta sesión existente en AsyncStorage (Supabase SDK)
        │     ├── Sesión válida → carga fila de usuarios → redirige a (app)
        │     └── Sin sesión → redirige a (auth)/login
        └── Suscribe a onAuthStateChange para manejar expiración de tokens
```

**Post-login:**
```
login(email, password)
  └── supabase.auth.signInWithPassword()
        ├── Éxito → carga fila de usuarios por auth.uid()
        │     ├── rol = 'garzon' → redirige a /(app)/mesas
        │     └── rol = 'admin' | 'dev' → redirige a /(app)/admin
        └── Error → muestra mensaje en pantalla de login
```

---

### Auth guard en Expo Router

El guard vive en `app/_layout.tsx` (root layout). Usa el estado de `useAuthStore` para decidir si mostrar las rutas protegidas o redirigir al login.

```
app/_layout.tsx
  └── Lógica:
        if (!inicializado) → SplashScreen (evita flash de contenido)
        if (!session)      → Redirect a /(auth)/login
        if (session)       → Renderiza hijos (el (app) group)
```

Adicionalmente, `app/(app)/_layout.tsx` verifica el rol para rutas admin:
```
if (rol === 'garzon' && ruta.startsWith('/admin')) → Redirect a /mesas
```

**Por qué en el layout y no en cada pantalla:** Centralizar el guard evita que una pantalla olvidada quede sin protección. El layout es el único punto de verdad para acceso.

---

### Propagación de permisos

**A nivel de UI:**
- `useAuthStore.isAdmin()` / `isGarzon()` condicionan qué tabs aparecen
- El tab Admin solo aparece si `rol !== 'garzon'`
- Botones de edición en la carta solo visibles para admin/dev

**A nivel de datos (RLS):**
- Supabase evalúa `auth.uid()` y el rol desde JWT en cada query
- El rol se propaga al JWT usando una función `get_rol()` que lee la tabla `usuarios`
- Esto garantiza que incluso si la UI fallara en ocultar una acción, la DB la rechazaría

**Configuración del JWT custom claim:**
```sql
-- Función que retorna el rol del usuario para el JWT
CREATE FUNCTION public.get_user_rol()
RETURNS text AS $$
  SELECT rol FROM public.usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Los roles se incluyen en el JWT via Supabase Auth Hooks (disponible en Supabase v2).

---

### Diferencias de experiencia por rol

| Aspecto | Garzón | Admin | Dev |
|---|---|---|---|
| Tab principal | Mesas | Mesas + Admin | Mesas + Admin + Debug |
| Mapa de mesas | Solo lectura + selección + transferir mesa | Igual + puede asignar | Igual + puede editar posiciones |
| Carta | Solo lectura + agregar a pedido | Puede editar ítems, precios, disponibilidad | Igual + puede gestionar categorías |
| Pedidos | Solo los propios | Todos los pedidos | Todos + herramientas de debug |
| Usuarios | Solo su perfil | Puede crear/desactivar garzones | Acceso total |

---

### Consideraciones de seguridad

**Tokens:** Supabase maneja refresh automático. El token de acceso expira en 1 hora; el refresh en 7 días. El SDK renueva transparentemente.

**Logout en cierre de turno:** El flujo de fin de turno del garzón incluye explícitamente `logout()`. Los pedidos en borrador se limpian del AsyncStorage en el logout para que el siguiente turno comience limpio.

**Sin compartir cuentas:** Cada garzón tiene su propia cuenta. El `codigo_garzon` (2 dígitos) es un identificador de negocio para el PC del restaurante, no para la app.

**RLS como defensa en profundidad:** La UI protege las rutas, pero las políticas RLS en Supabase son la barrera definitiva. Nunca confiar solo en la UI.

**Exposición de claves:** `SUPABASE_URL` y `SUPABASE_ANON_KEY` son seguras en el cliente (la anon key no da acceso sin RLS). La `service_role` key nunca va en el cliente.

---

## 4. Arquitectura de Navegación

### Árbol completo de rutas

```
app/
├── _layout.tsx                     ← Root layout (auth guard, proveedores globales)
│
├── (auth)/
│   ├── _layout.tsx                 ← Stack navigator para auth
│   └── login.tsx                   ← Pantalla de login
│
└── (app)/
    ├── _layout.tsx                 ← Tab navigator principal + guard de rol
    │
    ├── mesas/
    │   ├── _layout.tsx             ← Stack navigator para el flujo de mesas
    │   ├── index.tsx               ← Mapa de mesas (vista principal del garzón)
    │   └── [mesaId]/
    │       ├── _layout.tsx         ← Layout del contexto de mesa (tabs o stack)
    │       ├── index.tsx           ← Resumen del pedido de la mesa
    │       └── carta/
    │           ├── index.tsx       ← Categorías de la carta
    │           ├── [categoriaId]/
    │           │   └── index.tsx   ← Subcategorías o ítems de la categoría
    │           └── item/
    │               └── [itemId].tsx ← Detalle de ítem (modal o slide-in)
    │
    ├── carta/
    │   ├── _layout.tsx             ← Stack navigator
    │   └── index.tsx               ← Vista de carta standalone (para consulta)
    │
    ├── perfil.tsx                  ← Perfil del garzón (tab)
    │
    └── (admin)/
        ├── _layout.tsx             ← Guard: solo admin/dev
        ├── index.tsx               ← Dashboard admin
        ├── carta/
        │   ├── index.tsx           ← Listado de ítems con edición
        │   ├── nuevo-item.tsx      ← Formulario de nuevo ítem
        │   └── [itemId].tsx        ← Edición de ítem
        ├── disponibilidad.tsx      ← Gestión de disponibilidad
        └── usuarios/
            ├── index.tsx           ← Listado de garzones
            ├── nuevo-usuario.tsx   ← Crear garzón
            └── [usuarioId].tsx     ← Editar garzón
```

---

### Rutas públicas vs protegidas

| Ruta | Acceso |
|---|---|
| `/(auth)/login` | Pública (solo no autenticados) |
| `/(app)/mesas` y sub-rutas | Todos los roles autenticados |
| `/(app)/carta` | Todos los roles autenticados |
| `/(app)/perfil` | Todos los roles autenticados |
| `/(app)/(admin)/*` | Solo admin y dev |

---

### Navegación por tabs vs stack vs modal

**Tabs (nivel raíz de la app autenticada):**
- Mesas (icono mapa)
- Carta (icono libro — para consulta rápida sin seleccionar mesa)
- Perfil

Para admin se agrega:
- Admin (icono configuración)

**Stack (dentro de cada tab):**
- `mesas/` → `mesas/[mesaId]` → `mesas/[mesaId]/carta` → `mesas/[mesaId]/carta/[categoriaId]`
- La navegación es jerárquica con back navigation natural

**Modal:**
- `mesas/[mesaId]/carta/item/[itemId]` — slide-up modal con detalle del ítem, foto, precio, campo de notas, y botón de agregar. No requiere una pantalla completa; el contexto de la carta sigue visible detrás.
- Formularios de admin (nuevo-item, nuevo-usuario) — también modales

**Decisión de diseño:** El detalle de ítem es modal porque el garzón frecuentemente lo abre solo para verificar el precio o la foto, sin intención de agregar. Volver es más natural desde un modal que desde un stack.

---

### Navegación: mapa → detalle de pedido → carta

```
Mapa de mesas (mesas/index)
  └── tap en mesa ocupada o libre
        └── Navega a mesas/[mesaId]/index
              ├── Si no hay pedido: botón "Iniciar pedido" + carta vacía
              └── Si hay pedido activo: lista de ítems + totales
                    └── Botón "Agregar ítems"
                          └── Navega a mesas/[mesaId]/carta/index
                                └── tap en categoría
                                      └── mesas/[mesaId]/carta/[categoriaId]
                                            └── tap en ítem
                                                  └── modal item/[itemId]
                                                        └── "Agregar" → actualiza store
                                                              └── Cierra modal (back)
                                                                    └── Sigue agregando
                                                                          ó
                                                                    └── Back hasta resumen
```

**Preservación de contexto:** El `mesaId` está siempre en la URL, por lo que cualquier pantalla del stack sabe a qué mesa pertenece sin prop drilling.

---

### Navegación por la carta (categorías > subcategorías > ítems)

```
carta/index
  └── Lista de categorías raíz
        └── tap en nodo CON hijos (categorías)
              └── carta/[categoriaId] → lista de subcategorías hijas
                    └── tap en nodo CON hijos (más profundo)
                          └── carta/[categoriaId] → lista de sub-subcategorías
                                └── ... (repite hasta nodo hoja)
                                      └── tap en nodo hoja (sin hijos de categoría)
                                            └── carta/[categoriaId] → lista de ítems
                                                  └── tap en ítem → modal item/[itemId]

        └── tap en nodo hoja directa (categoría raíz sin subcategorías)
              └── carta/[categoriaId] → lista directa de ítems
                    └── tap en ítem → modal item/[itemId]
```

La ruta `carta/[categoriaId]` es el mismo componente en todos los niveles. Detecta en tiempo de render si los hijos de la categoría actual son categorías (renderiza `ListaCategorias`) o ítems (renderiza `ListaItems`). El breadcrumb se actualiza en cada nivel automáticamente.

**Breadcrumb en el header:** El stack de Expo Router proporciona el botón back nativo. Se complementa con un breadcrumb visual persistente en el header: "Bebidas > Calientes > Infusiones". Con 3–4 niveles este componente es esencial para la orientación del garzón.

El breadcrumb se construye recorriendo los ancestros de la categoría actual desde el store (`getCategoriaById` recursivo hasta `parent_id === null`). En pantallas profundas donde el texto no cabe, se trunca por la izquierda mostrando los segmentos más cercanos: "… > Infusiones > [ítem]".

---

### Flujo completo del garzón en un turno típico

```
1. Abre la app → pantalla de login (si no hay sesión)
2. Ingresa email + password → mapa de mesas
3. Identifica mesa recién ocupada (estado visual: libre = verde)
4. Tap en mesa → detalle de mesa (pedido vacío)
5. Tap "Agregar ítems" → carta (categorías)
6. Navega categorías, agrega 3 ítems
7. Back al resumen → verifica total
8. Va al PC del restaurante, ingresa pedido en sistema
9. Back a la app → marca pedido como "enviado"
10. Repite con otras mesas durante el turno
11. Cliente pide la cuenta: consulta resumen en la app → va al PC → genera pre-cuenta
12. Fin de turno → Perfil → Cerrar sesión → limpia pedidos activos
```

---

## 5. Diseño del Mapa de Mesas

### Sistema de coordenadas

Las posiciones de las mesas se representan con **coordenadas porcentuales (0–100)** en los ejes X e Y, relativas al contenedor del mapa. Esto hace el layout independiente del tamaño de pantalla y fácil de serializar.

```typescript
interface PosicionMesa {
  posX: number;  // 0.0 a 100.0, porcentaje del ancho del contenedor
  posY: number;  // 0.0 a 100.0, porcentaje del alto del contenedor
}
```

El mapa se renderiza con un `View` de dimensiones conocidas (`onLayout`) y cada mesa se posiciona con `position: 'absolute'`, `left: (posX/100) * width`, `top: (posY/100) * height`.

**Por qué porcentajes y no grid:** Un grid implica que todas las mesas tienen el mismo tamaño de celda, lo que no refleja la realidad de restaurantes donde el espacio es irregular. Las coordenadas porcentuales permiten colocar mesas donde realmente están.

---

### Separación visual interior / exterior

El mapa tiene **dos vistas separadas**, accesibles via selector (tabs horizontales o toggle en la parte superior del mapa):

- **Vista Exterior** — mesas 1–37
- **Vista Interior** — mesas 40–67
- **Mesas virtuales** — no tienen vista fija; aparecen en un panel lateral o listado separado

Cada zona tiene su propio contenedor con sus propias dimensiones y layout de mesas. Alternativamente, se puede usar un mapa único con dos "sectores" separados visualmente por un divisor.

**Decisión de diseño:** Vistas separadas en lugar de un mapa único. Razón: las zonas interior/exterior no tienen relación espacial real (una está adentro, otra afuera), por lo que un mapa unificado crearía una representación falsa. El garzón solo necesita saber en qué zona está para orientarse.

---

### Estados de mesa y representación visual

| Estado | Color | Ícono | Interactividad |
|---|---|---|---|
| `libre` | Verde | — | Tap → iniciar pedido |
| `ocupada` | Rojo | Indicador de tiempo | Tap → ver/editar pedido |
| `esperando_cierre` | Amarillo/Naranja | Reloj | Tap → ver resumen |
| `reservada` | Azul | Calendario | Tap → info reserva (futuro) |
| `virtual` | Gris punteado | Asterisco | Tap → información contextual |

La **intensidad del color** de `ocupada` puede aumentar con el tiempo transcurrido (aclarado para mesas recién ocupadas, intenso para mesas con mucho tiempo). Esto es una mejora visual futura.

**Indicador de pedido en borrador (solo en app):** Si el garzón tiene un pedido en borrador para una mesa (no enviado al PC aún), se muestra un ícono adicional sobre la mesa (ej: lápiz) para distinguirla de una mesa ocupada sin pedido en la app.

---

### Manejo de mesas virtuales (números 68+)

Las mesas virtuales son un parche del sistema actual, no una entidad de diseño. Se tratan como ciudadanos de segunda clase explícitamente:

- Columna `es_virtual = true` en la tabla `mesas`
- Columna `mesa_real_id` indica a qué mesa física corresponde (ej: virtual 68 → real 5)
- No tienen posición en el mapa de zona (no aparecen en la vista principal)
- Se listan en un panel colapsable "Mesas adicionales" al final del mapa
- Se identifican visualmente con un número entre corchetes: `[68]`, `[69]`
- Si `mesa_real_id` está definido, el panel muestra: "Mesa temporal · corresponde a mesa 5"
- El garzón puede agregar pedidos a mesas virtuales normalmente

**Flujo de resolución de mesa virtual:** Cuando el sistema del PC cierra finalmente la mesa real (ej: la 5), el garzón puede transferir el pedido de la virtual (68) a la real (5) usando la acción de transferencia de mesa. La mesa virtual queda libre y puede eliminarse o desactivarse.

**Objetivo a mediano plazo:** A medida que el sistema del restaurante cierre correctamente las mesas, las virtuales deberían desaparecer. La app facilita esto siendo explícita sobre cuáles son virtuales y ofreciendo la transferencia como acción directa.

---

### Datos estáticos vs dinámicos

| Dato | Naturaleza | Fuente Fase 1 | Fuente Fase 5+ |
|---|---|---|---|
| `numero`, `zona_id`, `pos_x`, `pos_y`, `activa` | **Estático** | Constante TypeScript | Tabla `mesas` en Supabase |
| `estado`, `garzon_id` | **Dinámico** | `useMesasStore` (solo memoria) | Tabla `estados_mesa` en Supabase |

Los datos estáticos cambian raramente (cuando se agrega una mesa real) y no necesitan Realtime.

---

### Preparación para Realtime

El store `useMesasStore` tiene la acción `suscribirRealtime()` como placeholder desde Fase 1. La implementación interna cambia en Fase 7:

```typescript
// Fase 1: no-op
suscribirRealtime: () => () => {}

// Fase 7: activación real
suscribirRealtime: () => {
  const channel = supabase
    .channel('estados-mesa')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'estados_mesa'
    }, (payload) => {
      // Actualiza el store con el nuevo estado
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}
```

**Razón de diseñar el placeholder ahora:** Los componentes que consumen `useMesasStore` no necesitan saber si el estado viene de Realtime o de una llamada local. El store es el adaptador.

---

## 6. Diseño de la Carta de Ítems

### Jerarquía de categorías

**Profundidad recomendada: 3–4 niveles de categorías** (lo que equivale a 3–4 taps hasta llegar a un ítem). No se impone un límite estricto en el esquema de DB: la tabla `categorias_carta` es autorreferencial y soporta profundidad arbitraria. La restricción es de UX, no de datos.

```
Carta
├── Bebidas                          ← nivel 1
│   ├── Calientes                    ← nivel 2
│   │   ├── Infusiones               ← nivel 3
│   │   │   ├── Té de Menta  $1.800  ← ítem
│   │   │   └── Manzanilla  $1.800
│   │   └── Cafés
│   │       └── Café Americano  $2.200
│   └── Frías
│       ├── Jugos
│       │   ├── Jugo de Naranja  $2.500
│       │   └── Jugo de Frutilla  $2.500
│       └── Aguas
│           └── Agua Mineral  $1.500
├── Entradas
│   ├── Sopas
│   └── Ensaladas
└── Platos de Fondo
    └── ...
```

**Orientación por profundidad:**
- 1–2 niveles: navegación trivial, no requiere breadcrumb
- 3–4 niveles: cómodo con breadcrumb visible y tappable (diseño objetivo)
- 5+ niveles: posible pero no recomendado; el breadcrumb se trunca y la experiencia se degrada

**Implicancia en la query:** Con profundidad arbitraria, la carga de la carta completa requiere una CTE recursiva en Supabase en lugar de dos queries simples. Esto se implementa en `cargarCarta()` a partir de Fase 5. En Fase 1 (datos estáticos), el árbol se construye en TypeScript directamente.

```sql
-- CTE recursiva para obtener el árbol completo de categorías
WITH RECURSIVE arbol AS (
  SELECT id, nombre, parent_id, orden, 0 AS profundidad
  FROM categorias_carta
  WHERE parent_id IS NULL AND activa = true
  UNION ALL
  SELECT c.id, c.nombre, c.parent_id, c.orden, a.profundidad + 1
  FROM categorias_carta c
  JOIN arbol a ON c.parent_id = a.id
  WHERE c.activa = true
)
SELECT * FROM arbol ORDER BY profundidad, orden;
```

**Categoría sin subcategorías (hoja directa):** Una categoría en cualquier nivel puede tener ítems directamente sin subcategorías hijas. El componente de lista detecta si los hijos son categorías o ítems y renderiza el componente apropiado.

---

### Modelado de disponibilidad

La disponibilidad tiene tres capas, evaluadas en orden de precedencia:

1. **`items_carta.disponible = false`** — ítem permanentemente desactivado (retirado del menú)
2. **`disponibilidad_items` con tipo `manual`** — desactivado por el admin hoy (ej: "se agotó")
3. **`disponibilidad_items` con tipo `horario`** — solo disponible en ciertas horas
4. **`disponibilidad_items` con tipo `temporada`** — solo disponible en ciertas fechas

La función `isItemDisponible(itemId)` en `useCartaStore` evalúa estas capas en orden. Si alguna regla activa marca el ítem como no disponible, retorna `false`.

**En la UI:** Los ítems no disponibles se muestran atenuados con un badge "No disponible" en lugar de ocultarse. El garzón puede verlos para responder preguntas del cliente, pero el botón "Agregar" está deshabilitado.

---

### Agregar / quitar ítem a un pedido de mesa

**Contexto:** La carta siempre se navega "desde" una mesa (ruta `mesas/[mesaId]/carta`). El `mesaId` está en la URL y es accesible en cualquier componente de la carta.

**Flujo de agregar:**
```
Garzón ve lista de ítems
  └── Tap en ítem disponible
        └── Modal de ítem se abre
              ├── Campo de notas (opcional)
              ├── Selector de cantidad
              └── Botón "Agregar al pedido"
                    └── usePedidosStore.agregarItem(mesaId, item, notas)
                          └── Modal se cierra automáticamente
                                └── Badge de cantidad en ícono de resumen se actualiza
```

**Flujo de quitar (desde resumen del pedido):**
```
Resumen del pedido (mesas/[mesaId]/index)
  └── Swipe left en línea de ítem ó botón −
        └── usePedidosStore.quitarItem(mesaId, itemId)
```

**Feedback visual:** Un badge flotante en el header del stack muestra la cantidad total de ítems en el pedido actual mientras se navega la carta. Permite al garzón saber cuántos ítems lleva sin salir de la carta.

---

### Navegación de regreso (back navigation)

La navegación usa el stack nativo de Expo Router, por lo que el botón back del header es suficiente para la mayoría de los casos.

**Breadcrumb de contexto:** Un componente de breadcrumb en el header de la carta muestra:
```
Carta > Bebidas > Jugos
```

Cada segmento es tappable para saltar niveles en lugar de hacer back consecutivos.

**Back desde el modal de ítem:** Cierra el modal (vuelve a la lista de ítems de la categoría actual). El ítem agregado refleja inmediatamente en el badge del header.

---

### Vista garzón vs vista admin

**Vista garzón (operacional):**
- Ordenada por `categorias_carta.orden` y `items_carta.orden`
- Muestra precio prominentemente
- Ítems no disponibles atenuados con badge
- Solo se puede "Agregar" ítems (no editar)
- Búsqueda rápida por nombre de ítem (campo de texto)

**Vista admin (edición):**
- Agrega acciones inline: editar nombre/precio, toggle disponibilidad, reordenar
- Botón "+" para agregar nuevo ítem en cada categoría
- Acceso a gestión de categorías (agregar/renombrar/reordenar)
- Visualiza ítems desactivados con indicador claro
- No muestra el flujo de agregar a pedido

Las dos vistas comparten el mismo árbol de rutas base. La diferencia es que el layout de `(admin)/carta` carga componentes de edición adicionales y los componentes de ítem tienen versión "editable" activada por prop.

---

### Consideraciones para carta digital de clientes (futuro)

El modelo de datos ya soporta esto sin cambios:
- `items_carta.foto_url` ya está modelado
- `items_carta.descripcion` ya está modelado
- La jerarquía de categorías es la misma

Lo que cambia es una nueva app/módulo de cliente (no parte de GarzonApp) que consume los mismos datos con vista de solo lectura. La carta de cliente no requiere autenticación, por lo que se configuraría RLS con acceso anónimo a `items_carta` e `categorias_carta` donde `disponible = true`.

---

## 7. Flujos de Usuario Principales

### Flujo del Garzón

#### Inicio de turno

```
1. Abre GarzonApp
2. Pantalla de login (si sesión expirada)
   → Ingresa email + contraseña
3. Mapa de mesas carga
   → cargarMesas() hidrata datos de posición
   → estadosMesa inicializa en 'libre' para todas (Fase 1)
   → cargarCarta() hidrata carta desde caché o estáticos
4. Garzón hace reconocimiento visual: qué mesas tiene asignadas
```

#### Tomar pedido de una mesa nueva

```
1. Ve mesa en estado 'libre' en el mapa
2. Tap en mesa → pantalla de detalle (mesas/[mesaId])
3. Pedido vacío: banner "Sin pedido activo"
4. Tap "Iniciar pedido"
   → usePedidosStore.iniciarPedido(mesaId)
   → useMesasStore.actualizarEstadoMesa(mesaId, 'ocupada')
5. Tap "Agregar ítems" → navega a carta (mesas/[mesaId]/carta)
6. Navega categorías → selecciona ítems → completa notas si necesario
7. Tap "Agregar" por cada ítem
8. Back al resumen: verifica que el pedido sea correcto
9. Va al PC del restaurante
10. Ingresa código de garzón → selecciona mesa → navega menú del PC → envía ticket
11. Vuelve a la app
12. Tap "Marcar como enviado"
    → usePedidosStore.marcarComoEnviado(mesaId)
    → Estado visual del pedido cambia a 'enviado'
```

#### Agregar ítems a una mesa con pedido activo

```
1. Tap en mesa en estado 'ocupada'
2. Pantalla de detalle muestra pedido existente (enviado)
3. Tap "Agregar más ítems"
4. Navega carta → agrega ítems
5. Nuevo sub-resumen de "ítems agregados" diferencia los nuevos
6. Va al PC → agrega ítems adicionales → envía nuevo ticket
7. Marca nuevos ítems como enviados en la app
```

**Decisión de diseño:** El pedido en la app no tiene límite de "sub-pedidos". Los ítems se agregan secuencialmente. Es responsabilidad del garzón registrar cada grupo de ítems en el PC cuando corresponda. La app no fuerza un flujo en este aspecto.

#### Transferir mesa

Este flujo cubre dos situaciones: cliente que pide cambiar de mesa por comodidad, y resolución de una mesa virtual cuando la mesa real queda disponible.

```
1. Tap en mesa con pedido activo (ocupada)
2. Pantalla de detalle → botón "Transferir mesa" (en menú de acciones o header)
3. Se abre selector de mesa destino:
   → Muestra solo mesas en estado 'libre'
   → Vista de mapa en miniatura o lista, filtrable por zona
4. Garzón selecciona mesa destino
5. Confirmación: "¿Transferir pedido de mesa 5 a mesa 12?"
6. Tap "Confirmar"
   → usePedidosStore.transferirMesa(mesaOrigenId, mesaDestinoId)
        ├── Mueve el PedidoLocal de mesaOrigen a mesaDest en el store
        ├── useMesasStore.actualizarEstadoMesa(mesaOrigenId, 'libre')
        └── useMesasStore.actualizarEstadoMesa(mesaDestinoId, 'ocupada')
7. App navega al detalle de la nueva mesa
8. El garzón indica al cliente la nueva mesa
```

**Restricción:** Solo se puede transferir a una mesa libre. Si la mesa destino está ocupada, el selector no la muestra. En Fase 5+, la acción hace la transferencia en Supabase como transacción atómica para evitar condiciones de carrera.

**Caso mesa virtual → mesa real:** Mismo flujo. El garzón selecciona la mesa real como destino. Si la mesa virtual tiene `mesa_real_id` definido, esa mesa real aparece destacada en el selector como sugerencia.

---

#### Consultar resumen de pedido de una mesa

```
1. Tap en mesa ocupada
2. Pantalla de detalle:
   → Lista completa de ítems (cantidad, nombre, precio unitario)
   → Subtotal por ítem
   → Total acumulado
   → Badge de estado (borrador / enviado)
3. Solo lectura; no se modifican ítems enviados
   (solo se agregan nuevos)
```

#### Registrar pedido en el PC (flujo que la app apoya)

La app no replica ni reemplaza el PC. Su rol es:
- Tener el resumen del pedido disponible para transcribirlo con menos errores
- Saber exactamente qué pedir sin volver a la mesa
- Evitar confusión de número de mesa

El flujo en el PC es del sistema actual y no cambia.

#### Fin de turno

```
1. Tap en tab "Perfil"
2. Verifica que no tiene pedidos activos en borrador
   → Si hay: se muestra advertencia con lista de mesas pendientes
3. Tap "Cerrar sesión"
   → useAuthStore.logout()
   → Limpia pedidos activos del AsyncStorage
   → Redirige a pantalla de login
```

---

### Flujo del Admin

#### Gestión de carta (agregar / editar / desactivar ítem)

```
Agregar ítem:
1. Tab Admin → Carta
2. Navega hasta la categoría destino
3. Tap "+" al final de la lista de ítems
4. Modal: nombre, precio, descripción, foto (opcional), categoría
5. Tap "Guardar" → POST a items_carta en Supabase
6. Ítem aparece al final de la lista (orden = último)

Editar ítem:
1. Tap en ítem en vista admin
2. Modal de edición pre-poblado
3. Modifica campos → "Guardar" → PUT a items_carta

Desactivar ítem permanentemente:
1. Editar ítem → toggle "Activo" → OFF
2. Ítem pasa a estar no disponible para todos
3. Aparece atenuado con badge "Desactivado"
```

#### Gestión de disponibilidad de ítems

```
1. Tab Admin → Disponibilidad
2. Lista de ítems con estado actual de disponibilidad
3. Filtros: por categoría, por estado, por tipo de regla
4. Acciones rápidas:
   → Toggle "disponible hoy" → crea regla tipo 'manual'
   → Configurar horario → formulario hora_inicio / hora_fin
   → Configurar temporada → formulario fecha_inicio / fecha_fin
5. Las reglas activas se listan bajo cada ítem
6. Eliminar regla: swipe o botón borrar
```

#### Gestión de perfiles de garzones

```
Crear garzón:
1. Tab Admin → Usuarios → Tap "+"
2. Formulario: nombre, email, código_garzon (2 dígitos, único)
3. Tap "Crear"
   → supabase.auth.admin.createUser() (desde función Edge o con service role)
   → Inserta fila en usuarios con rol 'garzon'
4. El garzón recibe email de bienvenida con link de seteo de contraseña

Desactivar garzón:
1. Tap en garzón → toggle "Activo" → OFF
2. UPDATE usuarios SET activo = false
3. El garzón no puede hacer login (RLS lo bloquea a nivel de app;
   para bloqueo real se usa supabase.auth.admin.updateUserById)

Ver actividad del garzón:
1. Tap en garzón → historial de pedidos
2. Lista de pedidos creados por ese garzon_id
```

---

## 8. Estrategia de Datos

### Posiciones del mapa de mesas

| | Fase 1–4 | Fase 5+ | Impacto de la migración |
|---|---|---|---|
| **Dónde vive** | Constante TypeScript en `constants/mesas.ts` | Tabla `mesas` en Supabase | `cargarMesas()` cambia de importar la constante a hacer fetch a Supabase. El resto del código no cambia. |
| **Por qué migrar** | Cuando el admin necesite ajustar posiciones sin redesplegar la app | — | — |
| **Riesgo** | Bajo: migrar los datos estáticos a DB es un seed script de una sola vez | — | — |

---

### Carta de ítems

| | Fase 1–3 | Fase 4 | Fase 5+ |
|---|---|---|---|
| **Dónde vive** | Constante TypeScript en `constants/carta.ts` | AsyncStorage (caché de la constante) | Tabla `items_carta` + `categorias_carta` en Supabase |
| **Por qué migrar a AsyncStorage** | Persistir la carta entre sesiones sin refetch | — | — |
| **Por qué migrar a Supabase** | Cuando admin necesite editar la carta sin redesplegar | — | — |
| **Impacto** | `cargarCarta()` cambia implementación. El store y la UI no cambian | — | — |

---

### Disponibilidad de ítems

| | Fase 1–4 | Fase 5+ |
|---|---|---|
| **Dónde vive** | Parte de la constante de carta (campo `disponible: boolean` hardcodeado) | Tabla `disponibilidad_items` en Supabase; evaluada por función en `useCartaStore` |
| **Por qué migrar** | Cuando se necesite gestión en tiempo real por admin sin redesplegar | — |
| **Impacto** | `isItemDisponible()` cambia de leer el campo estático a evaluar reglas de Supabase. Cambio localizado en el store. | — |

---

### Pedidos activos

| | Fase 1–4 | Fase 5+ |
|---|---|---|
| **Dónde vive** | Zustand + AsyncStorage (solo en el dispositivo) | Supabase (`pedidos` + `pedido_items`) + Zustand como caché |
| **Por qué migrar** | Sincronización entre dispositivos; persistencia en servidor | — |
| **Impacto** | Las acciones del store (`iniciarPedido`, `agregarItem`) agregan llamadas a Supabase. Se introduce manejo de errores de red y optimistic updates. Este es el cambio de mayor impacto del proyecto. | — |

**Estrategia de migración sin disruption:** En Fase 5, la acción `agregarItem` primero actualiza el store local (optimistic) y luego persiste en Supabase en background. Si la llamada a Supabase falla, se marca el ítem como "pendiente de sync" y se reintenta.

---

### Historial de pedidos

| | Fase 1–4 | Fase 5+ |
|---|---|---|
| **Dónde vive** | No existe (los pedidos cerrados se eliminan del store) | Tabla `pedidos` con estado `cerrado` en Supabase |
| **Por qué migrar** | Análisis, reportes, disputas de cuenta | — |
| **Impacto** | `cerrarPedido()` en el store agrega llamada a Supabase para marcar el pedido como cerrado en lugar de eliminarlo | — |

---

### Usuarios / roles

| | Fase 1 | Fase 2+ |
|---|---|---|
| **Dónde vive** | Supabase Auth + tabla `usuarios` desde el primer día | — (ya está en Supabase) |
| **Por qué desde el inicio** | Los roles afectan la UI y RLS desde el primer login. No tiene sentido diferir esto. | — |

---

## 9. Estrategia de Sincronización Futura

### Qué tablas necesitan Realtime

| Tabla | Necesita Realtime | Prioridad | Razón |
|---|---|---|---|
| `estados_mesa` | **Sí** | Alta | El mapa de mesas debe reflejar cambios de otros dispositivos en tiempo real |
| `pedidos` | **Sí** | Media | Para que el supervisor o barra vea pedidos entrantes |
| `pedido_items` | **Sí** | Media | Para cocina/barra en Fase futura |
| `items_carta` | **Sí, con baja frecuencia** | Baja | Admin cambia disponibilidad; garzones ven el cambio sin reiniciar la app |
| `mesas` | **No** | — | Cambios muy infrecuentes; reinicio de app es suficiente |
| `usuarios` | **No** | — | No se necesita Realtime en perfiles |

---

### Eventos que deben propagarse entre dispositivos

| Evento | Fuente | Receptor | Payload mínimo |
|---|---|---|---|
| Mesa cambia a ocupada | Garzón A | Todos los dispositivos | `{mesa_id, estado, garzon_id}` |
| Mesa cambia a libre | Admin / sistema | Todos los dispositivos | `{mesa_id, estado}` |
| Ítem nuevo pedido | Garzón A | Panel barra/cocina (futuro) | `{pedido_id, item_id, cantidad}` |
| Ítem desactivado | Admin | Todos los garzones | `{item_id, disponible: false}` |

Supabase Realtime con `postgres_changes` emite estas actualizaciones automáticamente cuando se hace UPDATE en las tablas correspondientes. No se requiere un servicio de eventos separado.

---

### Manejo de conflictos

**Conflicto más probable:** Dos garzones intentan asignar la misma mesa (libre) simultáneamente.

**Estrategia: optimistic lock vía `updated_at`**

```sql
UPDATE estados_mesa
SET estado = 'ocupada', garzon_id = $1, updated_at = now()
WHERE mesa_id = $2
  AND estado = 'libre'
  AND updated_at = $3  -- timestamp que el cliente leyó
RETURNING *;
```

Si el UPDATE retorna 0 filas, significa que otro dispositivo modificó la mesa primero. La app muestra un error: "Esta mesa ya fue tomada por otro garzón. El mapa se actualizará."

**Conflicto de ítems en pedido:** En Fase 1 no existe porque los pedidos son locales por dispositivo. En Fase 5+, el modelo de `pedido_items` como tabla append-only (no se actualizan líneas, se insertan nuevas) minimiza conflictos. El único conflicto real sería si dos garzones editan la cantidad del mismo `pedido_item.id`, lo cual no debería ocurrir en el flujo normal (un pedido pertenece a un garzón).

---

### Cómo el modelo de Fase 1 facilita o dificulta la sincronización

**Facilita:**
- La separación de `estados_mesa` de `mesas` es exactamente lo que Realtime necesita: una tabla pequeña con cambios frecuentes donde cada fila corresponde a una entidad observable.
- Los UUIDs como PKs son amigables con Realtime (no hay colisiones en generación distribuida).
- El store de Zustand ya tiene la interfaz correcta (`suscribirRealtime` como placeholder).
- El modelo de `pedido_items` es append-mostly, lo que facilita la sincronización incremental.

**Dificulta / requiere atención:**
- Los pedidos en AsyncStorage (Fase 1) y los pedidos en Supabase (Fase 5) son dos fuentes de verdad durante la migración. Se necesita una estrategia de reconciliación al activar Supabase: ¿qué pasa con pedidos locales existentes?
- Si hay pedidos locales al momento de activar Supabase, se debe implementar un proceso de migración (upload de pedidos locales al servidor la primera vez que se activa Fase 5).

---

### Cambios de arquitectura al activar sincronización

1. **Store:** `suscribirRealtime()` se implementa en `useMesasStore` y `usePedidosStore`. Las acciones que modifican estado agregan llamadas a Supabase.

2. **Gestión de conexión:** Se agrega un hook `useConexion` que detecta conectividad (`NetInfo`) y activa/desactiva el canal Realtime. En offline, el store opera localmente y hace sync cuando recupera conexión.

3. **Resolución de conflictos:** Se implementa la lógica de optimistic lock descrita arriba, con UI de feedback cuando hay conflicto.

4. **Cleanup de Realtime:** Los canales deben limpiarse en `useEffect` cleanup para evitar memory leaks. El placeholder `suscribirRealtime() => () => void` ya anticipa este patrón.

5. **Testing:** Los tests de integración deben mockear el canal de Realtime. El diseño del store facilita esto porque el canal es una implementación interna, no visible desde fuera.

---

## 10. Fases de Implementación

### Fase 1 — Fundación

**Objetivo:** Proyecto base funcional, estructura de carpetas definitiva, navegación básica entre pantallas, Supabase conectado, auth real.

**Entregables técnicos:**
- Proyecto Expo con TypeScript estricto inicializado
- Estructura de carpetas según el diseño definido
- Expo Router configurado con todos los grupos de rutas (aunque la mayoría sean pantallas vacías)
- Cliente Supabase inicializado en `lib/supabase.ts`
- `useAuthStore` funcionando con login/logout real contra Supabase
- Auth guard en root layout operativo
- EAS configurado para builds de desarrollo

**Entregables funcionales:**
- El garzón puede hacer login y logout
- La app protege rutas según sesión
- Se redirige según rol (garzón → mesas, admin → admin)

**Criterios de éxito:**
- Login funciona con usuario real en Supabase
- Intentar acceder a ruta admin con rol garzón redirige correctamente
- La sesión persiste entre cierres de app

**Dependencias:** Ninguna anterior.

---

### Fase 2 — Mapa de Mesas

**Objetivo:** Vista operacional principal con el mapa de mesas funcionando con datos estáticos.

**Entregables técnicos:**
- Datos estáticos de mesas y zonas en `constants/mesas.ts`
- `useMesasStore` con estado inicial, selección de mesa, y actualización de estado local
- Componente `MapaMesas` con posicionamiento absoluto por coordenadas porcentuales
- Componente `TarjetaMesa` con variantes visuales por estado
- Pantalla de detalle de mesa (`mesas/[mesaId]`) mostrando número, zona, estado
- Selector interior / exterior
- Panel de mesas virtuales

**Entregables funcionales:**
- El garzón ve todas las mesas posicionadas en el mapa
- Puede distinguir zonas interior y exterior
- Puede cambiar el estado de una mesa (libre → ocupada) localmente
- Puede navegar al detalle de una mesa

**Criterios de éxito:**
- Las 37 mesas exteriores y 28 interiores aparecen en sus posiciones
- Los cambios de estado se reflejan visualmente de inmediato
- El mapa es usable en dispositivos con pantalla de 6" (tamaño estándar de un smartphone)

**Dependencias:** Fase 1.

---

### Fase 3 — Carta de Ítems y Pedidos

**Objetivo:** El garzón puede navegar la carta y construir un pedido para una mesa.

**Entregables técnicos:**
- Datos estáticos de carta en `constants/carta.ts` (jerarquía categorías + ítems)
- `useCartaStore` con carga desde estáticos y queries básicas
- `usePedidosStore` con todas las acciones CRUD de ítems (sin persistencia aún)
- Árbol de rutas de carta completo (`carta/`, `carta/[categoriaId]`, modal de ítem)
- Componentes: `ListaCategorias`, `ListaItems`, `ModalItem`, `ResumenPedido`
- Badge de contador de ítems en header durante navegación de carta
- Función `isItemDisponible()` evaluando campo estático `disponible`

**Entregables funcionales:**
- El garzón puede navegar categorías y subcategorías
- Puede agregar ítems con notas y cantidad
- Puede ver el resumen del pedido con total
- Los ítems no disponibles se muestran atenuados y no se pueden agregar
- La carta es accesible tanto desde el contexto de una mesa como desde el tab standalone

**Criterios de éxito:**
- Flujo completo de tomar un pedido de 5 ítems en menos de 60 segundos (KPI operacional)
- Navegación de regreso funciona correctamente desde cualquier nivel de la carta

**Dependencias:** Fase 2.

---

### Fase 4 — Persistencia Local

**Objetivo:** Los pedidos sobreviven el cierre de la app. El garzón puede cerrar y reabrir GarzonApp sin perder su trabajo.

**Entregables técnicos:**
- Integración de AsyncStorage en `usePedidosStore` (persist middleware de Zustand)
- Integración de AsyncStorage en `useCartaStore` (caché con TTL de 24h)
- Manejo de estado de hidratación (loading state mientras se lee AsyncStorage)
- Limpieza de pedidos al hacer logout
- Migración de schema de store si el shape cambia entre versiones (versioning en Zustand persist)

**Entregables funcionales:**
- El garzón cierra la app a mitad de turno, la reabre, y sus pedidos siguen ahí
- La carta está disponible offline (cacheada)
- El logout limpia el estado del dispositivo

**Criterios de éxito:**
- Forzar cierre de app con 3 pedidos activos → reabrir → los 3 pedidos están presentes e íntegros
- La app carga en menos de 2 segundos desde caché (sin necesidad de red)

**Dependencias:** Fase 3.

---

### Fase 5 — Backend y Auth Completo

**Objetivo:** Los datos de carta, mesas y pedidos viven en Supabase. Múltiples dispositivos pueden acceder a la misma carta actualizada.

**Entregables técnicos:**
- Migraciones SQL completas para todas las tablas
- Seeds con datos reales de mesas, zonas, carta
- Políticas RLS para todas las tablas
- Trigger `handle_new_user`, `handle_updated_at`, `init_estado_mesa`
- `useCartaStore.cargarCarta()` fetching desde Supabase
- `useMesasStore.cargarMesas()` fetching desde Supabase
- `usePedidosStore` con persistencia dual (local + Supabase)
- Manejo de errores de red con estado de retry en el store

**Entregables funcionales:**
- El admin puede cambiar precios en Supabase y los garzones ven los cambios al reabrir la app
- Los pedidos se persisten en el servidor
- El auth funciona con roles reales desde la DB

**Criterios de éxito:**
- Crear un usuario garzón en Supabase → puede hacer login y tomar pedidos
- Modificar un precio en Supabase → garzón ve el precio actualizado al recargar la carta
- Un pedido persiste aunque se desinstale y reinstale la app (recuperable desde Supabase)

**Dependencias:** Fase 4.

---

### Fase 6 — Panel Admin

**Objetivo:** El admin puede gestionar la carta y los garzones desde la app, sin tocar Supabase directamente.

**Entregables técnicos:**
- Árbol de rutas admin completo
- Formularios de creación y edición de ítems (con upload de foto a Supabase Storage)
- UI de gestión de disponibilidad (reglas manuales, horario, temporada)
- Gestión de usuarios garzones (crear, desactivar)
- Validación de formularios con Zod o similar

**Entregables funcionales:**
- Admin agrega un ítem nuevo desde la app → garzones lo ven de inmediato
- Admin desactiva un ítem → aparece como no disponible para garzones
- Admin crea un garzón nuevo → puede hacer login desde su dispositivo

**Criterios de éxito:**
- Flujo completo de agregar ítem nuevo (con foto) en menos de 2 minutos
- La foto del ítem se muestra en la app del garzón sin reiniciar

**Dependencias:** Fase 5.

---

### Fase 7 — Realtime

**Objetivo:** Múltiples garzones ven el mismo estado de mesas en tiempo real. Los cambios de un dispositivo se propagan a todos.

**Entregables técnicos:**
- Activación de `suscribirRealtime()` en `useMesasStore`
- Suscripción a `estados_mesa` vía `supabase.channel`
- Activación de Realtime en `useCartaStore` para cambios de disponibilidad
- Hook `useConexion` para gestión offline/online
- Lógica de optimistic lock en `actualizarEstadoMesa`
- UI de conflicto cuando mesa ya fue tomada
- Cleanup de canales en unmount

**Entregables funcionales:**
- Garzón A ocupa una mesa → Garzón B la ve ocupada en menos de 1 segundo
- Admin desactiva un ítem → todos los garzones lo ven desactivado sin recargar
- Si dos garzones intentan tomar la misma mesa, el segundo recibe feedback claro

**Criterios de éxito:**
- Latencia de propagación de cambio de estado de mesa < 1 segundo en red local
- No hay estados inconsistentes en el mapa entre dispositivos tras 10 minutos de uso simultáneo

**Dependencias:** Fase 5.

---

### Fase 8 — Pulido y Deploy

**Objetivo:** La app está lista para uso operacional diario. Distribuida internamente a los garzones del restaurante.

**Entregables técnicos:**
- EAS Build configurado para distribución interna (Internal Distribution)
- Splash screen y ícono finales
- Manejo de errores global (ErrorBoundary, feedback de red)
- Optimización de performance del mapa de mesas (memoización)
- Logging de errores (Sentry u otro)
- Documentación de onboarding para nuevos garzones
- OTA updates configuradas (expo-updates) para correcciones sin redeploy de stores

**Entregables funcionales:**
- Cualquier garzón puede instalar la app desde un link interno (sin App Store)
- La app funciona sin interrupciones en un turno completo de 8 horas
- Los errores se reportan automáticamente al equipo de desarrollo

**Criterios de éxito:**
- 0 crashes durante una semana de uso en turno real
- Instalación en dispositivo nuevo en menos de 5 minutos
- Tiempo de inicio de la app < 3 segundos (dispositivo frío)

**Dependencias:** Fase 7.

---

## Resumen de Decisiones de Diseño Clave

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Separar `estados_mesa` de `mesas` | Campo `estado` en la tabla `mesas` | Facilita Realtime: tabla pequeña, alta frecuencia de cambio, suscripción más eficiente |
| Coordenadas porcentuales para el mapa | Grid de celdas | Refleja la irregularidad real del espacio; no impone que todas las mesas sean del mismo tamaño |
| Profundidad de carta sin límite estricto (recomendada 3–4) | Límite hard en DB | El esquema autorreferencial ya soporta profundidad arbitraria; la restricción es de UX y se gestiona con breadcrumb obligatorio |
| Modal para detalle de ítem | Pantalla completa | El garzón frecuentemente solo consulta precio/foto sin intención de agregar |
| Precio inmutable en `pedido_items` | Calcular desde `items_carta.precio` | Protege el historial de cambios de precios futuros |
| Email + password para auth | Código PIN de 2 dígitos | El código de 2 dígitos es del sistema del PC (no reemplazable); la app usa auth moderna |
| Vistas separadas interior/exterior | Mapa único | Las zonas no tienen relación espacial real; un mapa único crearía una representación falsa |
| AsyncStorage para pedidos activos | Solo en memoria | Los garzones cierran la app accidentalmente; la pérdida de pedidos es inaceptable |

---

*Documento de arquitectura GarzonApp — Fase de planificación*
*Revisión: antes de iniciar código, validar posiciones de mesas con el personal del restaurante*
